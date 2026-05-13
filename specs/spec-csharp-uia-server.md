# Spec: C# UIAutomation Server

## Goal

Replace the persistent PowerShell process with a compiled .NET C# executable. All UIA3 operations use native COM interop instead of dynamically-encoded PowerShell scripts. Eliminates antivirus false-positive triggers.

## Problem with PowerShell

Antivirus flags the current driver as malware due to:
- Persistent `powershell.exe` with `-NoExit -Command -` — matches C2 implant heuristic
- Base64-encoded commands via `Invoke-Expression` — matches obfuscation heuristic
- Dynamic `Add-Type` assembly loading

This causes silent failures on locked-down enterprise machines where AV kills the PowerShell process mid-session.

---

## Architecture

```
Node.js AppiumDesktopDriver  ──NDJSON over stdin/stdout──>  DesktopUIAutomationServer.exe
                                                                  |
                                                                  └── dedicated STA thread
                                                                        └── UIA3 COM → Windows
```

---

## Protocol: NDJSON over stdin/stdout

Every message is one JSON object followed by `\n`. Responses may arrive out of order.

**Request** (Node → exe):
```json
{ "id": 1, "method": "findElement", "params": { "condition": { "type": "property", "property": "Name", "value": "OK" }, "scope": "descendants" } }
```

**Success response** (exe → Node):
```json
{ "id": 1, "result": "42.1337", "duration_ms": 12 }
```

**Error response** (exe → Node):
```json
{ "id": 1, "error": { "code": "ElementNotFound", "message": "No element found matching condition." }, "duration_ms": 8 }
```

- `id`: incrementing integer (starts at 1), **not a string**
- `params` may be `null` or omitted for commands that take no arguments
- `result` and `error` are mutually exclusive; `null` result is a valid success
- `duration_ms`: always present in response; measures time inside C# handler
- exe writes structured logs to stderr only; Node captures and forwards them as `[server] <line>` debug logs

---

## C# Server

### Directory

```
csharp/
└── DesktopUIAutomationServer/
    ├── DesktopUIAutomationServer.csproj
    ├── GlobalUsings.cs
    ├── Program.cs
    ├── Protocol/
    │   ├── Message.cs
    │   └── ErrorCodes.cs
    ├── Server/
    │   ├── JsonRpcServer.cs
    │   ├── CommandDispatcher.cs
    │   └── ConditionBuilder.cs
    ├── Commands/
    │   ├── SessionCommands.cs
    │   ├── FindCommands.cs
    │   ├── ElementCommands.cs
    │   ├── PatternCommands.cs
    │   ├── ScreenshotCommands.cs
    │   ├── PageSourceCommands.cs
    │   ├── ProcessCommands.cs
    │   ├── ClipboardCommands.cs
    │   ├── FileSystemCommands.cs
    │   └── DiagnosticCommands.cs
    ├── State/
    │   └── SessionState.cs
    ├── Uia3/
    │   └── UIA.cs
    └── Logging/
        └── SessionRecorder.cs
```

### `.csproj` — `DesktopUIAutomationServer.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <PublishSingleFile>true</PublishSingleFile>
    <SelfContained>true</SelfContained>
    <RuntimeIdentifier>win-x64</RuntimeIdentifier>
    <PublishTrimmed>false</PublishTrimmed>
    <IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>
    <AssemblyName>DesktopUIAutomationServer</AssemblyName>
    <RootNamespace>DesktopUIAutomationServer</RootNamespace>
  </PropertyGroup>
  <!-- UIA3 interop is hand-written in Uia3/UIA.cs via [ComImport] attributes.
       COMReference + tlbimp is not supported on .NET SDK MSBuild (error MSB4803).
       Hand-written declarations produce identical runtime behavior with no third-party deps. -->
</Project>
```

`UseWPF` and `UseWindowsForms` are both required — clipboard operations need Windows Forms APIs.

### `Program.cs`

STA threading is mandatory. `[STAThread]` on `async Main` does not reliably set the apartment state in .NET. Create a dedicated STA thread instead:

```csharp
using DesktopUIAutomationServer.Server;

class Program
{
    static void Main(string[] args)
    {
        string? recordingPath = null;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--record" && i + 1 < args.Length)
            {
                recordingPath = args[i + 1];
                i++;
            }
        }

        var staThread = new Thread(() =>
        {
            var server = new JsonRpcServer(recordingPath);
            server.Run();
        });
        staThread.SetApartmentState(ApartmentState.STA);
        staThread.Start();
        staThread.Join();
    }
}
```

### `Protocol/Message.cs`

```csharp
public class Request
{
    [JsonPropertyName("id")]    public int Id { get; set; }
    [JsonPropertyName("method")] public string Method { get; set; } = string.Empty;
    [JsonPropertyName("params")] public JsonElement? Params { get; set; }
}

