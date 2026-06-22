# Appium Desktop Driver

Appium Desktop Driver is a Windows UI automation driver for
[Appium 3](https://appium.io). It automates UWP, WinForms, WPF, Win32,
Java Swing, and legacy Internet Explorer applications.

Key advantages over WinAppDriver:

- Faster XPath evaluation against the live UIA tree
- RawView element support (elements hidden from ContentView/ControlView)
- Reliable text input independent of the active keyboard layout
- Java Swing / AWT automation via injected JVM agent (no JAB required)
- WebView2, Chrome, and Edge embedded content via CDP
- Legacy Internet Explorer via IEDriverServer (auto-downloaded)
- Built-in screen recording, clipboard API, and vision-based finding
- MCP server for direct use with AI coding agents

## Installation

```bash
appium driver install --source=npm appium-desktop-driver
```

Requires Appium 3 and Windows 10 or later.

## Capabilities

All capabilities use the `appium:` prefix in W3C format
(except `platformName`).

| Capability | Type | Description |
| --- | --- | --- |
| `platformName` | string | **Required.** Must be `Windows` |
| `appium:automationName` | string | **Required.** Must be `DesktopDriver` |
| `appium:app` | string | Exe path, UWP AUMID, or `Root` for the desktop |
| `appium:appTopLevelWindow` | string | Hex/decimal handle to attach to existing window |
| `appium:appArguments` | string | CLI arguments for the launched process |
| `appium:appWorkingDir` | string | Working directory for the process |
| `appium:appEnvironment` | object | Env vars injected for the session lifetime |
| `appium:ms:waitForAppLaunch` | number | Seconds (<=120) or ms (>120) to wait for window |
| `appium:shouldCloseApp` | boolean | Close the window at session end. Default: `true` |
| `appium:prerun` | object | `{ script }` or `{ command }` — PowerShell before start |
| `appium:postrun` | object | `{ script }` or `{ command }` — PowerShell after end |
| `appium:isolatedScriptExecution` | boolean | Isolated PS for pre/postrun. Default: `false` |
| `appium:smoothPointerMove` | string | CSS easing for mouse (e.g. `ease-in`) |
| `appium:delayBeforeClick` | number | Milliseconds before each click |
| `appium:delayAfterClick` | number | Milliseconds after each click |
| `appium:javaSwing` | boolean | Enable JVM agent for Java Swing/AWT apps |
| `appium:jdkPath` | string | Path to JDK root (e.g. `C:\Program Files\Java\jdk1.8.0_xxx`). Overrides `JAVA_HOME` for agent injection. Required only for Path B/C. |
| `appium:webviewEnabled` | boolean | Enable WebView2 / Chrome / Edge CDP |
| `appium:webviewDevtoolsPort` | number | CDP port (auto-selected when omitted) |
| `appium:chromedriverExecutablePath` | string | Local Chromedriver binary |
| `appium:edgedriverExecutablePath` | string | Local msedgedriver binary |
| `appium:chromedriverCdnUrl` | string | Custom CDN for Chromedriver downloads |
| `appium:edgedriverCdnUrl` | string | Custom CDN for EdgeDriver downloads |
| `appium:ffmpegExecutablePath` | string | Local ffmpeg binary for screen recording |
| `appium:ms:forcequit` | boolean | Force-kill process on session close |
| `appium:ms:experimental-webdriver` | boolean | Experimental WebDriver features |
| `appium:logFile` | string | Path to write session logs |
| `appium:useInternetExplorer` | boolean | Enable legacy IE mode. IEDriverServer is downloaded and cached automatically on first use. All WebDriver commands proxy through IEDriverServer instead of UIA. |
| `appium:ieDriverServerPath` | string | Path to a local `IEDriverServer.exe`. Overrides the auto-downloaded binary when `useInternetExplorer` is true. |

## Examples

### Java Swing via JVM agent

The driver automates Java Swing/AWT applications by injecting a lightweight
JVM agent — no `jabswitch`, no JAB DLL required.

Three injection paths are available:

- **Path A** — driver launches the JVM (`appium:app` + `appium:javaSwing: true`). No `JAVA_HOME` needed.
- **Path B** — attach to an already-running JVM at session time (`appium:appTopLevelWindow` + `appium:javaSwing: true`). Requires `JAVA_HOME` or `appium:jdkPath` pointing to a JDK.
- **Path C** — inject agent mid-session via `windows: attachJavaSwing`. Start any session, switch to the Java window, then call the command. Requires `JAVA_HOME` or `appium:jdkPath` (or pass `jdkPath` as a script argument).

See [API.md — Java Swing Automation](./API.md#java-swing-automation) for full examples, JAVA_HOME setup, and supported XPath attributes.

### Desktop root: click an icon and switch windows

```js
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:app': 'Root', // attach to the Windows desktop shell
  },
});

// Double-click a desktop shortcut by its accessible name
const icon = await driver.$('~Notepad');
await driver.executeScript('windows: click', [{
  elementId: icon.elementId,
  times: 2,
  interClickDelayMs: 100,
}]);

// Give the app time to open, then switch to the new window by handle...
await driver.pause(2000);
const allHandles = await driver.getWindowHandles();
await driver.switchToWindow(allHandles[allHandles.length - 1]);

// ...or switch by title (partial, case-insensitive)
await driver.executeScript('windows: switchToWindowByTitle', [{ title: 'Notepad' }]);

const titleBar = await driver.$('//TitleBar');
console.log(await titleBar.getText());

await driver.deleteSession();
```

### Windows Calculator: invoke pattern

`windows: invoke` fires the UIA InvokePattern. Prefer it over `.click()`
for controls that do not respond reliably to pointer events.

```js
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:app': 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
  },
});

async function invoke(el) {
  await driver.executeScript('windows: invoke', [el]);
}

// 5 + 3 =
await invoke(await driver.$('~num5Button'));
await invoke(await driver.$('~plusButton'));
await invoke(await driver.$('~num3Button'));
await invoke(await driver.$('~equalButton'));

const display = await driver.$('~CalculatorResults');
console.log(await display.getText()); // "Display is 8"

await driver.deleteSession();
```

### Ctrl+drag via W3C Actions

Actions are processed tick by tick. All actions at the same tick index
across input sources run simultaneously. Ticks advance sequentially.
Use `pause` entries to keep sources aligned when mixing keyboard and
pointer inputs.

```js
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:app': 'C:\\MyApp\\app.exe',
  },
});

const source = await driver.$('~dragSource');
const target = await driver.$('~dropTarget');

await driver.performActions([
  {
    type: 'key',
    id: 'keyboard',
    actions: [
      { type: 'pause' },                    // tick 0 — wait for mouse move
      { type: 'keyDown', value: '\uE009' }, // tick 1 — Ctrl key (W3C key value)
      { type: 'pause' },                    // tick 2 — hold
      { type: 'pause' },                    // tick 3 — hold during drag
      { type: 'keyUp', value: '\uE009' },   // tick 4 — Ctrl up
    ],
  },
  {
    type: 'pointer',
    id: 'mouse',
    parameters: { pointerType: 'mouse' },
    actions: [
      { type: 'pointerMove', duration: 0, origin: source },   // tick 0
      { type: 'pointerDown', button: 0 },                      // tick 1
      { type: 'pause', duration: 300 },                        // tick 2
      { type: 'pointerMove', duration: 600, origin: target },  // tick 3
      { type: 'pointerUp', button: 0 },                        // tick 4
    ],
  },
]);

await driver.releaseActions();
await driver.deleteSession();
```

### Legacy Internet Explorer

IE uses MSAA/COM rather than UIA, so the driver bypasses its C# server
entirely and proxies all WebDriver commands through IEDriverServer.

`IEDriverServer.exe` is downloaded and cached automatically on first use
(requires internet access). Subsequent sessions skip the download.

No `appium:app` capability is needed. IEDriverServer launches
`iexplore.exe` automatically when the session is created.

**IE must be configured before the first session:**

- Internet Options → Security: disable Protected Mode on all four zones
- Internet Options → Advanced: disable Enhanced Protected Mode
- View → Zoom: set to exactly 100%

```js
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:useInternetExplorer': true,
  },
});

await driver.url('https://example.com');
const h1 = await driver.$('h1');
console.log(await h1.getText()); // "Example Domain"

await driver.deleteSession();
```

To use a locally downloaded binary instead of the auto-downloaded one:

```js
'appium:useInternetExplorer': true,
'appium:ieDriverServerPath': 'C:\\WebDriver\\IEDriverServer.exe',
```

See [API.md — Internet Explorer](./API.md#internet-explorer) for
troubleshooting and VM setup notes.

## API Reference

Full reference for all locator strategies, `windows:` extension
commands, WebView/CDP automation, screen recording, and vision-based
finding: [API.md](API.md).

## Development

```bash
npm install
npm run lint
npm run build
npm run test
```

Uses [Comment Tagged Templates](https://marketplace.visualstudio.com/items?itemName=bierner.comment-tagged-templates)
for PowerShell/C syntax highlighting in VS Code.
