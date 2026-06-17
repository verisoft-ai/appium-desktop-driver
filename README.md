# Appium Desktop Driver

Appium Desktop Driver is a Windows UI automation driver for
[Appium 3](https://appium.io). It automates UWP, WinForms, WPF, Win32,
and Java Swing applications via Windows UI Automation (UIA3).

Key advantages over WinAppDriver:

- Faster XPath evaluation against the live UIA tree
- RawView element support (elements hidden from ContentView/ControlView)
- Reliable text input independent of the active keyboard layout
- Java Swing / AWT automation via injected JVM agent (no JAB required)
- WebView2, Chrome, and Edge embedded content via CDP
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

## Examples

### Java Swing via JVM agent

Set `appium:javaSwing: true` and the driver injects a JVM agent that
exposes Swing/AWT elements over loopback TCP. No `jabswitch`, no JAB DLL.

Three injection paths are available depending on whether you control the
JVM launch.

#### Path A — driver launches the JVM (`appium:app`)

The driver prepends `-javaagent:` to the JVM arguments before launch.
No `JAVA_HOME` required.

```js
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:app': `${process.env.JAVA_HOME}\\bin\\javaw.exe`,
    'appium:appArguments': '-cp C:\\MyApp\\classes MainClass',
    'appium:javaSwing': true,
  },
});

// Find by accessible name (set via setAccessibleName() in Java code)
const username = await driver.$('~usernameField');
await username.setValue('admin');

// Find by Java class name — works even when no accessible name is set
const passwordField = await driver.$('//*[@JavaSimpleClass="JPasswordField"]');
await passwordField.setValue('secret');

await driver.$('~loginButton').then(btn => btn.click());
await driver.deleteSession();
```

#### Path B — attach to already-running JVM at session time (`appTopLevelWindow` + `javaSwing`)

Use when the Java app was launched externally. The driver injects the
agent via the Java Attach API at session creation.

**Requires:** `JAVA_HOME` pointing to a JDK (not just a JRE).
Java 8: `JAVA_HOME/lib/tools.jar` must exist.
Java 9+: `JAVA_HOME/bin/java.exe` must be reachable.

```js
import { remote } from 'webdriverio';

// hwnd: decimal window handle string — obtain from Get-Process in PowerShell
// or from launchJavaSwingFormExternally() in the e2e test helpers
const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:appTopLevelWindow': hwnd,   // decimal HWND string
    'appium:javaSwing': true,
    'appium:shouldCloseApp': false,
  },
});
await driver.setTimeout({ implicit: 3000 });

const field = await driver.$('~lastName');
await field.setValue('AttachTest');
await driver.deleteSession();
```

#### Path C — inject agent into running JVM post-session (`windows: attachJavaSwing`)

Use when you need to run UIA commands first and then switch to Java mode
mid-session.

**Requires:** same `JAVA_HOME` / JDK prerequisite as Path B.

```js
import { remote } from 'webdriverio';

// 1. Create a plain UIA session (no javaSwing)
const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:appTopLevelWindow': hwnd,
    'appium:shouldCloseApp': false,
  },
});

// 2. Inject the Java agent at any point during the session
await driver.executeScript('windows: attachJavaSwing', []);

// 3. Now all element queries use the Java agent
const field = await driver.$('~firstName');
await field.setValue('PostAttach');
await driver.deleteSession();
```

#### JAVA_HOME setup (required for Path B and C)

Attach paths use the Java Attach API and need a JDK installation:

```powershell
# Check current value
[System.Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine")

# Set permanently (run as Administrator)
[System.Environment]::SetEnvironmentVariable(
  "JAVA_HOME",
  "C:\Program Files\Java\jdk1.8.0_xxx",
  "Machine"
)
```

For Java 8, `JAVA_HOME` must point to a JDK directory that contains
`lib\tools.jar`. If `JAVA_HOME` points to a JRE, the driver searches
common JDK directories alongside it automatically.

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

// Give the app time to open, then switch to the new window
await driver.pause(2000);
const allHandles = await driver.getWindowHandles();
await driver.switchToWindow(allHandles[allHandles.length - 1]);

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