public class Response
{
    [JsonPropertyName("id")]          public int Id { get; set; }
    [JsonPropertyName("result")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                      public object? Result { get; set; }
    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                      public ErrorInfo? Error { get; set; }
    [JsonPropertyName("duration_ms")] public long DurationMs { get; set; }
}

public class ErrorInfo
{
    [JsonPropertyName("code")]    public string Code { get; set; } = string.Empty;
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
}

public class ConditionDto
{
    [JsonPropertyName("type")]       public string Type { get; set; } = string.Empty;
    [JsonPropertyName("property")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                     public string? Property { get; set; }
    [JsonPropertyName("value")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                     public JsonElement? Value { get; set; }
    [JsonPropertyName("conditions")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                     public ConditionDto[]? Conditions { get; set; }
    [JsonPropertyName("condition")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
                                     public ConditionDto? Condition { get; set; }
}
```

### `Protocol/ErrorCodes.cs`

```csharp
public static class ErrorCodes
{
    public const string ElementNotFound     = "ElementNotFound";
    public const string InvalidArgument     = "InvalidArgument";
    public const string UnknownMethod       = "UnknownMethod";
    public const string PatternNotSupported = "PatternNotSupported";
    public const string InvalidCondition    = "InvalidCondition";
    public const string InternalError       = "InternalError";
    public const string ElementNotAvailable = "ElementNotAvailable";
    public const string ProcessError        = "ProcessError";
    public const string FileSystemError     = "FileSystemError";
    public const string InvalidSelector     = "InvalidSelector";
}
```

### `Server/JsonRpcServer.cs`

Synchronous request loop on the STA thread. No async/await — COM doesn't tolerate thread-pool continuations.

```csharp
public class JsonRpcServer
{
    private readonly CommandDispatcher _dispatcher;
    private readonly SessionState _state;
    private readonly SessionRecorder? _recorder;
    private readonly JsonSerializerOptions _jsonOptions;

    public JsonRpcServer(string? recordingPath = null)
    {
        _dispatcher = new CommandDispatcher();
        _state = new SessionState();
        _recorder = recordingPath != null ? new SessionRecorder(recordingPath) : null;
        _jsonOptions = new JsonSerializerOptions
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            // BoundingRectangle can return ±Infinity for off-screen elements.
            // Without this, serialization throws ArgumentException.
            NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
        };
    }
```

`Run()` logic:
1. Set `Console.InputEncoding` and `Console.OutputEncoding` to UTF-8
2. Log startup banner to stderr: `DesktopUIAutomationServer v{version} (built {buildTime}) started. Waiting for commands...`
3. Read lines from stdin in a loop
4. `null` line = stdin closed → break and exit
5. Empty/whitespace lines → skip
6. Each line → `ProcessLine(line)`
7. After loop: `_state.Dispose()`, `_recorder?.Dispose()`

`ProcessLine(line)`:
1. Deserialize to `Request`
2. Record request via `_recorder?.RecordRequest(request)`
3. Log to stderr: `[{id}] -> {method}`
4. Special case: `method == "dispose"` → call `_state.Dispose()`, write success response, call `Environment.Exit(0)`
5. If method not registered: write `UnknownMethod` error response
6. Else: call `_dispatcher.Execute(method, _state, params)`
7. If `elapsed > 500ms`: log `[{id}] <- {method} SLOW ({elapsed}ms)`, else log `[{id}] <- {method} ({elapsed}ms)`
8. Write success response

Exception mapping (catches all unhandled exceptions from handlers):
- `KeyNotFoundException` → `ErrorCodes.ElementNotFound`
- `ArgumentException` → `ErrorCodes.InvalidArgument`
- `InvalidOperationException` where message contains `"Pattern"` → `ErrorCodes.PatternNotSupported`
- `InvalidOperationException` (other) → `ErrorCodes.InternalError`
- anything else → `ErrorCodes.InternalError`

Log full exception chain to stderr: `[{id}] ERROR {method}: {ExType}: {msg} --> {InnerExType}: {msg}...`

`WriteResponse(response)`: serialize with `_jsonOptions`, `Console.WriteLine(json)`, `Console.Out.Flush()`.

Stderr format: `[{HH:mm:ss.fff UTC}] {message}` — always flush after writing.

### `Server/CommandDispatcher.cs`

```csharp
public class CommandDispatcher
{
    private readonly Dictionary<string, Func<SessionState, JsonElement?, object?>> _handlers;

    public CommandDispatcher()
    {
        _handlers = new Dictionary<string, Func<SessionState, JsonElement?, object?>>(StringComparer.OrdinalIgnoreCase)
        {
            // Session
            ["init"]                              = SessionCommands.Init,
            ["setRootElement"]                    = SessionCommands.SetRootElement,
            ["setRootElementNull"]                = SessionCommands.SetRootElementNull,
            ["setRootElementFromHandle"]          = SessionCommands.SetRootElementFromHandle,
            ["setRootElementFromElementId"]       = SessionCommands.SetRootElementFromElementId,
            ["elementFromHandle"]                 = SessionCommands.ElementFromHandle,
            ["checkRootElementNotNull"]           = SessionCommands.CheckRootElementNotNull,
            ["setCacheRequestTreeFilter"]         = SessionCommands.SetCacheRequestTreeFilter,
            ["setCacheRequestTreeScope"]          = SessionCommands.SetCacheRequestTreeScope,
            ["setCacheRequestAutomationElementMode"] = SessionCommands.SetCacheRequestAutomationElementMode,
            ["dispose"]                           = SessionCommands.Dispose,
            // Find
            ["findElement"]                       = FindCommands.FindElement,
            ["findElements"]                      = FindCommands.FindElements,
            ["findElementFocused"]                = FindCommands.FindElementFocused,
            ["saveRootElementToTable"]            = FindCommands.SaveRootElementToTable,
            ["lookupElement"]                     = FindCommands.LookupElement,
            // Element
            ["getProperty"]                       = ElementCommands.GetProperty,
            ["getTagName"]                        = ElementCommands.GetTagName,
            ["getText"]                           = ElementCommands.GetText,
            ["getRect"]                           = ElementCommands.GetRect,
            ["getRootRect"]                       = ElementCommands.GetRootRect,
            ["setFocus"]                          = ElementCommands.SetFocus,
            ["setElementValue"]                   = ElementCommands.SetValue,
            ["getElementValue"]                   = ElementCommands.GetValue,
            ["sendKeys"]                          = ElementCommands.SendKeys,
            // Patterns
            ["invokeElement"]                     = PatternCommands.Invoke,
            ["expandElement"]                     = PatternCommands.Expand,
            ["collapseElement"]                   = PatternCommands.Collapse,
            ["toggleElement"]                     = PatternCommands.Toggle,
            ["getToggleState"]                    = PatternCommands.GetToggleState,
            ["setElementRangeValue"]              = PatternCommands.SetRangeValue,
            ["scrollElementIntoView"]             = PatternCommands.ScrollIntoView,
            ["selectElement"]                     = PatternCommands.Select,
            ["addToSelection"]                    = PatternCommands.AddToSelection,
            ["removeFromSelection"]               = PatternCommands.RemoveFromSelection,
            ["isElementSelected"]                 = PatternCommands.IsSelected,
            ["isMultipleSelect"]                  = PatternCommands.IsMultipleSelect,
            ["getSelectedElements"]               = PatternCommands.GetSelectedElements,
            ["maximizeWindow"]                    = PatternCommands.MaximizeWindow,
            ["minimizeWindow"]                    = PatternCommands.MinimizeWindow,
            ["restoreWindow"]                     = PatternCommands.RestoreWindow,
            ["closeWindow"]                       = PatternCommands.CloseWindow,
            ["moveWindow"]                        = PatternCommands.MoveWindow,
            ["resizeWindow"]                      = PatternCommands.ResizeWindow,
            // Page source & screenshots
            ["getPageSource"]                     = PageSourceCommands.GetPageSource,
            ["getScreenshot"]                     = ScreenshotCommands.GetScreenshot,
            ["getElementScreenshot"]              = ScreenshotCommands.GetElementScreenshot,
            // Clipboard
            ["getClipboardText"]                  = ClipboardCommands.GetClipboardText,
            ["setClipboardText"]                  = ClipboardCommands.SetClipboardText,
            ["getClipboardImage"]                 = ClipboardCommands.GetClipboardImage,
            ["setClipboardImage"]                 = ClipboardCommands.SetClipboardImage,
            // Process
            ["startProcess"]                      = ProcessCommands.StartProcess,
            ["getProcessIds"]                     = ProcessCommands.GetProcessIds,
            ["stopProcess"]                       = ProcessCommands.StopProcess,
            ["executePowerShellScript"]           = ProcessCommands.ExecutePowerShellScript,
            // File system
            ["deleteFile"]                        = FileSystemCommands.DeleteFile,
            ["deleteFolder"]                      = FileSystemCommands.DeleteFolder,
            // Diagnostics
            ["debug:ping"]                        = DiagnosticCommands.Ping,
            ["debug:inspectElementTable"]         = DiagnosticCommands.InspectElementTable,
        };
    }

    public bool HasHandler(string method) => _handlers.ContainsKey(method);

    public object? Execute(string method, SessionState state, JsonElement? parameters)
    {
        if (!_handlers.TryGetValue(method, out var handler))
            throw new ArgumentException($"Unknown method: '{method}'");
        // Runs inline on STA thread — no async/Task needed
        return handler(state, parameters);
    }
}
```

`dispose` is handled directly in `JsonRpcServer.ProcessLine`, not in this dispatcher.

### `Server/ConditionBuilder.cs`

Converts `ConditionDto` JSON to `IUIAutomationCondition` COM objects. Property names are **case-insensitive** on lookup.

**PropertyMap** (partial — full list must include all entries):
```
AutomationId, Name, ClassName, ControlType, RuntimeId, NativeWindowHandle, ProcessId,
IsEnabled, IsOffscreen, IsKeyboardFocusable, HasKeyboardFocus, IsControlElement,
IsContentElement, IsPassword, IsRequiredForForm, ItemStatus, ItemType,
LocalizedControlType, AcceleratorKey, AccessKey, HelpText, FrameworkId,
Orientation, HeadingLevel, LabeledBy, ClickablePoint, BoundingRectangle,
Culture, IsDialog, SizeOfSet, PositionInSet,
IsDockPatternAvailable, IsExpandCollapsePatternAvailable, IsGridItemPatternAvailable,
IsGridPatternAvailable, IsInvokePatternAvailable, IsMultipleViewPatternAvailable,
IsRangeValuePatternAvailable, IsSelectionItemPatternAvailable, IsSelectionPatternAvailable,
IsScrollPatternAvailable, IsScrollItemPatternAvailable, IsTablePatternAvailable,
IsTableItemPatternAvailable, IsTextPatternAvailable, IsTogglePatternAvailable,
IsTransformPatternAvailable, IsValuePatternAvailable, IsWindowPatternAvailable
```

**ControlTypeMap** (36 entries):
```
Button, Calendar, CheckBox, ComboBox, Edit, Hyperlink, Image, ListItem, List,
Menu, MenuBar, MenuItem, ProgressBar, RadioButton, ScrollBar, Slider, Spinner,
StatusBar, Tab, TabItem, Text, ToolBar, ToolTip, Tree, TreeItem, Custom, Group,
Thumb, DataGrid, DataItem, Document, SplitButton, Window, Pane, Header,
HeaderItem, Table, TitleBar, Separator, SemanticZoom, AppBar
```

**`GetPropertyId(string name)`**: strips trailing `"Property"` suffix (case-insensitive), then looks up in PropertyMap. Throws `ArgumentException` if not found.

**`Build(IUIAutomation automation, ConditionDto dto)`** dispatches by `dto.Type.ToLowerInvariant()`:
- `"property"` → `BuildPropertyCondition` → `automation.CreatePropertyCondition(propertyId, value)`
- `"and"` → requires `dto.Conditions.Length >= 2` → `automation.CreateAndConditionFromArray(built[])`
- `"or"` → requires `dto.Conditions.Length >= 2` → `automation.CreateOrConditionFromArray(built[])`
- `"not"` → requires `dto.Condition != null` → `automation.CreateNotCondition(built)`
- `"true"` → `automation.CreateTrueCondition()`
- `"false"` → `automation.CreateFalseCondition()`

**Value conversion rules** in `ConvertValue(int propertyId, JsonElement value)`:
- `ControlType` property: value is a string name → look up in ControlTypeMap → return int
- `RuntimeId` property: value is `[1,2,3]` array or `"1.2.3"` string → return `int[]`
- `Orientation` property: value is string (`"None"`, `"Horizontal"`, `"Vertical"`) → parse as `OrientationType` enum (int: None=0, Horizontal=1, Vertical=2)
- `NativeWindowHandle` property + `JsonValueKind.Number` → return `int` (not `IntPtr`)
- `String` → `string`, `Number` → `int`, `True`/`False` → `bool`

**`ControlTypeNameById`**: reverse dictionary `int → string` used by `GetTagName` to return the string name instead of the integer ID.

### `State/SessionState.cs`

One `IUIAutomation` COM instance per session. `ElementTable` is a plain `Dictionary<string, IUIAutomationElement>` (not `ConcurrentDictionary` — everything runs on STA thread).

Key behaviors:
- `RootNativeWindowHandle` tracks the HWND of the attached window. `GetLiveRoot()` re-calls `Automation.ElementFromHandle(hwnd)` on every find to get a fresh UIA element (handles WPF apps that rebuild their automation peer tree after navigation — same HWND, new children). Falls back to stored `RootElement` if no HWND.
- `SaveElementAndReturnId(element)`: calls `element.GetRuntimeId()`, joins with `.` → `"42.1337"`, stores in `ElementTable`, returns id string.
- `GetElement(id)`: throws `KeyNotFoundException` if id not in table (maps to `ElementNotFound` error in dispatcher).
- `Initialize()`: called by `init` command. Creates a `CacheRequest` with tree filter: `ControlViewCondition AND NOT FrameworkId="Chrome"`. Creates `TreeWalker` from same filter.
- `Dispose()`: clears `ElementTable`, calls `SetRoot(null)`, sets `CacheRequest = null`, `TreeWalker = null`.

### `Uia3/UIA.cs`

Hand-written COM interop declarations for `IUIAutomation`, `IUIAutomationElement`, `IUIAutomationCondition`, `IUIAutomationCacheRequest`, `IUIAutomationTreeWalker`. Uses `[ComImport]`, `[Guid]`, `[InterfaceType]` attributes. No `tlbimp`, no generated interop assembly. See novawindows `Uia3/UIA.cs` for full declarations — copy verbatim and rename namespace to `DesktopUIAutomationServer`.

### `Logging/SessionRecorder.cs`

Opened via `createWriteStream` equivalent in C# (`FileStream` + `StreamWriter`). Records each request and response as separate NDJSON lines with `ts` (ISO-8601 UTC), `direction` (`"request"`/`"response"`), and the full message fields. Used only when `--record <path>` arg is passed.

---

## Build

```bash
npm run build:native
# runs:
dotnet publish csharp/DesktopUIAutomationServer \
  -c Release -r win-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -o native/win-x64/
```

Output: `native/win-x64/DesktopUIAutomationServer.exe` (~165MB, bundles .NET 10 runtime).

Add to `package.json` scripts:
```json
"build:native": "dotnet publish csharp/DesktopUIAutomationServer -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o native/win-x64/"
```

Add `postinstall` script to warn if binary is absent:
```json
"postinstall": "node -e \"const fs=require('fs'); const p='native/win-x64/DesktopUIAutomationServer.exe'; if(!fs.existsSync(p)) console.warn('WARNING: '+p+' not found. Run npm run build:native.')\""
```

---

## Node.js: `lib/server/protocol.ts`

```ts
export interface ServerRequest {
    id: number;           // incrementing integer — NOT a string
    method: string;
    params: Record<string, unknown>;
}

export interface ServerResponse {
    id: number;
    result?: unknown;
    error?: {
        code: string;     // one of ErrorCodes strings
        message: string;
    };
    duration_ms: number;
}

export interface ConditionDto {
    type: 'property' | 'and' | 'or' | 'not' | 'true' | 'false';
    property?: string;    // for 'property' type — case-insensitive in C#
    value?: unknown;      // for 'property' type
    conditions?: ConditionDto[];  // for 'and' | 'or' — minimum 2
    condition?: ConditionDto;     // for 'not'
}

export interface RectResult {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PingResult {
    status: string;           // "ok"
    uptimeSeconds: number;
    elementCount: number;
    hasRootElement: boolean;
}

export interface ElementTableEntry {
    runtimeId: string;
    name: string;
    controlType: string;
    isAlive: boolean;
}
```

---

## Node.js: `lib/server/client.ts`

Class name: `DesktopUIAutomationClient`.

```ts
const SERVER_EXE_NAME = 'DesktopUIAutomationServer.exe';

export class DesktopUIAutomationClient {
    private process?: ChildProcessWithoutNullStreams;
    private requestId = 0;
    private buffer = '';
    private pendingRequests = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (reason: Error) => void;
        method: string;
        startTime: number;
    }>();
    private log: { info, debug, warn, error };
    private recordingStream?: WriteStream;

    constructor(log: DesktopUIAutomationClient['log'], recordingPath?: string) {
        this.log = log;
        if (recordingPath) {
            this.recordingStream = createWriteStream(recordingPath, { encoding: 'utf8' });
        }
    }
```

**`getServerPath(): string`**:
1. Check `process.env.DESKTOP_DRIVER_PATH` — if set, return it
2. Else return `join(__dirname, '..', '..', '..', 'native', 'win-x64', SERVER_EXE_NAME)`
   (`__dirname` at runtime is `build/lib/server/`, so three levels up = project root)

**`async start(recordingPath?: string, env?: NodeJS.ProcessEnv): Promise<void>`**:
1. Call `getServerPath()`
2. Build `args`: if `recordingPath` → `['--record', recordingPath]`
3. `this.process = spawn(serverPath, args, env ? { env } : undefined)`
4. Set stdout/stderr encoding to `'utf8'`
5. `stdout.on('data')`: append to `this.buffer`, call `processBuffer()`
6. `stderr.on('data')`: split on `\n`, log each line as `this.log.debug('[server] ' + line)`
7. `process.on('exit', code)`: log exit code; reject all pending requests with `UnknownError('Server process exited while waiting for response to {method} (id={id})')`; clear `pendingRequests`; set `this.process = undefined`
8. `await new Promise(resolve => setTimeout(resolve, 100))` — wait 100ms for server to start
9. Call `await this.sendCommand('debug:ping', {})` to verify server is alive; log the result

**`async sendCommand(method: string, params: Record<string, unknown>): Promise<unknown>`**:
1. Throw `UnknownError('DesktopUIAutomationServer is not running.')` if `!this.process`
2. `const id = ++this.requestId`
3. Build `request: ServerRequest = { id, method, params }`
4. If `recordingStream`: write `JSON.stringify({ ts: new Date().toISOString(), direction: 'request', ...request }) + '\n'`
5. Return `new Promise((resolve, reject) => { pendingRequests.set(id, { resolve, reject, method, startTime: Date.now() }); process.stdin.write(JSON.stringify(request) + '\n'); })`

**`processBuffer(): void`** (called on each stdout data chunk):
1. Split `this.buffer` on `\n`
2. Last element (may be partial) → store back in `this.buffer`
3. For each complete line: skip empty, `JSON.parse` as `ServerResponse`
4. Look up `pendingRequests.get(response.id)` — if missing, log warn and continue
5. Delete from map
6. If `recordingStream`: write response recording
7. Check elapsed time: if `> 500ms` → log `SLOW command: {method} took {elapsed}ms (server: {response.duration_ms}ms)`
8. If `response.error`: map error code and reject:
   - `'ElementNotFound'` → `new errors.NoSuchElementError(errorMessage)`
   - `'InvalidArgument'` or `'InvalidCondition'` → `new errors.InvalidArgumentError(errorMessage)`
   - `'PatternNotSupported'` → `new errors.UnknownError(errorMessage)`
   - default → `new errors.UnknownError(errorMessage)`
9. Else: `pending.resolve(response.result)`

**`async dispose(): Promise<void>`**:
1. If `!this.process` → return
2. `try { await this.sendCommand('dispose', {}); } catch { /* ignore */ }`
3. Wait up to 2000ms for process to exit: `new Promise<void>(resolve => { const timeout = setTimeout(() => { this.process?.kill(); resolve(); }, 2000); this.process?.once('exit', () => { clearTimeout(timeout); resolve(); }); })`
4. `this.recordingStream?.end(); this.recordingStream = undefined; this.process = undefined`

---

## Node.js: `lib/server/conditions.ts`

Exact property name normalization: strips trailing `"property"` suffix (case-insensitive), then maps to canonical casing via `propertyMap`. The canonical names **must match** the keys in C#'s `ConditionBuilder.PropertyMap`:

```ts
const propertyMap: Record<string, string> = {
    'automationid': 'AutomationId',
    'name': 'Name',
    'classname': 'ClassName',
    'controltype': 'ControlType',
    'runtimeid': 'RuntimeId',
    'nativewindowhandle': 'NativeWindowHandle',
    'processid': 'ProcessId',
    'isenabled': 'IsEnabled',
    'isoffscreen': 'IsOffscreen',
    'iskeyboardfocusable': 'IsKeyboardFocusable',
    'haskeyboardfocus': 'HasKeyboardFocus',
    'iscontrolelement': 'IsControlElement',
    'iscontentelement': 'IsContentElement',
    'ispassword': 'IsPassword',
    'isrequiredforform': 'IsRequiredForForm',
    'itemstatus': 'ItemStatus',
    'itemtype': 'ItemType',
    'localizedcontroltype': 'LocalizedControlType',
    'acceleratorkey': 'AcceleratorKey',
    'accesskey': 'AccessKey',
    'helptext': 'HelpText',
    'frameworkid': 'FrameworkId',
    'orientation': 'Orientation',
    'headinglevel': 'HeadingLevel',
    'labeledby': 'LabeledBy',
    'clickablepoint': 'ClickablePoint',
    'boundingrectangle': 'BoundingRectangle',
    'culture': 'Culture',
    'isdialog': 'IsDialog',
    'sizeofset': 'SizeOfSet',
    'positioninset': 'PositionInSet',
};

export function propertyCondition(property: string, value: unknown): ConditionDto {
    if (property.toLowerCase().endsWith('property')) {
        property = property.slice(0, -8);
    }
    const normalized = propertyMap[property.toLowerCase()] ?? property;
    return { type: 'property', property: normalized, value };
}

export function andCondition(...conditions: ConditionDto[]): ConditionDto {
    return { type: 'and', conditions };
}

export function orCondition(...conditions: ConditionDto[]): ConditionDto {
    return { type: 'or', conditions };
}

export function notCondition(condition: ConditionDto): ConditionDto {
    return { type: 'not', condition };
}

export function trueCondition(): ConditionDto  { return { type: 'true' }; }
export function falseCondition(): ConditionDto { return { type: 'false' }; }
```

---

## Node.js: `lib/server/converter-bridge.ts`

Adapts old `PSCondition` objects (produced by `lib/powershell/converter.ts`) to `ConditionDto`. Required during incremental migration — allows `lib/powershell/converter.ts` to be rewritten one piece at a time without blocking the server migration.

```ts
import type { ConditionDto } from './protocol';
import type { Condition } from '../powershell'; // existing PS condition types

export function conditionToDto(psCondition: Condition): ConditionDto
```

Delete this file only after `lib/powershell/converter.ts` is fully rewritten to emit `ConditionDto` directly.

---

## Node.js: `lib/commands/server-session.ts`

```ts
const MAX_INIT_RETRIES = 5;
const INIT_RETRY_DELAY_MS = 500;
const WEBVIEW_DEVTOOLS_PORT_LOWER = 10900;
const WEBVIEW_DEVTOOLS_PORT_UPPER = 11000;
```

**`async startServerSession(this: AppiumDesktopDriver): Promise<void>`**:

1. **WebView2 env setup** (before spawning server):
   ```ts
   let serverEnv: NodeJS.ProcessEnv | undefined;
   if (this.caps.webviewEnabled) {
       this.webviewDevtoolsPort = this.caps.webviewDevtoolsPort
           ? Number(this.caps.webviewDevtoolsPort)
           : await findFreePort(WEBVIEW_DEVTOOLS_PORT_LOWER, WEBVIEW_DEVTOOLS_PORT_UPPER);
       // Build env copy — do NOT mutate process.env (shared across all Appium sessions)
       serverEnv = {
           ...process.env,
           WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.webviewDevtoolsPort}`,
       };
   }
   ```

2. **Server spawn + init with retry** (retries full spawn, not just init):
   ```ts
   for (let attempt = 1; attempt <= MAX_INIT_RETRIES; attempt++) {
       this.serverClient = new DesktopUIAutomationClient(this.log);
       await this.serverClient.start(undefined, serverEnv);
       try {
           await this.sendCommand('init', {});
           break; // success
       } catch (err) {
           const msg = err instanceof Error ? err.message : String(err);
           if (attempt < MAX_INIT_RETRIES && msg.includes('type initializer')) {
               // .NET type initializer failures are permanent for that process lifetime.
               // Must restart the entire server process and retry.
               await this.serverClient.dispose();
               this.serverClient = undefined;
               await new Promise(r => setTimeout(r, INIT_RETRY_DELAY_MS));
           } else {
               throw err;
           }
       }
   }
   ```

3. **`appWorkingDir` env var expansion**: expand `%ENV_VAR%` patterns in `this.caps.appWorkingDir` using `process.env`:
   ```ts
   if (this.caps.appWorkingDir) {
       const matches = this.caps.appWorkingDir.matchAll(/%([^%]+)%/g);
       for (const match of matches) {
           this.caps.appWorkingDir = this.caps.appWorkingDir.replaceAll(
               `%${match[1]}%`,
               process.env[match[1].toUpperCase()] ?? ''
           );
       }
   }
   ```

4. **App/root setup** (mutually exclusive):
   - No `app` AND no `appTopLevelWindow`, OR `app === 'none'`: `await this.sendCommand('setRootElementNull', {})`
   - `app === 'root'`: `await this.sendCommand('setRootElement', {})`
   - `app` is a path (not `none`/`root`):
     - Expand `%ENV_VAR%` in `this.caps.app` same as above
     - If `this.opts.noReset`: call `tryAttachToRunningApp(this.caps.app)` → if returns true, return early
     - Else: `await this.changeRootElement(this.caps.app)` (existing command)
   - `appTopLevelWindow` set: parse as integer HWND, `await this.changeRootElement(nativeWindowHandle)`

**`async tryAttachToRunningApp(this: AppiumDesktopDriver, appPath: string): Promise<boolean>`**:

```ts
const isUwp = appPath.includes('!') && appPath.includes('_')
    && !(appPath.includes('/') || appPath.includes('\\'));

try {
    if (isUwp) {
        const processIds = await this.sendCommand('getProcessIds', { processName: 'ApplicationFrameHost' }) as number[];
        if (processIds.length === 0) return false;
        await this.attachToApplicationWindow(processIds, { isUwp: true });
        return true;
    }

    const normalizedPath = normalize(appPath);
    const parts = normalizedPath.toLowerCase().split('\\').flatMap(x => x.split('/'));
    const executable = parts[parts.length - 1];
    const processName = executable.endsWith('.exe') ? executable.slice(0, -4) : executable;
    const processIds = await this.sendCommand('getProcessIds', { processName }) as number[];
    if (processIds.length === 0) return false;
    await this.attachToApplicationWindow(processIds, { isUwp: false });
    return true;
} catch {
    return false;
}
```

**`async terminateServerSession(this: AppiumDesktopDriver): Promise<void>`**:

```ts
if (!this.serverClient) return;
await this.serverClient.dispose();
this.serverClient = undefined;
```

---

## `lib/driver.ts` Changes

Remove PowerShell fields:
```ts
// Delete:
isPowerShellSessionStarted: boolean
powerShell?: ChildProcessWithoutNullStreams
powerShellStdOut: string
powerShellStdErr: string
```

Add server client field:
```ts
serverClient?: DesktopUIAutomationClient;
```

Add `sendCommand` helper method:
```ts
async sendCommand(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.serverClient) {
        throw new errors.UnknownError('DesktopUIAutomationServer is not running.');
    }
    return this.serverClient.sendCommand(method, params);
}
```

Update `createSession()`: replace `await this.startPowerShellSession()` with `await this.startServerSession()`.

Update `deleteSession()`: replace `await this.terminatePowerShellSession()` with `await this.terminateServerSession()`. The `prerun`/`postrun` PowerShell script execution via `executePowerShellScript` remains, but now goes through `sendCommand('executePowerShellScript', { script })` instead of direct PS execution.

---

## `lib/powershell/` → `lib/uia/`

Rename directory. Update all imports across the codebase. The internal logic stays the same during migration; only the output changes from PS strings to `ConditionDto` objects:

| File | Change |
|---|---|
| `lib/uia/conditions.ts` | Import builders from `lib/server/conditions.ts`; return `ConditionDto` instead of PS strings |
| `lib/uia/converter.ts` | Same locator→condition mapping; emit `ConditionDto`; remove `conditionToDto` bridge call once done |
| `lib/uia/elements.ts` | Replace `ps.exec(script)` with `server.send('findElement', { condition, scope })` etc. |
| `lib/uia/common.ts` | Replace PS calls with server calls |
| `lib/uia/core.ts` | Delete PS object base class; repurpose or remove |

---

## New Capabilities

Add to `lib/constraints.ts`:

```ts
uiaServerPath: {
    isString: true,
},
uiaServerRecordPath: {
    isString: true,
},
```

| Capability | Type | Default | Description |
|---|---|---|---|
| `uiaServerPath` | string | `native/win-x64/DesktopUIAutomationServer.exe` | Override path to server binary. Use `DESKTOP_DRIVER_PATH` env var as alternative. |
| `uiaServerRecordPath` | string | — | Path to write NDJSON traffic recording. Passed as `--record <path>` to exe. |

---

## Error Code → Appium Error Mapping

Handled inside `DesktopUIAutomationClient.processBuffer()`:

| C# error code | Appium error class |
|---|---|
| `ElementNotFound` | `errors.NoSuchElementError` |
| `InvalidArgument` | `errors.InvalidArgumentError` |
| `InvalidCondition` | `errors.InvalidArgumentError` |
| `PatternNotSupported` | `errors.UnknownError` |
| `UnknownMethod` | `errors.UnknownError` |
| `InternalError` | `errors.UnknownError` |
| `ElementNotAvailable` | `errors.UnknownError` |
| `ProcessError` | `errors.UnknownError` |
| `FileSystemError` | `errors.UnknownError` |
| `InvalidSelector` | `errors.InvalidArgumentError` |

---

## Tests

### Unit (`test/server/`)

**`client.test.ts`** — mock `child_process.spawn`:
- `start()` waits 100ms then sends `debug:ping`
- `sendCommand` increments `requestId` correctly
- Response with matching `id` resolves the correct promise
- Response with unknown `id` logs warn and does not throw
- Process exit rejects all pending promises with `UnknownError`
- `dispose()` sends `'dispose'` command before killing
- `dispose()` kills process after 2s if it doesn't exit
- Error code `'ElementNotFound'` rejects with `NoSuchElementError`
- Error code `'InvalidArgument'` rejects with `InvalidArgumentError`
- Elapsed > 500ms logs SLOW warning
- Recording stream receives both request and response entries

**`protocol.test.ts`**:
- `id` field is number type (not string)
- `ConditionDto` round-trips through `JSON.stringify`/`JSON.parse`

**`conditions.test.ts`**:
- `propertyCondition('NameProperty', 'OK')` → `{ type: 'property', property: 'Name', value: 'OK' }`
- `propertyCondition('automationid', '42')` → `{ type: 'property', property: 'AutomationId', value: '42' }`
- `andCondition(a, b)` → `{ type: 'and', conditions: [a, b] }`
- `notCondition(a)` → `{ type: 'not', condition: a }`

### Integration (`test/server/integration.test.ts`)

Skip if `native/win-x64/DesktopUIAutomationServer.exe` absent (`vi.skipIf`). If present:
- Spawn via `DesktopUIAutomationClient`
- Verify `debug:ping` returns `PingResult` shape with `status: 'ok'`
- Verify `debug:inspectElementTable` returns empty array initially
- Verify `dispose` command causes clean process exit

### Migrate Existing Unit Tests

`test/powershell/` → `test/uia/`. Update mocks from `ps.exec(script)` string matching to `server.send(method, params)` object matching.

### E2E

Existing E2E suite runs unchanged. No new files.

---

## Migration Path

1. Build `DesktopUIAutomationServer.exe`; add to repo as binary artifact or CI build step
2. Add `serverClient` field + `sendCommand` helper to driver; add `startServerSession` / `terminateServerSession`
3. Wire into `createSession`/`deleteSession` behind `useNativeServer: true` capability flag
4. Add `DesktopUIAutomationClient`, `lib/server/protocol.ts`, `lib/server/conditions.ts`, `lib/server/converter-bridge.ts`
5. Migrate command groups one at a time: find → element attrs → click → keyboard → app → screenshot → clipboard → filesystem
6. Each group: update to call `sendCommand`, keep PS fallback, run full E2E suite
7. Once all groups pass: delete PS path, remove `useNativeServer` flag, remove `converter-bridge.ts`
8. Rename `lib/powershell/` → `lib/uia/`, update all imports

---

## Dependencies

No new npm dependencies. `child_process`, `fs`, `net`, `path` are all Node built-ins.

.NET 10 SDK required only on developer/CI machines that run `npm run build:native`. End users and test machines need nothing — the exe is self-contained (~165MB with bundled .NET 10 runtime).

---

## Rollout Notes

- Primary acceptance test: run full E2E suite on a machine with Windows Defender + corporate policy enabled. The PowerShell path still triggers AV; the server path must not.
- `process.env` must **not** be mutated for the WebView2 env var — Appium may run multiple driver sessions in the same process. Use the `serverEnv` copy pattern in `startServerSession`.
- Element `RuntimeId` strings (`"42.1337"`) are stable within a session but are reassigned on session restart. Never store them across sessions.
- The `init` retry loop catches `.NET type initializer` failures specifically. These are rare but permanent for a given process. The only fix is killing the process and spawning a new one. `INIT_RETRY_DELAY_MS=500` gives COM resources time to be released between attempts.
- Property names on the wire must match `ConditionBuilder.PropertyMap` keys exactly (after normalization). Any new UIA property added on the C# side must also be added to `lib/server/conditions.ts`'s `propertyMap`.
