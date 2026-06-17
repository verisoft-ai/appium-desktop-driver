# API Reference

Full reference for Appium Desktop Driver. See [README.md](README.md)
for installation, capabilities, and usage examples.

## Table of Contents

- [Locator Strategies](#locator-strategies)
- [Extension Commands](#extension-commands)
  - [windows: click](#windows-click)
  - [windows: hover](#windows-hover)
  - [windows: scroll](#windows-scroll)
  - [windows: clickAndDrag](#windows-clickanddrag)
  - [windows: keys](#windows-keys)
  - [UI Pattern Commands](#ui-pattern-commands)
  - [App and Window Control](#app-and-window-control)
  - [Clipboard](#clipboard)
  - [File System](#file-system)
  - [Screen Recording](#screen-recording)
  - [Vision-Based Finding](#vision-based-finding)
  - [PowerShell Execution](#powershell-execution)
  - [Cache Requests](#cache-requests)
  - [Java Swing Agent](#java-swing-agent)
- [W3C Actions](#w3c-actions)
- [WebView and CDP](#webview-and-cdp)
- [Java Swing Automation](#java-swing-automation)

## Locator Strategies

| Strategy | WebdriverIO selector | Maps to UIA property |
| --- | --- | --- |
| `accessibility id` | `~AutomationId` | `AutomationId` |
| `class name` | `.ClassName` | `ClassName` |
| `id` | decimal `RuntimeId` string | `RuntimeId` |
| `name` | element visible label | `Name` |
| `tag name` | control type name | `LocalizedControlType` |
| `xpath` | XPath 1.0 expression | any UIA attribute |
| `-windows uiautomation` | raw UIA condition | C#/PowerShell condition |

```js
await driver.$('~SubmitButton')                              // accessibility id
await driver.$('//Button[@Name="OK"]')                       // xpath
await driver.$('.TextBlock')                                 // class name
await driver.$('//Button[1]')                                // nth button
await driver.$('//*[@JavaSimpleClass="HrIDTextField"]')      // Java class name (javaSwing)
```

### XPath substring matching

Use XPath `contains()` or `starts-with()` to match elements by partial name:

```js
await driver.$('//*[contains(@Name, "Execute")]')
await driver.$('//Button[starts-with(@Name, "OK")]')
```

`PropertyConditionFlags.MatchSubstring` is not supported in the `-windows uiautomation` strategy. Use XPath instead.

### -windows uiautomation

Accepts a C#/PowerShell-style UIA condition expression. Supports exact property matches and logical combinators:

```js
// exact match
await driver.findElement('-windows uiautomation', "new PropertyCondition(AutomationElement.NameProperty, 'OK')")

// logical AND
await driver.findElement('-windows uiautomation', "new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button), new PropertyCondition(AutomationElement.NameProperty, 'OK'))")
```

**Limitation:** `PropertyConditionFlags` (e.g. `MatchSubstring`, `IgnoreCase`) are not parsed. Use XPath `contains()` for substring matching.

## Extension Commands

Invoke all extension commands via `executeScript`:

```js
await driver.executeScript('windows: <command>', [args]);
```

Pattern commands that take a single element accept the element
reference directly as the first array item:

```js
const btn = await driver.$('~myButton');
await driver.executeScript('windows: invoke', [btn]);
```

### windows: click

Simulates a mouse click at a screen coordinate or on a UI element.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | no | Click element center; coords become relative |
| `x` | number | no | Horizontal coordinate |
| `y` | number | no | Vertical coordinate |
| `button` | string | no | `left` (default), `middle`, `right`, `back`, `forward` |
| `modifierKeys` | string/string[] | no | Hold keys: `shift`, `ctrl`, `alt`, `win` |
| `durationMs` | number | no | Hold time between press and release |
| `times` | number | no | Repeat count. Default: `1` |
| `interClickDelayMs` | number | no | Delay between clicks. Default: `100` ms |

### windows: hover

Moves the mouse from a start position to an end position.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `startElementId` | string | no | Move from element center |
| `startX` | number | no | Start X coordinate |
| `startY` | number | no | Start Y coordinate |
| `endElementId` | string | no | Move to element center |
| `endX` | number | no | End X coordinate |
| `endY` | number | no | End Y coordinate |
| `modifierKeys` | string/string[] | no | Hold keys during move |
| `durationMs` | number | no | Duration. Default: `500` ms |

### windows: scroll

Mouse wheel scroll. Provide either `deltaX` or `deltaY`.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | no | Scroll relative to element center |
| `x` | number | no | Scroll point X |
| `y` | number | no | Scroll point Y |
| `deltaX` | number | no | Horizontal ticks (negative = left) |
| `deltaY` | number | no | Vertical ticks (negative = toward user) |
| `modifierKeys` | string/string[] | no | Hold keys during scroll |

### windows: clickAndDrag

Press, drag to a target, and release. Provide either
`startElementId` or `startX`+`startY`; same for the end point.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `startElementId` | string | no | Drag start element |
| `startX` | number | no | Drag start X |
| `startY` | number | no | Drag start Y |
| `endElementId` | string | no | Drag end element |
| `endX` | number | no | Drag end X |
| `endY` | number | no | Drag end Y |
| `button` | string | no | Mouse button. Default: `left` |
| `modifierKeys` | string/string[] | no | Hold keys during drag |
| `durationMs` | number | no | Drag duration. Default: `500` ms |

### windows: keys

Sends a sequence of keyboard actions.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `actions` | KeyAction or KeyAction[] | yes | Sequence of key actions |
| `forceUnicode` | boolean | no | Send as Unicode; disables modifier combos |

Each `KeyAction` must contain exactly one of:

| Property | Type | Description |
| --- | --- | --- |
| `pause` | number | Pause in milliseconds |
| `text` | string | Unicode text to type |
| `virtualKeyCode` | number | Windows virtual-key code (e.g. `0x0D` = Enter) |

When using `virtualKeyCode`, the optional `down` boolean presses the
key (`true`), releases it (`false`), or taps it (omit `down`). Always
release any key that was explicitly pressed down.

See the full list of virtual-key codes at
<https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes>.

```js
// Ctrl+A — select all
await driver.executeScript('windows: keys', [{
  actions: [
    { virtualKeyCode: 0x11, down: true },   // Ctrl down
    { virtualKeyCode: 0x41, down: true },   // A down
    { virtualKeyCode: 0x41, down: false },  // A up
    { virtualKeyCode: 0x11, down: false },  // Ctrl up
  ],
}]);
```

### UI Pattern Commands

The following commands each take a single element reference as their
only argument:

| Command | UIA Pattern | Description |
| --- | --- | --- |
| `windows: invoke` | InvokePattern | Activate the element |
| `windows: expand` | ExpandCollapsePattern | Expand the element |
| `windows: collapse` | ExpandCollapsePattern | Collapse the element |
| `windows: toggle` | TogglePattern | Toggle element state |
| `windows: select` | SelectionItemPattern | Select in a list/combo |
| `windows: addToSelection` | SelectionItemPattern | Add to selection |
| `windows: removeFromSelection` | SelectionItemPattern | Remove from selection |
| `windows: scrollIntoView` | ScrollItemPattern | Scroll into view |
| `windows: setFocus` | — | Set keyboard focus |

#### windows: setValue

Sets the element value via ValuePattern. Arg 0: element. Arg 1: value string.

#### windows: getValue

Returns the element's current value string. Arg 0: element.

#### windows: selectedItem

Returns the selected element from a selection container. Arg 0: container element.

#### windows: allSelectedItems

Returns all selected elements as an array. Arg 0: container element.

#### windows: isMultiple

Returns `true` if the container supports multi-select. Arg 0: container element.

#### windows: maximize / minimize / restore / close

Window state control via WindowPattern. Arg 0: window element.

### App and Window Control

#### windows: launchApp

Re-launches the app from the `appium:app` capability. No arguments.

#### windows: closeApp

Closes the current root application window. No arguments.

#### windows: getWindowElement

Returns the automation element ID of the current root window. No arguments.

#### windows: getDeviceTime

Returns the Windows system time as a string. No arguments.

#### windows: getMonitors

Returns an array of monitor descriptors. No arguments.

| Property | Type | Description |
| --- | --- | --- |
| `index` | number | Zero-based monitor index |
| `deviceName` | string | Device name, e.g. `\\.\DISPLAY1` |
| `primary` | boolean | `true` for the primary display |
| `bounds` | object | `{ x, y, width, height }` in virtual screen coords |
| `workingArea` | object | Usable area excluding taskbars |

```js
const monitors = await driver.executeScript('windows: getMonitors', [{}]);
const secondary = monitors.find(m => !m.primary);
if (secondary) {
  await driver.setWindowRect(
    secondary.bounds.x, secondary.bounds.y, null, null
  );
}
```

### Clipboard

#### windows: getClipboard

Returns base64-encoded clipboard content.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `contentType` | `'plaintext'` / `'image'` | no | Default: `'plaintext'` |

#### windows: setClipboard

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `b64Content` | string | yes | Base64-encoded content |
| `contentType` | `'plaintext'` / `'image'` | no | Default: `'plaintext'` |

### File System

#### windows: deleteFile

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Absolute path to the file |

#### windows: deleteFolder

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | yes | Absolute path to the folder |
| `recursive` | boolean | no | Delete recursively. Default: `true` |

### Screen Recording

Screen recording uses the bundled ffmpeg binary. It is not available
if the driver was installed without its npm dependencies.

#### windows: startRecordingScreen

Begins recording the screen.

#### windows: stopRecordingScreen

Stops recording and returns a base64-encoded video string.

```js
await driver.executeScript('windows: startRecordingScreen', [{}]);
// ... run your test ...
const video = await driver.executeScript(
  'windows: stopRecordingScreen', [{}]
);
// video is a base64-encoded mp4
```

### Vision-Based Finding

#### windows: findByVision

Takes a screenshot and sends it to a vision LLM to locate an element by
natural language description. Returns `{ x, y, label }`.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `prompt` | string | yes | Natural language description |
| `model` | string | yes | LLM model identifier |

Supported providers:

| Provider | Model prefix | Environment variable |
| --- | --- | --- |
| Anthropic | `claude-` | `ANTHROPIC_API_KEY` |
| OpenAI | `gpt-`, `o1`, `o3`, `o4` | `OPENAI_API_KEY` |
| Google | `gemini-` | `GEMINI_API_KEY` |
| Amazon Bedrock | `amazon.nova-` | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |

For Amazon Bedrock, set `AWS_REGION` to select the region
(default: `us-east-1`). IAM roles and standard AWS credential
profiles are supported via the default credential chain.

```js
const { x, y } = await driver.executeScript('windows: findByVision', [{
  prompt: 'Save button in the toolbar',
  model: 'claude-sonnet-4-6',
}]);
await driver.executeScript('windows: click', [{ x, y }]);
```

### PowerShell Execution

#### windows: powerShell

Executes a PowerShell script and returns stdout.
Requires the `power_shell` insecure feature flag:

```bash
appium --use-insecure-feature power_shell
```

The driver runs a single persistent PowerShell session per Appium
session, so variables set in one call are available in subsequent
calls.

```js
const output = await driver.executeScript('windows: powerShell', [
  'Get-Process notepad -ErrorAction SilentlyContinue',
]);
```

### Cache Requests

#### windows: pushCacheRequest

Activates a UIA cache request to expose RawView elements in the element
tree.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `treeFilter` | string | yes | UIA condition, e.g. `RawView` |
| `treeScope` | string | no | `Element`, `Children`, or `Subtree` |
| `automationElementMode` | string | no | `None` or `Full`. Default: `Full` |

## W3C Actions

The driver implements the W3C WebDriver Actions API. Supported input
source types: `pointer` (mouse only; touch/pen not supported), `key`,
`wheel`, and `none`.

### Tick ordering

Actions are processed tick by tick. All actions at the same tick index
across input sources run simultaneously (`Promise.all`). Ticks advance
sequentially. Use `pause` entries to align sources.

```js
// Tick 1: keyDown and pointerDown fire at the same time
await driver.performActions([
  {
    type: 'key',
    id: 'keyboard',
    actions: [
      { type: 'pause' },                     // tick 0
      { type: 'keyDown', value: '\uE009' },  // tick 1 — simultaneous
      { type: 'keyUp', value: '\uE009' },    // tick 2
    ],
  },
  {
    type: 'pointer',
    id: 'mouse',
    parameters: { pointerType: 'mouse' },
    actions: [
      { type: 'pointerMove', duration: 0, x: 100, y: 200 }, // tick 0
      { type: 'pointerDown', button: 0 },                    // tick 1
      { type: 'pointerUp', button: 0 },                      // tick 2
    ],
  },
]);
await driver.releaseActions();
```

Always call `driver.releaseActions()` after `performActions()` to
release any held keys or mouse buttons.

### Supported action types

#### Pointer actions

`type: 'pointer'`, `pointerType: 'mouse'`

| Type | Description |
| --- | --- |
| `pointerMove` | Move to `{ x, y }` or `{ origin: element }` |
| `pointerDown` | Press button (`button: 0` = left) |
| `pointerUp` | Release button |
| `pause` | Wait for `duration` ms |

#### Key actions

`type: 'key'`

| Type | Description |
| --- | --- |
| `keyDown` | Press a key (W3C key value or Unicode char) |
| `keyUp` | Release a key |
| `pause` | Wait for `duration` ms |

#### Wheel actions

`type: 'wheel'`

| Type | Description |
| --- | --- |
| `scroll` | Scroll with `deltaX`/`deltaY` |

## WebView and CDP

The driver proxies commands through Chromedriver or EdgeDriver to
automate WebView2 controls, Electron apps, or standalone browsers.

### Required capabilities

| Capability | Description |
| --- | --- |
| `appium:webviewEnabled: true` | Enable CDP support |
| `appium:webviewDevtoolsPort` | CDP port (auto for WebView2) |
| `appium:chromedriverExecutablePath` | Skip Chromedriver download |
| `appium:edgedriverExecutablePath` | Skip EdgeDriver download |

The driver auto-downloads the matching Chromedriver or EdgeDriver
version. Internet access is required unless you provide a local binary.

### Context switching

```js
// List all contexts; pass waitForWebviewMs to wait for page load
const contexts = await driver.execute('mobile: getContexts', [{}]);
// [
//   { id: 'NATIVE_APP' },
//   { id: 'WEBVIEW_...', title: 'My Page', url: '...', type: 'page' }
// ]

const webId = contexts.find(c => c.id.startsWith('WEBVIEW_')).id;

// Switch to web context — all WebDriver commands proxy to Chromedriver
await driver.switchContext(webId);
const title = await driver.getTitle();

// Back to native UIA
await driver.switchContext('NATIVE_APP');
```

`windows:` extension commands always target the native UIA layer
regardless of the active context.

### Launching Chrome or Edge for testing

```js
const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: {
    platformName: 'Windows',
    'appium:automationName': 'DesktopDriver',
    'appium:app':
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'appium:appArguments':
      '--remote-debugging-port=9222 --user-data-dir=C:\\Temp\\cr-test',
    'appium:webviewEnabled': true,
    'appium:webviewDevtoolsPort': 9222,
  },
});
```

Use `--user-data-dir` to isolate the session from any running Chrome
instance.

### WebView2 apps

For apps that embed a WebView2 control, omit `appArguments` and
`webviewDevtoolsPort` — the driver injects the debug port automatically.

```js
capabilities: {
  platformName: 'Windows',
  'appium:automationName': 'DesktopDriver',
  'appium:app': 'C:\\Path\\To\\YourApp.exe',
  'appium:webviewEnabled': true,
}
```

### Java Swing Agent

#### windows: attachJavaSwing

Injects the JVM agent into the running Java process that owns the
current session window, then connects to it. Equivalent to creating the
session with `appium:javaSwing: true` + `appium:appTopLevelWindow` but
allows you to run plain UIA commands first and switch to Java mode later.

No arguments.

**Requires `JAVA_HOME`** — see [Java Swing Automation](#java-swing-automation).

```js
await driver.executeScript('windows: attachJavaSwing', []);
```

---

## Java Swing Automation

The driver automates Java Swing and AWT applications by injecting a
lightweight JVM agent. No `jabswitch`, no JAB DLL.

### How it works

The agent starts a loopback TCP server inside the JVM, writes its port
to `%TEMP%\appium-agent-{pid}.port`, and serves element queries from
the C# server. All tree traversals run on the Swing EDT via
`SwingUtilities.invokeAndWait`.

Three injection paths are available:

### Path A — driver launches the JVM

Set `appium:app` to `javaw.exe` and `appium:javaSwing: true`. The driver
prepends `-javaagent:appium-desktop-agent.jar` to the JVM arguments.
No `JAVA_HOME` required.

```js
capabilities: {
  platformName: 'Windows',
  'appium:automationName': 'DesktopDriver',
  'appium:app': `${process.env.JAVA_HOME}\\bin\\javaw.exe`,
  'appium:appArguments': '-cp C:\\MyApp\\classes MainClass',
  'appium:javaSwing': true,
}
```

### Path B — attach to already-running JVM at session time

Set `appium:appTopLevelWindow` to the decimal HWND of the Java window
and `appium:javaSwing: true`. The driver injects the agent at session
creation via the Java Attach API.

**Requires `JAVA_HOME`** pointing to a JDK. Java 8: `JAVA_HOME/lib/tools.jar`
must exist. Java 9+: `JAVA_HOME/bin/java.exe` suffices.

```js
capabilities: {
  platformName: 'Windows',
  'appium:automationName': 'DesktopDriver',
  'appium:appTopLevelWindow': hwnd,   // decimal HWND string
  'appium:javaSwing': true,
  'appium:shouldCloseApp': false,
}
```

### Path C — inject agent post-session (`windows: attachJavaSwing`)

Create a plain UIA session first, then inject the Java agent at any
point during the session. Useful when you need UIA commands before
switching to Java mode.

**Requires `JAVA_HOME`** — same JDK prerequisite as Path B.

```js
// 1. Create plain UIA session
const driver = await remote({ ..., capabilities: {
  platformName: 'Windows',
  'appium:automationName': 'DesktopDriver',
  'appium:appTopLevelWindow': hwnd,
  'appium:shouldCloseApp': false,
}});

// 2. Inject at any point
await driver.executeScript('windows: attachJavaSwing', []);

// 3. All element queries now use the Java agent
const field = await driver.$('~firstName');
```

### JAVA_HOME setup (required for Path B and C)

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

For Java 8, `JAVA_HOME` must point to a JDK directory containing
`lib\tools.jar`. If it points to a JRE, the driver scans common JDK
sibling directories (`C:\Program Files\Java\jdk*`, Corretto, Zulu)
automatically before failing.

### Locator strategies

All standard locator strategies work for Java elements. XPath tag names
map to Java accessibility roles:

| XPath tag | Java role | Example component |
| --- | --- | --- |
| `Edit` | text | `JTextField`, `JTextArea` |
| `Button` | push button | `JButton` |
| `CheckBox` | check box | `JCheckBox` |
| `ComboBox` | combo box | `JComboBox` |
| `Text` | label | `JLabel` |
| `List` | list | `JList` |
| `Tree` | tree | `JTree` |
| `Table` | table | `JTable` |

```js
// By accessible name (set via setAccessibleName() in app code)
await driver.$('~usernameField')

// By XPath role + name attribute
await driver.$('//Edit[@Name="usernameField"]')

// By Java class name — works even when no accessible name is set
await driver.$('//*[@JavaSimpleClass="HrIDTextField"]')
await driver.$('//*[@JavaClass="com.example.HrIDTextField"]')
```

### Java-specific XPath attributes

Every Java element exposes two extra attributes in the UIA tree and
in XPath predicates:

| Attribute | Value | Example |
| --- | --- | --- |
| `JavaClass` | Fully-qualified class name | `javax.swing.JTextField` |
| `JavaSimpleClass` | Simple class name | `JTextField` |

These are unique per component type and stable across layout changes,
making them the most reliable locator for legacy apps that never call
`setAccessibleName()`.

### Window switching

Switching to a non-Java window mid-session uses normal UIA. The driver
detects Java windows by Win32 class name (`SunAwtFrame` etc.) and
routes each find call to the correct engine automatically.

### Limitations

- **Java 8 and Java 9+** — tested on JDK 8 and JDK 25. All three
  injection paths work on both. Java 9+ requires `JAVA_HOME/bin/java.exe`
  (no `tools.jar` needed).
