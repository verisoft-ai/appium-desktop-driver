# IE DOM Bridge — Implementation Spec

Replaces the abandoned `IEDriverServer`/`JWProxy` approach with a
direct Win32/COM bridge that attaches to an already-running IE
process via HWND, extracts `IHTMLDocument2`, and routes all element
commands through it.

## Table of Contents

- [Directory Layout](#directory-layout)
- [Architecture Overview](#architecture-overview)
- [32 / 64-Bit Detection](#32--64-bit-detection)
- [Layer 1 — C# Bridge Process](#layer-1--c-bridge-process)
- [Layer 2 — TypeScript Session Wrapper](#layer-2--typescript-session-wrapper)
- [Layer 3 — Driver Class Changes](#layer-3--driver-class-changes)
- [Layer 4 — Element Command Routing](#layer-4--element-command-routing)
- [Layer 4b — Navigation and Page Commands](#layer-4b--navigation-and-page-commands)
- [Layer 5 — ie-session.ts Replacement](#layer-5--ie-sessionts-replacement)
- [Layer 6 — app.ts Call Sites](#layer-6--appts-call-sites)
- [Build and Package](#build-and-package)
- [Proxy Blueprint](#proxy-blueprint)
- [Error Taxonomy](#error-taxonomy)
- [Sharp Edges and Invariants](#sharp-edges-and-invariants)

---

## Directory Layout

```text
csharp/
  IEBridge/
    IEBridge.cs          ← single-file C# bridge (all commands)
    IEBridge.csproj      ← targets net481, two publish profiles
    IEBridge_x64.exe     ← publish output (committed / bundled)
    IEBridge_x86.exe     ← publish output (committed / bundled)

lib/
  ie/
    session.ts           ← IESession class + session registry
    win32.ts             ← IsWow64Process detection (koffi)
  commands/
    ie-session.ts        ← REPLACE existing file entirely
    element.ts           ← add IE routing guards (existing file)
    app.ts               ← s/enableIEProxy/enableIEMode (existing)
  driver.ts              ← new fields; findElOrEls IE branch
```

`iedriver/` folder (existing) stays for the bundled executables.
Add `iebridge/` alongside it for the two compiled `IEBridge` exes.

---

## Architecture Overview

```text
app.ts (6 call sites)
  └── enableIEMode(hwnd)           [lib/commands/ie-session.ts]
        ├── detectBitness(hwnd)    [lib/ie/win32.ts]
        └── new IESession(hwnd, bitness)  [lib/ie/session.ts]
              └── spawn IEBridge_{x64|x86}.exe
                    stdio JSON protocol

driver.ts :: findElOrEls
  ├── if (this.ieContext) → this.ieSession.find*(...)
  └── else               → this.sendCommand(...)  [UIA path]

element.ts :: click / getText / setValue / getAttribute / ...
  ├── if (this.ieContext) → this.ieSession.*
  └── else               → this.sendCommand(...)  [UIA path]
```

The IE bridge **never** starts `IEDriverServer.exe` or creates a
`JWProxy`. There is no HTTP proxy layer. Commands go directly over
stdio to the C# companion process.

---

## 32 / 64-Bit Detection

IE11 on Windows 10/11 runs:

- Frame process (`IEFrame`): **64-bit**
- Each tab process (`iexplore.exe`): **32-bit** (WOW64)

`ObjectFromLresult` must be called from a process whose bitness
matches the **tab** process that owns `Internet Explorer_Server`.
Spawning the wrong bitness silently fails — `ObjectFromLresult`
returns `E_FAIL`.

### Detection flow

```typescript
// lib/ie/win32.ts

import { load, pointer, opaque, alias, types } from 'koffi';

const kernel32 = load('kernel32.dll');

const HANDLE = pointer('IE_HANDLE', opaque());
const BOOL   = alias('IE_BOOL', types.bool);

const OpenProcess = kernel32.func(
  `void* __stdcall OpenProcess(
     uint dwDesiredAccess,
     bool bInheritHandle,
     uint dwProcessId
   )`
) as (access: number, inherit: boolean, pid: number) => unknown;

const IsWow64Process = kernel32.func(
  `bool __stdcall IsWow64Process(void* hProcess, bool* Wow64Process)`
) as (h: unknown, out: boolean[]) => boolean;

const CloseHandle = kernel32.func(
  `bool __stdcall CloseHandle(void* hObject)`
) as (h: unknown) => boolean;

const PROCESS_QUERY_INFORMATION = 0x0400;

export function isProcessWow64(pid: number): boolean {
  const h = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid);
  if (!h) return false;
  try {
    const out: boolean[] = [false];
    IsWow64Process(h, out);
    return out[0];
  } finally {
    CloseHandle(h);
  }
}

export function bridgeBitness(pid: number): '32' | '64' {
  return isProcessWow64(pid) ? '32' : '64';
}
```

`GetWindowThreadProcessId` is already exported from
`lib/winapi/user32.ts` — use it to resolve HWND → PID before
calling `bridgeBitness`.

---

## Layer 1 — C# Bridge Process

### Project file

```xml
<!-- csharp/IEBridge/IEBridge.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net481</TargetFramework>
    <Nullable>enable</Nullable>
    <AllowUnsafeBlocks>false</AllowUnsafeBlocks>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="Microsoft.mshtml">
      <HintPath>
        $(MSBuildProgramFiles32)\Microsoft.NET\Primary Interop
        Assemblies\Microsoft.mshtml.dll
      </HintPath>
    </Reference>
  </ItemGroup>
</Project>
```

Publish profiles (in `.csproj` or separate pubxml):

- `win-x64` → `iebridge/IEBridge_x64.exe` (self-contained = false)
- `win-x86` → `iebridge/IEBridge_x86.exe` (self-contained = false)

Both target `net481` which ships with Windows 10/11. No runtime
install is needed.

### Wire protocol

One JSON object per line. Driver → Bridge direction:

```json
{"seq":1,"cmd":"findElementById","hwnd":131234,"value":"loginBtn"}
```

Bridge → Driver response:

```json
{"seq":1,"ok":true,"elementId":"ie-1"}
```

On error:

```json
{"seq":1,"ok":false,"error":"NO_SUCH_ELEMENT"}
```

`seq` is echoed back so the TypeScript side can match async
pending callbacks.

### P/Invoke signatures

```csharp
// csharp/IEBridge/IEBridge.cs

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;
using mshtml;

[STAThread]   // required — IHTMLDocument2 is STA COM
static void Main()
{
    WM_HTML_GETOBJECT = RegisterWindowMessage("WM_HTML_GETOBJECT");

    string? line;
    while ((line = Console.ReadLine()) != null)
    {
        try
        {
            var req  = JsonSerializer.Deserialize<Cmd>(line)!;
            var resp = Dispatch(req);
            Console.WriteLine(JsonSerializer.Serialize(resp));
            Console.Out.Flush();
        }
        catch (Exception ex)
        {
            Console.WriteLine(
              JsonSerializer.Serialize(
                new Resp { ok = false, error = ex.Message }));
            Console.Out.Flush();
        }
    }
}

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
static extern uint RegisterWindowMessage(string msg);

[DllImport("user32.dll", SetLastError = true,
           CharSet = CharSet.Unicode)]
static extern IntPtr FindWindowEx(
    IntPtr hParent, IntPtr hAfter,
    string lpClass, string? lpTitle);

// Walk entire subtree, not just direct children.
// IE tab hierarchy: IEFrame → TabWindowClass → ... →
// Internet Explorer_Server
[DllImport("user32.dll")]
static extern bool EnumChildWindows(
    IntPtr hwnd,
    EnumChildProc lpEnumFunc,
    IntPtr lParam);

delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);

[DllImport("user32.dll", SetLastError = true)]
static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg,
    IntPtr wParam, IntPtr lParam,
    uint fuFlags, uint uTimeout,
    out IntPtr lpdwResult);

[DllImport("oleacc.dll")]
static extern int ObjectFromLresult(
    IntPtr lResult,
    [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
    IntPtr wParam,
    [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);
```

### Document acquisition

```csharp
static readonly Guid IID_IHTMLDocument2 =
    new Guid("332C4425-26CB-11D0-B483-00C04FD90119");

static uint WM_HTML_GETOBJECT;
const uint SMTO_ABORTIFHUNG = 0x0002;
const uint SMTO_TIMEOUT_MS  = 5000;

static IHTMLDocument2? GetDocument(IntPtr topHwnd)
{
    // Recursive search — tab hierarchy depth varies
    IntPtr ieServer = IntPtr.Zero;
    EnumChildWindows(topHwnd, (hwnd, _) =>
    {
        var buf = new System.Text.StringBuilder(64);
        GetClassName(hwnd, buf, 64);
        if (buf.ToString() == "Internet Explorer_Server")
        {
            ieServer = hwnd;
            return false;   // stop enumeration
        }
        return true;
    }, IntPtr.Zero);

    if (ieServer == IntPtr.Zero) return null;

    IntPtr lResult;
    IntPtr rc = SendMessageTimeout(
        ieServer, WM_HTML_GETOBJECT,
        IntPtr.Zero, IntPtr.Zero,
        SMTO_ABORTIFHUNG, SMTO_TIMEOUT_MS,
        out lResult);

    if (rc == IntPtr.Zero || lResult == IntPtr.Zero) return null;

    int hr = ObjectFromLresult(
        lResult, IID_IHTMLDocument2,
        IntPtr.Zero, out object raw);

    return (hr == 0 && raw is IHTMLDocument2 doc) ? doc : null;
}

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
static extern int GetClassName(
    IntPtr hWnd,
    System.Text.StringBuilder buf,
    int maxCount);
```

### Element registry

```csharp
// Elements cannot cross the stdio boundary. Map to opaque IDs.
static readonly Dictionary<string, IHTMLElement> _elems = new();
static int _seq = 0;

static string Register(IHTMLElement el)
{
    string id = $"ie-{++_seq}";
    _elems[id] = el;
    return id;
}

// Re-validate: navigation invalidates all prior elements.
static IHTMLElement? Resolve(string id)
{
    if (!_elems.TryGetValue(id, out var el)) return null;
    try { _ = el.tagName; return el; }  // throws if stale
    catch { _elems.Remove(id); return null; }
}

// Call on every navigate command.
static void FlushElements() => _elems.Clear();
```

### Command dispatcher

```csharp
static Resp Dispatch(Cmd req)
{
    if (req.cmd == "clearElements")
    { FlushElements(); return Ok(); }

    var doc = GetDocument(new IntPtr(req.hwnd));
    if (doc == null)
        return Err("IE_DOCUMENT_NOT_FOUND");

    return req.cmd switch
    {
        "getTitle"     => Ok("title",   doc.title),
        "getUrl"       => Ok("url",     doc.url),
        "getSource"    =>
            Ok("source", doc.documentElement?.outerHTML ?? ""),
        "navigate"     =>
            Navigate(doc, req.value!),
        "findElementById"    =>
            FindById(doc, req.value!),
        "findElementsByCss"  =>
            FindByCss(doc, req.value!, multi: false),
        "findElementsCssAll" =>
            FindByCss(doc, req.value!, multi: true),
        "findElementByXpath" =>
            FindByXpath(doc, req.value!, multi: false),
        "findElementsByXpath" =>
            FindByXpath(doc, req.value!, multi: true),
        "click"        => ClickEl(doc, req.elementId!),
        "getValue"     => GetVal(doc, req.elementId!),
        "setValue"     => SetVal(doc, req.elementId!, req.value!),
        "clear"        => SetVal(doc, req.elementId!, ""),
        "getText"      => GetText(doc, req.elementId!),
        "getAttribute" =>
            GetAttr(doc, req.elementId!, req.name!),
        "isDisplayed"  => IsDisplayed(doc, req.elementId!),
        "isEnabled"    => IsEnabled(doc, req.elementId!),
        "isSelected"   => IsSelected(doc, req.elementId!),
        "executeScript" =>
            ExecScript(doc, req.script!, req.args ?? "[]"),
        _ => Err($"UNKNOWN_CMD:{req.cmd}")
    };
}
```

### Find implementations

```csharp
static Resp FindById(IHTMLDocument2 doc, string id)
{
    var el = doc.getElementById(id) as IHTMLElement;
    return el == null
        ? Err("NO_SUCH_ELEMENT")
        : Ok("elementId", Register(el));
}

static Resp FindByCss(
    IHTMLDocument2 doc, string css, bool multi)
{
    if (doc is not IHTMLDocument6 doc6)
        return Err("QUERY_SELECTOR_UNSUPPORTED");
    if (multi)
    {
        var list = doc6.querySelectorAll(css);
        var ids  = new List<string>();
        for (int i = 0; i < list.length; i++)
            ids.Add(Register((IHTMLElement)list.item(i)));
        return Ok("elementIds", ids);
    }
    var single = doc6.querySelector(css) as IHTMLElement;
    return single == null
        ? Err("NO_SUCH_ELEMENT")
        : Ok("elementId", Register(single));
}

// XPath via in-page script execution.
// Falls back naturally when IE's JScript engine handles evaluate().
static Resp FindByXpath(
    IHTMLDocument2 doc, string xpath, bool multi)
{
    string script = multi
        ? $"(function(){{var r=[];"
          + $"var s=document.evaluate({JsonEscape(xpath)},"
          + $"document,null,5,null);"  // 5 = ORDERED_NODE_SNAPSHOT
          + $"for(var i=0;i<s.snapshotLength;i++)"
          + $"r.push(s.snapshotItem(i));"
          + $"return r;}})();"
        : $"document.evaluate({JsonEscape(xpath)},"
          + $"document,null,9,null).singleNodeValue;";
          // 9 = FIRST_ORDERED_NODE_TYPE

    // ExecScript returns VARIANT; collect registered IDs via
    // a second round-trip that reads window.__iebridge_result
    // set by the script above.
    // Implementation detail: wrap the script to store result,
    // then call getProperty("__iebridge_result") to retrieve it.
    // See ExecScript implementation below.
    return ExecScriptElements(doc, script, multi);
}
```

### Interaction implementations

```csharp
static Resp ClickEl(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    try { el.click(); return Ok(); }
    catch (Exception ex) { return Err(ex.Message); }
}

static Resp GetVal(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    string? val = el switch
    {
        IHTMLInputElement    inp => inp.value,
        IHTMLTextAreaElement ta  => ta.value,
        _                        => null,
    };
    return val != null ? Ok("value", val)
        : Err("ELEMENT_NOT_INTERACTABLE");
}

static Resp SetVal(IHTMLDocument2 doc, string id, string v)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    try
    {
        switch (el)
        {
            case IHTMLInputElement    inp: inp.value = v; break;
            case IHTMLTextAreaElement ta:  ta.value  = v; break;
            default: return Err("ELEMENT_NOT_INTERACTABLE");
        }
        return Ok();
    }
    catch (Exception ex) { return Err(ex.Message); }
}

static Resp GetText(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    return Ok("text", el.innerText ?? "");
}

static Resp GetAttr(IHTMLDocument2 doc, string id, string name)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    return Ok("value", el.getAttribute(name, 0)?.ToString());
}

static Resp IsDisplayed(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    if (el is IHTMLElement2 el2)
    {
        var style = el2.currentStyle;
        bool hidden = style?.display == "none"
                   || style?.visibility == "hidden";
        return Ok("value", !hidden);
    }
    return Ok("value", true);
}

static Resp IsEnabled(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    var disabled = el.getAttribute("disabled", 0);
    return Ok("value", disabled == null
        || disabled.ToString() == "");
}

static Resp IsSelected(IHTMLDocument2 doc, string id)
{
    var el = Resolve(id);
    if (el == null) return Err("STALE_ELEMENT_REFERENCE");
    bool sel = el switch
    {
        IHTMLInputElement inp =>
            inp.type?.ToLower() == "checkbox" ? inp.@checked == true
          : inp.type?.ToLower() == "radio"    ? inp.@checked == true
          : false,
        IHTMLOptionElement opt => opt.selected == true,
        _ => false,
    };
    return Ok("value", sel);
}

static Resp Navigate(IHTMLDocument2 doc, string url)
{
    FlushElements();
    (doc.parentWindow as IHTMLWindow2)?.navigate(url);
    return Ok();
}

static Resp ExecScript(
    IHTMLDocument2 doc, string script, string argsJson)
{
    try
    {
        var win = doc.parentWindow as IHTMLWindow2;
        win?.execScript(script, "JScript");
        return Ok("result", null);
    }
    catch (Exception ex) { return Err(ex.Message); }
}
```

### Response DTOs

```csharp
record Cmd(
    int    seq,
    string cmd,
    long   hwnd,
    string? value     = null,
    string? elementId = null,
    string? name      = null,
    string? script    = null,
    string? args      = null
);

record Resp
{
    public int     seq   { get; init; }
    public bool    ok    { get; init; }
    public string? error { get; init; }
    // extra payload fields serialised by callers below
}
```

Use `System.Text.Json` for serialisation. Helper builders:

```csharp
static Resp Ok() => new Resp { ok = true };
static Resp Ok(string key, object? val) => /* extend Resp */;
static Resp Err(string msg) => new Resp { ok = false, error = msg };
```

---

## Layer 2 — TypeScript Session Wrapper

**File:** `lib/ie/session.ts`

```typescript
import { ChildProcess, spawn } from 'child_process';
import { createInterface }     from 'readline';
import path                    from 'node:path';
import { logger, node }        from '@appium/support';
import { errors, W3C_ELEMENT_KEY } from '@appium/base-driver';
import { MODULE_NAME }         from '../util';

const log = logger.getLogger('IESession');

function bridgeExePath(bitness: '32' | '64'): string {
  const root = node.getModuleRootSync(MODULE_NAME, __filename);
  if (!root) throw new Error('Cannot resolve module root');
  return path.join(root, 'iebridge',
    `IEBridge_x${bitness}.exe`);
}

type Pending = {
  resolve: (v: Record<string, unknown>) => void;
  reject:  (e: Error) => void;
};

export class IESession {
  private proc:    ChildProcess;
  private pending: Map<number, Pending> = new Map();
  private seq = 0;

  constructor(
    private readonly hwnd: number,
    bitness: '32' | '64',
  ) {
    const exe = bridgeExePath(bitness);
    this.proc = spawn(exe, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on('line', (line) => {
      let resp: Record<string, unknown>;
      try { resp = JSON.parse(line); }
      catch { return; }

      const s  = resp['seq'] as number;
      const cb = this.pending.get(s);
      if (!cb) return;
      this.pending.delete(s);

      if (resp['ok']) { cb.resolve(resp); }
      else {
        cb.reject(new Error(String(resp['error'] ?? 'IE_ERROR')));
      }
    });

    this.proc.on('exit', () => {
      for (const cb of this.pending.values())
        cb.reject(new Error('IEBridge process exited'));
      this.pending.clear();
    });
  }

  private send(
    cmd: string,
    extra: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const seq = ++this.seq;
      this.pending.set(seq, { resolve, reject });
      this.proc.stdin!.write(
        JSON.stringify({ seq, cmd, hwnd: this.hwnd, ...extra })
        + '\n',
      );
    });
  }

  // ── Finders ────────────────────────────────────────────────

  async findElement(
    strategy: string, value: string,
  ): Promise<{ [key: string]: string }> {
    const cmd = strategyToCmd(strategy, false);
    const r   = await this.send(cmd, { value });
    return {
      [W3C_ELEMENT_KEY]: r['elementId'] as string,
    };
  }

  async findElements(
    strategy: string, value: string,
  ): Promise<Array<{ [key: string]: string }>> {
    const cmd = strategyToCmd(strategy, true);
    const r   = await this.send(cmd, { value });
    return (r['elementIds'] as string[]).map((id) => ({
      [W3C_ELEMENT_KEY]: id,
    }));
  }

  // ── Interactions ───────────────────────────────────────────

  async click(elementId: string): Promise<void> {
    await this.send('click', { elementId });
  }

  async setValue(
    elementId: string, value: string,
  ): Promise<void> {
    await this.send('setValue', { elementId, value });
  }

  async clear(elementId: string): Promise<void> {
    await this.send('clear', { elementId });
  }

  async getText(elementId: string): Promise<string> {
    const r = await this.send('getText', { elementId });
    return r['text'] as string;
  }

  async getAttribute(
    elementId: string, name: string,
  ): Promise<string | null> {
    const r = await this.send(
      'getAttribute', { elementId, name });
    return (r['value'] as string | null) ?? null;
  }

  async isDisplayed(elementId: string): Promise<boolean> {
    const r = await this.send('isDisplayed', { elementId });
    return r['value'] as boolean;
  }

  async isEnabled(elementId: string): Promise<boolean> {
    const r = await this.send('isEnabled', { elementId });
    return r['value'] as boolean;
  }

  async isSelected(elementId: string): Promise<boolean> {
    const r = await this.send('isSelected', { elementId });
    return r['value'] as boolean;
  }

  async getTitle(): Promise<string> {
    return (await this.send('getTitle'))['title'] as string;
  }

  async getUrl(): Promise<string> {
    return (await this.send('getUrl'))['url'] as string;
  }

  async getSource(): Promise<string> {
    return (await this.send('getSource'))['source'] as string;
  }

  async navigate(url: string): Promise<void> {
    await this.send('navigate', { value: url });
  }

  async execute(
    script: string, args: unknown[] = [],
  ): Promise<unknown> {
    const r = await this.send('executeScript', {
      script,
      args: JSON.stringify(args),
    });
    return r['result'] ?? null;
  }

  clearElements(): void {
    this.send('clearElements').catch(() => {/* best-effort */});
  }

  dispose(): void { this.proc.kill(); }
}

// ── Helpers ─────────────────────────────────────────────────

function strategyToCmd(strategy: string, multi: boolean): string {
  switch (strategy) {
    case 'id':
    case 'accessibility id':
      return multi ? 'findElementsByCssAll' : 'findElementById';
    case 'css selector':
      return multi ? 'findElementsCssAll' : 'findElementsByCss';
    case 'xpath':
      return multi
        ? 'findElementsByXpath'
        : 'findElementByXpath';
    default:
      throw new errors.InvalidArgumentError(
        `IE bridge does not support strategy: ${strategy}`);
  }
}

// ── Session registry ────────────────────────────────────────

const sessions = new Map<string, IESession>();

export function registerIESession(
  sessionId: string, s: IESession,
): void {
  sessions.set(sessionId, s);
}

export function getIESession(sessionId: string): IESession {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`No IE session: ${sessionId}`);
  return s;
}

export function deleteIESession(sessionId: string): void {
  sessions.get(sessionId)?.dispose();
  sessions.delete(sessionId);
}
```

---

## Layer 3 — Driver Class Changes

**File:** `lib/driver.ts`

### Remove these fields

```typescript
// DELETE:
ieDriverProcess:   ChildProcess | null = null;
ieDriverPort:      number | null       = null;
ieDriverSessionId: string | null       = null;
ieProxy:           JWProxy | null      = null;
```

### Add these fields

```typescript
import type { IESession } from './ie/session';

// ADD:
ieSession:  IESession | null = null;
ieContext:  boolean          = false;
```

### Helper (add as private method or standalone)

```typescript
isIEContext(): boolean {
  return this.ieContext && this.ieSession !== null;
}
```

### `findElOrEls` — add IE branch

In `driver.ts::findElOrEls`, **before** the `switch (strategy)`,
add:

```typescript
if (this.isIEContext()) {
  if (mult) {
    return this.ieSession!.findElements(strategy, selector);
  }
  return this.ieSession!.findElement(strategy, selector)
    .catch(() => { throw new errors.NoSuchElementError(); });
}
```

Remove the `IE_NO_PROXY` route array and `getProxyAvoidList` IE
branch — they are no longer needed.

---

## Layer 4 — Element Command Routing

**File:** `lib/commands/element.ts`

Every public command that the WebDriver spec defines for elements
needs an IE gate. Pattern:

```typescript
export async function getText(
  this: AppiumDesktopDriver, elementId: string,
): Promise<string> {
  if (this.isIEContext()) {
    return this.ieSession!.getText(elementId);
  }
  const text = await this.sendCommand(
    'getText', { elementId }) as string;
  return text.replace(/￼/g, '');
}
```

Apply the same pattern to:

| Function | IE call |
| --- | --- |
| `click` | `this.ieSession!.click(elementId)` |
| `getText` | `this.ieSession!.getText(elementId)` |
| `setValue` | `this.ieSession!.setValue(elementId, value)` |
| `clear` | `this.ieSession!.clear(elementId)` |
| `getAttribute` | `this.ieSession!.getAttribute(name, elementId)` |
| `elementDisplayed` | `this.ieSession!.isDisplayed(elementId)` |
| `elementEnabled` | `this.ieSession!.isEnabled(elementId)` |
| `elementSelected` | `this.ieSession!.isSelected(elementId)` |
| `getName` | `this.ieSession!.getAttribute(elementId, 'tagName')` |

`getElementRect` and `getElementScreenshot` have no IE equivalent
yet — throw `errors.NotYetImplementedError` when `isIEContext()`.

---

## Layer 4b — Navigation and Page Commands

The old JWProxy forwarded these transparently to IEDriverServer.
Without a proxy they hit BaseDriver and throw `NotYetImplementedError`.
All three must be explicitly implemented in `lib/commands/app.ts`.

### `getPageSource`

`getPageSource` already exists at `app.ts:65` but always calls
`sendCommand('getPageSource')`, which returns a UIA XML tree — not
the HTML DOM. Add an IE gate:

```typescript
export async function getPageSource(
  this: AppiumDesktopDriver,
): Promise<string> {
  if (this.isIEContext()) {
    return this.ieSession!.getSource();
  }
  return await this.sendCommand('getPageSource', {}) as string;
}
```

### `getUrl`

Not defined in the driver. Route name from BaseDriver: `getUrl`
(mapped to `GET /session/:id/url`).

```typescript
export async function getUrl(
  this: AppiumDesktopDriver,
): Promise<string> {
  if (this.isIEContext()) {
    return this.ieSession!.getUrl();
  }
  throw new errors.NotYetImplementedError();
}
```

### `title`

Not defined in the driver. Route name from BaseDriver: `title`
(mapped to `GET /session/:id/title`).

```typescript
export async function title(
  this: AppiumDesktopDriver,
): Promise<string> {
  if (this.isIEContext()) {
    return this.ieSession!.getTitle();
  }
  throw new errors.NotYetImplementedError();
}
```

### `setUrl`

Not defined in the driver. Route name from BaseDriver: `setUrl`
(mapped to `POST /session/:id/url`). Navigating flushes the element
registry on the bridge side — this is already handled by the C#
`navigate` command calling `FlushElements()`.

```typescript
export async function setUrl(
  this: AppiumDesktopDriver,
  url: string,
): Promise<void> {
  if (this.isIEContext()) {
    await this.ieSession!.navigate(url);
    return;
  }
  throw new errors.NotYetImplementedError();
}
```

Add all three to `commands/index.ts`.

### `getWindowHandle` in IE mode

`getWindowHandle` at `app.ts:89` calls `sendCommand(...)` into the
UIA tree and returns the prior UIA root's HWND — not the IE window.
Add an IE gate:

```typescript
export async function getWindowHandle(
  this: AppiumDesktopDriver,
): Promise<string> {
  if (this.isIEContext()) {
    const h = this.ieHwnd!;
    return `0x${h.toString(16).padStart(8, '0')}`;
  }
  const rootId = await this.sendCommand(
    'saveRootElementToTable', {}) as string;
  const nwh = await this.sendCommand(
    'getProperty',
    { elementId: rootId, property: 'NativeWindowHandle' },
  ) as string;
  return `0x${Number(nwh).toString(16).padStart(8, '0')}`;
}
```

### `getWindowHandles` — handle format note

`getWindowHandles` returns hex strings like `"0x00131234"`.
When this handle is passed back to `setWindow(handle)`,
`Number("0x00131234")` correctly parses to a decimal integer in
JavaScript. No special handling is required.

---

## Layer 5 — ie-session.ts Replacement

**File:** `lib/commands/ie-session.ts` — **replace entirely**.

The new file exports three functions that mirror the old
`enableIEProxy` / `disableIEProxy` / `terminateIESession` contract
so `app.ts` call sites change only the function name.

```typescript
import { AppiumDesktopDriver } from '../driver';
import { IESession, registerIESession, deleteIESession }
  from '../ie/session';
import { bridgeBitness } from '../ie/win32';
import { getWindowTitle, isIEWindowHwnd,
         getWindowThreadProcessId } from '../winapi/user32';

export { isIEWindowHwnd };

export async function enableIEMode(
  this: AppiumDesktopDriver, hwnd: number,
): Promise<void> {
  // Resolve PID for the target HWND
  const pidBuf: [number | null] = [null];
  getWindowThreadProcessId(hwnd, pidBuf);
  const pid = pidBuf[0];
  if (!pid) {
    throw new Error(
      `Cannot resolve PID for HWND 0x${hwnd.toString(16)}`);
  }

  const bitness = bridgeBitness(pid);
  this.log.info(
    `IE HWND 0x${hwnd.toString(16).padStart(8, '0')} ` +
    `PID=${pid} bitness=${bitness}-bit`);

  // Reuse an existing bridge for the same HWND if possible
  if (!this.ieSession || this.ieHwnd !== hwnd) {
    this.ieSession?.dispose();
    this.ieSession = new IESession(hwnd, bitness);
    this.ieHwnd    = hwnd;
    registerIESession(this.sessionId!, this.ieSession);
  }

  this.ieContext = true;
  this.log.info(
    `IE mode enabled for HWND 0x${hwnd.toString(16)}`);
}

export function disableIEMode(
  this: AppiumDesktopDriver,
): void {
  this.ieContext = false;
  this.log.info('IE mode disabled — back to UIA.');
}

export async function terminateIEMode(
  this: AppiumDesktopDriver,
): Promise<void> {
  this.ieContext = false;
  if (this.sessionId) deleteIESession(this.sessionId);
  this.ieSession = null;
  this.ieHwnd    = undefined;
  this.log.debug('IE bridge session terminated.');
}
```

Add `ieHwnd?: number` to the driver class fields so the bridge is
reused when the user switches back to the same IE window without
re-creating the process.

Update `commands/index.ts` — replace `enableIEProxy`,
`disableIEProxy`, `terminateIESession` exports with `enableIEMode`,
`disableIEMode`, `terminateIEMode`.

---

## Layer 6 — app.ts Call Sites

There are **6 `enableIEProxy` call sites** and **2 `disableIEProxy`
call sites** in `lib/commands/app.ts`, plus **1** in
`lib/commands/server-session.ts`.

### `enableIEProxy` → `enableIEMode` (8 call sites)

Mechanical rename — no other change at the call site:

```typescript
// Before:
await this.enableIEProxy(handle);
// After:
await this.enableIEMode(handle);
```

### `disableIEProxy` → `disableIEMode` (2 call sites)

The old guard was:

```typescript
if (this.jwpProxyActive && this.ieProxy) {
    this.disableIEProxy();
}
```

Replace with — note the new guard checks only `ieContext`:

```typescript
if (this.ieContext) {
    this.disableIEMode();
}
```

Both locations: `setWindow` (app.ts:116) and
`switchToWindowByTitle` (app.ts:178).

After `disableIEMode()` the code falls through into
`setRootElementFromHandle` to attach UIA to the new window
normally. Bridge process is **not** killed — it stays alive
so a later `setWindow(ieHwnd)` can reuse it without re-spawning.

### Switching back to desktop — full flow

User was in IE mode; calls `setWindow("0xNORMAL_HWND")`:

1. `handle = Number("0xNORMAL_HWND")` — parses correctly
2. `isIEWindowHwnd(handle)` → false — IE branch skipped
3. `if (this.ieContext) this.disableIEMode()` — clears flag
4. `setRootElementFromHandle(handle)` — UIA root updated
5. Element commands now route to `sendCommand` (UIA) ✓
6. Bridge stays alive; later `setWindow(ieHwnd)` reuses it ✓

### Removals

Remove from `app.ts` and `driver.ts`:

- `this.jwpProxyActive` assignments in IE code paths
- `this.ieProxy`, `this.proxyReqRes`, `this.proxyCommand` in
  IE paths
- `IE_NO_PROXY` array
- `getProxyAvoidList` IE branch (keep only Chromedriver branch)
- `JWProxy` import from `driver.ts` if only used for IE
  (Chromedriver uses `chromedriver.jwproxy`, not `ieProxy`)

---

## Build and Package

| Artifact | Build command | Output path |
| --- | --- | --- |
| `IEBridge_x64.exe` | `dotnet publish -r win-x64 -c Release` | `iebridge/IEBridge_x64.exe` |
| `IEBridge_x86.exe` | `dotnet publish -r win-x86 -c Release` | `iebridge/IEBridge_x86.exe` |

Add `iebridge/` to `package.json` `files` array alongside `iedriver/`.

Add a `build:iebridge` script to `package.json`:

```json
"build:iebridge": "dotnet publish csharp/IEBridge -r win-x64 &&
  dotnet publish csharp/IEBridge -r win-x86"
```

Both exes should be committed to the repo (like `iedriver/`) so
users do not need .NET SDK installed.

---

## Proxy Blueprint

Optional traffic interception. Not wired into the bridge by default.

Approach:

1. On `enableIEMode`, start a local proxy on a random port using
   `node-http-mitm-proxy` (npm package, no root cert for HTTP).
2. Set IE's proxy via registry write or `InternetSetOptionW`
   (from `wininet.dll` via koffi):
   - `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet
     Settings\ProxyEnable = 1`
   - `HKCU\...\ProxyServer = "127.0.0.1:<port>"`
3. On `disableIEMode` / `terminateIEMode`, restore original values.

For HTTPS interception a CA certificate must be installed into IE's
trust store via `CertAddEncodedCertificateToStore` (crypt32.dll).

This path is opt-in via a future session capability such as
`appium:ieInterceptTraffic: true`.

---

## Error Taxonomy

| Error string | Meaning | Driver behaviour |
| --- | --- | --- |
| `IE_DOCUMENT_NOT_FOUND` | HWND valid but no `Internet Explorer_Server` child found (tab not loaded or wrong HWND) | Retry up to 5× with 500 ms backoff |
| `NO_SUCH_ELEMENT` | `getElementById` / `querySelector` returned null | Throw `NoSuchElementError` |
| `STALE_ELEMENT_REFERENCE` | COM object is dead — page navigated | Throw `StaleElementReferenceError` |
| `ELEMENT_NOT_INTERACTABLE` | Element type has no `.value` | Throw `ElementNotInteractableError` |
| `QUERY_SELECTOR_UNSUPPORTED` | IE version too old for `IHTMLDocument6` | Throw `UnsupportedOperationError` |
| `UNKNOWN_CMD:<name>` | Bridge received a command it does not handle | Throw `UnknownCommandError` |

---

## Sharp Edges and Invariants

- **`[STAThread]`** on `Main` is mandatory. `IHTMLDocument2` was
  designed for single-threaded apartment COM. Without it,
  `ObjectFromLresult` marshals across apartments and races.

- **`SendMessageTimeout` with `SMTO_ABORTIFHUNG`** is mandatory.
  A frozen IE tab blocks `SendMessage` forever, hanging the driver.
  Use a 5-second cap.

- **Recursive `EnumChildWindows`** not `FindWindowEx`. The tab
  hierarchy varies by IE version: `IEFrame → TabWindowClass →
  Frame Tab → Shell DocObject View → Internet Explorer_Server`.
  A single-level `FindWindowEx` misses intermediate panes.

- **Element registry flush on navigate**. Every navigation
  invalidates all prior `IHTMLElement` COM references. Call
  `FlushElements()` (C# side) or `session.clearElements()` (TS
  side) after any `navigate` command. Stale element access throws
  a COM exception that surfaces as `STALE_ELEMENT_REFERENCE`.

- **Bitness mismatch = silent failure**. `ObjectFromLresult`
  returns `E_FAIL` (not an exception) when bridge and tab bitness
  differ. Always call `bridgeBitness(pid)` before spawning.
  Log the detected bitness at `info` level so it is visible in
  Appium logs.

- **Bridge process is per-HWND, not per-session**. When a user
  switches between two IE windows in the same driver session,
  `enableIEMode` disposes the old bridge and creates a new one.
  The session registry tracks one bridge per `sessionId`.

- **Do not mix `jwpProxyActive` with IE mode**. The new bridge
  does not use `JWProxy`. Setting `jwpProxyActive = true` would
  route all traffic through the (now-null) proxy and break the
  session. Keep `jwpProxyActive` false while `ieContext` is true.

- **Bridge process death**. If the IE process exits mid-session,
  the bridge process exits too, firing the `exit` event in
  `IESession`. Pending callbacks are rejected, but `ieContext`
  stays `true`. The next element command then writes to a closed
  `stdin` and throws an unhandled error. Fix: in the `IESession`
  constructor's `proc.on('exit', ...)` handler, invoke an
  optional `onExit` callback so the driver can clear state:

  ```typescript
  // IESession constructor signature:
  constructor(hwnd, bitness, onExit?: () => void)
  // In proc.on('exit'):
  onExit?.();

  // In enableIEMode:
  this.ieSession = new IESession(hwnd, bitness, () => {
    this.ieContext = false;
    this.ieSession = null;
    this.log.warn('IE bridge exited unexpectedly.');
  });
  ```
