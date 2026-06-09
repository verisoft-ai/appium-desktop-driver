# Appium Desktop MCP Server

The `appium-desktop-driver` package ships a built-in **Model Context
Protocol (MCP)** server that lets AI agents (Claude, Cursor, Copilot,
etc.) automate Windows desktop applications via natural language — no
test-framework code required.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the MCP Server](#running-the-mcp-server)
- [Connecting an AI Client](#connecting-an-ai-client)
- [Startup Sequence](#startup-sequence)
- [Tool Reference](#tool-reference)
  - [Session Management](#session-management)
  - [Element Discovery](#element-discovery)
  - [Element Inspection](#element-inspection)
  - [Basic Interaction](#basic-interaction)
  - [Advanced Input](#advanced-input)
  - [UIA Patterns](#uia-patterns)
  - [Window Management](#window-management)
  - [Application Control](#application-control)
  - [Clipboard](#clipboard)
  - [Vision](#vision)
  - [Webview / Context](#webview--context)
- [Locator Strategies](#locator-strategies)
- [Capabilities Reference](#capabilities-reference)
- [Example Workflows](#example-workflows)
- [File Structure](#file-structure)

---

## Overview

The MCP server wraps the **Appium Desktop driver** in a stateful,
tool-based interface that AI agents can call over the
[Model Context Protocol](https://modelcontextprotocol.io). The agent:

1. Calls `create_session` to launch a Windows app (Win32, UWP, or
   classic), or `attach_session` to connect to an existing session.
2. Uses `find_element` / `find_elements` to locate UI elements.
3. Uses interaction tools (`click_element`, `set_value`, `send_keys`,
   etc.) to drive the app.
4. Calls `delete_session` when done.

All communication between the MCP host (AI client) and this server goes
over **stdio**. An Appium server must already be running before the MCP
server starts — it connects to the address configured via `APPIUM_HOST`
and `APPIUM_PORT`.

---

## Architecture

```text
AI Client (Claude / Cursor / etc.)
        │  stdio (MCP protocol)
        ▼
┌──────────────────────────────────────────┐
│          desktop-driver-mcp server       │
│  lib/mcp/index.ts                        │
│  ┌──────────────────┐                    │
│  │  AppiumSession   │                    │
│  │ (WebdriverIO     │                    │
│  │  remote driver)  │                    │
│  └────────┬─────────┘                    │
│           │                              │
│           ▼                              │
│       MCP Tools (50 tools)               │
└──────────────────────────────────────────┘
        │
        ▼  HTTP / WebSocket
Appium Server :4723 (must be running)
        │
        ▼
Windows UI Automation (UIA3)
```

### Key source files

| File | Responsibility |
| --- | --- |
| [lib/mcp/index.ts](lib/mcp/index.ts) | Entry point — wires config, session, tools, and transport |
| [lib/mcp/config.ts](lib/mcp/config.ts) | Reads environment variables into `McpConfig` |
| [lib/mcp/session.ts](lib/mcp/session.ts) | Creates and deletes the WebdriverIO session |
| [lib/mcp/errors.ts](lib/mcp/errors.ts) | Formats errors for MCP tool responses |
| [lib/mcp/tools/index.ts](lib/mcp/tools/index.ts) | Registers all tool groups |
| [lib/mcp/tools/session.ts](lib/mcp/tools/session.ts) | `create_session`, `attach_session`, `delete_session`, `get_session_status` |
| [lib/mcp/tools/find.ts](lib/mcp/tools/find.ts) | `find_element`, `find_elements`, `find_child_element`, `wait_for_element` |
| [lib/mcp/tools/inspect.ts](lib/mcp/tools/inspect.ts) | `get_element_info` |
| [lib/mcp/tools/interact.ts](lib/mcp/tools/interact.ts) | `click_element`, `set_value`, `clear_element`, `get_text`, `get_attribute`, `is_element_displayed`, `is_element_enabled` |
| [lib/mcp/tools/advanced.ts](lib/mcp/tools/advanced.ts) | `advanced_click`, `send_keys`, `hover`, `scroll`, `click_and_drag` |
| [lib/mcp/tools/patterns.ts](lib/mcp/tools/patterns.ts) | UIA pattern tools — invoke, expand/collapse, toggle, value, focus, select |
| [lib/mcp/tools/window.ts](lib/mcp/tools/window.ts) | Page source, window rect, handles, window state, monitors |
| [lib/mcp/tools/app.ts](lib/mcp/tools/app.ts) | `get_window_element`, `launch_app`, `close_app`, `get_device_time` |
| [lib/mcp/tools/clipboard.ts](lib/mcp/tools/clipboard.ts) | `get_clipboard`, `set_clipboard` |
| [lib/mcp/tools/vision.ts](lib/mcp/tools/vision.ts) | `analyze_screen`, `find_by_vision` |
| [lib/mcp/tools/context.ts](lib/mcp/tools/context.ts) | `get_current_context`, `get_contexts`, `set_context` |

---

## Prerequisites

- **Windows 10 / 11** (64-bit)
- **Node.js 18+**
- **Appium 3.x** running with the Desktop driver installed:

```bash
npm install -g appium
appium driver install --source=npm appium-desktop-driver
appium --allow-insecure modify_fs
```

- An MCP-capable AI client (Claude Desktop, Cursor, VS Code with MCP
  extension, etc.)

---

## Installation

### From npm (recommended)

```bash
npm install appium-desktop-driver
```

The MCP entry point is automatically registered as a `bin` command:

```text
desktop-driver-mcp  →  build/lib/mcp/index.js
```

### From source

```bash
git clone https://github.com/verisoft-ai/appium-desktop-driver.git
cd appium-desktop-driver
npm install
npm run build
```

---

## Configuration

All configuration is via **environment variables** read at startup.

| Variable | Default | Description |
| --- | --- | --- |
| `APPIUM_HOST` | `127.0.0.1` | Hostname of the running Appium server |
| `APPIUM_PORT` | `4723` | Port of the running Appium server |

The MCP server does **not** start or manage the Appium process. Appium
must be running before the MCP server starts.

### Vision API keys

Required only when using `find_by_vision`:

| Variable | Required for |
| --- | --- |
| `ANTHROPIC_API_KEY` | `claude-*` models |
| `OPENAI_API_KEY` | `gpt-*` / o-series models |
| `GEMINI_API_KEY` | `gemini-*` models |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | `amazon.nova-*` models |

---

## Running the MCP Server

### Start Appium first

```bash
appium --allow-insecure modify_fs
```

### Start the MCP server

```bash
# Using the npm script
npm run mcp:start

# Using npx (after npm install)
npx desktop-driver-mcp

# After global install
desktop-driver-mcp
```

### With custom configuration

```bash
APPIUM_PORT=4724 desktop-driver-mcp
```

---

## Connecting an AI Client

### Claude Desktop

Add to `claude_desktop_config.json` (usually at
`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "appium-desktop-driver": {
      "command": "npx",
      "args": ["desktop-driver-mcp"],
      "env": {
        "APPIUM_HOST": "127.0.0.1",
        "APPIUM_PORT": "4723"
      }
    }
  }
}
```

Or, if using a local build:

```json
{
  "mcpServers": {
    "appium-desktop-driver": {
      "command": "node",
      "args": ["C:/path/to/appium-desktop-driver/build/lib/mcp/index.js"]
    }
  }
}
```

### Cursor / VS Code MCP Extension

```json
{
  "mcp": {
    "servers": {
      "appium-desktop-driver": {
        "type": "stdio",
        "command": "npx",
        "args": ["desktop-driver-mcp"]
      }
    }
  }
}
```

---

## Startup Sequence

When the server starts it performs these steps in order:

1. **Load config** — reads `APPIUM_HOST` and `APPIUM_PORT` from
   environment variables. Fails immediately on invalid values.
2. **Create session holder** — `AppiumSession` object is initialized;
   no app is launched yet.
3. **Create MCP server** — `McpServer` from `@modelcontextprotocol/sdk`
   with name `desktop-driver-mcp` and version `1.3.0`.
4. **Register tools** — all 50 tools are registered (see
   [Tool Reference](#tool-reference)).
5. **Register shutdown handlers** — `SIGINT`, `SIGTERM`, and
   `stdin close` all trigger graceful shutdown (session delete with a
   10 s timeout).
6. **Connect stdio transport** — the server is now ready for the AI
   client.

> **Note:** `stdout` is owned entirely by the MCP protocol. All log
> messages go to `stderr`.

---

## Tool Reference

### Session Management

#### `create_session`

Start an Appium session by launching a Windows application. Must be
called before any other tool.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `app` | string | yes | Executable path, UWP App ID, or `Root` to attach to the desktop |
| `appArguments` | string | no | Command-line arguments |
| `appWorkingDir` | string | no | Working directory for the app process |
| `waitForAppLaunch` | number (ms) | no | Extra wait after launch |
| `shouldCloseApp` | boolean | no | Default `true` — close app on `delete_session` |
| `implicitTimeout` | number (ms) | no | Default `1500` — implicit element wait |
| `delayAfterClick` | number (ms) | no | Wait after every click |
| `delayBeforeClick` | number (ms) | no | Wait before every click |
| `smoothPointerMove` | string | no | Easing function name for pointer movement |
| `webviewEnabled` | boolean | no | Enable webview/hybrid app support |
| `webviewDevtoolsPort` | number | no | DevTools port for embedded webview |
| `javaSwing` | boolean | no | Enable Java Swing UIA bridge |

Returns: confirmation string with the app name.

---

#### `attach_session`

Connect to an existing Appium session instead of launching a new app.
Useful when the app is already running.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `sessionId` | string | yes | Existing Appium session ID to attach to |

---

#### `delete_session`

End the current Appium session. Closes the app (unless
`shouldCloseApp=false` was set at creation). No parameters.

---

#### `get_session_status`

Check whether a session is currently active. No parameters. Returns
`"Session is active."` or `"No active session."`.

---

### Element Discovery

#### `find_element`

Find a single UI element. Returns an **element ID string** used by
interaction tools.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `strategy` | enum | yes | Locator strategy (see [Locator Strategies](#locator-strategies)) |
| `selector` | string | yes | The selector value |

Returns: element ID string, or error if not found.

---

#### `find_elements`

Find all UI elements matching the selector. Same parameters as
`find_element`. Returns: JSON array of element ID strings.

---

#### `find_child_element`

Find a child element within a known parent element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `parentElementId` | string | yes | Element ID of the parent |
| `strategy` | enum | yes | Locator strategy |
| `selector` | string | yes | The selector value |

Returns: child element ID string.

---

#### `wait_for_element`

Poll for an element until it appears or a timeout is reached.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `strategy` | enum | yes | Locator strategy |
| `selector` | string | yes | The selector value |
| `timeoutMs` | number | no | Max wait in ms (default: 5000) |
| `pollIntervalMs` | number | no | Poll interval in ms (default: 500) |

Returns: element ID string once found, or error on timeout.

---

### Element Inspection

#### `get_element_info`

Retrieve all key UIA properties of an element and get ranked selector
suggestions. Always call this after `find_element` when generating
automated test code — it gives you the best locator to use.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | yes | Element ID returned by `find_element` |

Returns: JSON object with `elementId`, `name`, `automationId`,
`className`, `controlType`, `isEnabled`, and `suggestedSelectors`
(ranked by reliability: `accessibility id` > `name` > `xpath` >
`class name`).

---

### Basic Interaction

All interaction tools accept an `elementId` returned by a find tool.

#### `click_element`

Click a UI element at its center.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `set_value`

Clear an input element and type a new value.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | yes | |
| `value` | string | yes | Text to type |

---

#### `clear_element`

Clear the text content of an input element.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `get_text`

Get the visible text of a UI element.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

Returns: text string.

---

#### `get_attribute`

Get any UIA attribute of an element.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | yes | |
| `attribute` | string | yes | e.g. `Name`, `AutomationId`, `ClassName`, `IsEnabled`, `ControlType`, `Value.Value` |

Returns: attribute value string.

---

#### `is_element_displayed`

Check whether an element is visible on screen (not off-screen).

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

Returns: `"true"` or `"false"`.

---

#### `is_element_enabled`

Check whether an element is enabled and interactable.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

Returns: `"true"` or `"false"`.

---

### Advanced Input

#### `advanced_click`

Perform a click with modifier keys, multiple clicks, a specific mouse
button, or a hold duration.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `elementId` | string | — | Element to click (use either `elementId` or `x`+`y`) |
| `x` | number | — | Absolute screen x coordinate |
| `y` | number | — | Absolute screen y coordinate |
| `button` | enum | `left` | `left`, `right`, `middle`, `back`, `forward` |
| `modifierKeys` | array | `[]` | Any of `shift`, `ctrl`, `alt`, `win` |
| `durationMs` | number | `0` | Hold duration in ms (long-press) |
| `times` | number | `1` | Click count (`2` = double-click) |
| `interClickDelayMs` | number | `100` | Delay between clicks |

---

#### `send_keys`

Send a sequence of keyboard actions — text, virtual key codes, or
pauses.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `actions` | array | yes | Sequence of action objects (see below) |
| `forceUnicode` | boolean | no | Use Unicode input for special characters |

Each action object can contain:

| Field | Type | Description |
| --- | --- | --- |
| `pause` | number | Pause in milliseconds |
| `text` | string | Text to type (Unicode supported) |
| `virtualKeyCode` | number | Windows VK code (e.g. `13` = Enter, `27` = Escape) |
| `down` | boolean | `true` = key-down only, `false` = key-up only, omit = full press |

**Example** — press Ctrl+A then Delete:

```json
{
  "actions": [
    { "virtualKeyCode": 17, "down": true },
    { "virtualKeyCode": 65 },
    { "virtualKeyCode": 17, "down": false },
    { "virtualKeyCode": 46 }
  ]
}
```

---

#### `hover`

Move the mouse pointer from one position to another (hover effects,
tooltips, drag-without-click).

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `startElementId` | string | — | Element to start from |
| `startX` / `startY` | number | — | Absolute start coordinates |
| `endElementId` | string | — | Element to end at |
| `endX` / `endY` | number | — | Absolute end coordinates |
| `modifierKeys` | array | `[]` | `shift`, `ctrl`, `alt`, `win` |
| `durationMs` | number | `500` | Duration of movement |

---

#### `scroll`

Scroll the mouse wheel at an element or screen coordinate.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `elementId` | string | — | Element to scroll over |
| `x` / `y` | number | — | Absolute screen coordinates |
| `deltaX` | number | `0` | Horizontal scroll (positive = right) |
| `deltaY` | number | `0` | Vertical scroll (positive = down) |
| `modifierKeys` | array | `[]` | |

---

#### `click_and_drag`

Click and drag from one position to another (resize, reorder, move).

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `startElementId` | string | — | Drag source element |
| `startX` / `startY` | number | — | Absolute start coordinates |
| `endElementId` | string | — | Drag target element |
| `endX` / `endY` | number | — | Absolute end coordinates |
| `modifierKeys` | array | `[]` | |
| `durationMs` | number | `500` | Drag duration |
| `button` | enum | `left` | `left`, `right`, `middle` |

---

### UIA Patterns

These tools use Windows UI Automation patterns directly, bypassing mouse
simulation. More reliable for programmatic interactions.

#### `invoke_element`

Invoke the default action via the **Invoke** pattern (button click, menu
item selection, etc.).

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `expand_element`

Expand a collapsible element via the **ExpandCollapse** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `collapse_element`

Collapse an expanded element via the **ExpandCollapse** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `toggle_element`

Toggle a checkbox or toggle button via the **Toggle** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `get_toggle_state`

Get the current toggle state of a checkbox or toggle button.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

Returns: toggle state string (e.g. `"On"`, `"Off"`, `"Indeterminate"`).

---

#### `set_element_value`

Set the value of an element via the **Value** or **RangeValue** pattern
(sliders, spin boxes, editable cells).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `elementId` | string | yes | |
| `value` | string | yes | Value to set |

---

#### `get_element_value`

Get the value of an element via the **Value** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `focus_element`

Set keyboard focus to an element via the **Focus** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `select_item`

Select an item in a list or combo box via the **SelectionItem** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

### Window Management

#### `get_page_source`

Get the full XML UI element tree of the current window. Use this to
understand the app structure before deciding what to interact with.
No parameters. Returns: XML string.

---

#### `get_window_rect`

Get the position and size of the current app window. No parameters.
Returns: JSON object `{ x, y, width, height }`.

---

#### `get_window_handles`

Get all window handles for the current session (for multi-window apps).
No parameters. Returns: JSON array of handle strings.

---

#### `switch_to_window`

Switch automation focus to a different window.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `handle` | string | yes | Handle from `get_window_handles` |

---

#### `maximize_window`

Maximize a window element via the **Window** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `minimize_window`

Minimize a window element via the **Window** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `restore_window`

Restore a minimized or maximized window to its normal state.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `close_window`

Close a window element via the **Window** pattern.

| Parameter | Type | Required |
| --- | --- | --- |
| `elementId` | string | yes |

---

#### `get_monitors`

List all connected monitors with their bounds and DPI information.
No parameters. Returns: JSON array of monitor objects.

---

### Application Control

#### `get_window_element`

Get the root UI element of the current app window. Returns an element ID
for the top-level window (useful for UIA pattern operations on the
window itself). No parameters. Returns: element ID string.

---

#### `launch_app`

Re-launch the application configured in the session (if closed with
`close_app`). No parameters.

---

#### `close_app`

Close the application under test without ending the session. Use
`launch_app` to restart it. No parameters.

---

#### `get_device_time`

Get the current date/time on the Windows device. No parameters.
Returns: datetime string.

---

### Clipboard

#### `get_clipboard`

Read the current clipboard contents.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `contentType` | enum | `plaintext` | `plaintext` or `image` |

Returns: base64-encoded string of clipboard contents.

---

#### `set_clipboard`

Set the clipboard contents.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `b64Content` | string | yes | Base64-encoded content |
| `contentType` | enum | no | `plaintext` (default) or `image` |

---

### Vision

#### `analyze_screen`

Take a screenshot and return it to the calling agent for visual
analysis. **No external API key required.** Includes DPI-aware
coordinate mapping so any coordinates identified are ready for click
interactions.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `prompt` | string | yes | Question or instruction about the screenshot |

Returns: the screenshot image and DPI-corrected coordinate mapping
instructions for the calling agent.

---

#### `find_by_vision`

Take a screenshot and delegate visual analysis to an external vision
model, returning the result. Use when analysis should be performed by a
separate model rather than the calling agent. Requires an external API
key (see [Vision API keys](#vision-api-keys)).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `prompt` | string | yes | Question or instruction about the screenshot |
| `model` | string | yes | Vision model to use (determines which API key is required) |
| `responseFormat` | enum | no | `"coordinates"` (default) returns `{x, y, label}`; `"text"` returns a plain-text answer |

**Model prefixes and required credentials:**

| Model prefix | Required env var |
| --- | --- |
| `claude-*` | `ANTHROPIC_API_KEY` |
| `gpt-*` / o-series | `OPENAI_API_KEY` |
| `gemini-*` | `GEMINI_API_KEY` |
| `amazon.nova-*` | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |

---

### Webview / Context

Use these tools when automating hybrid apps that embed a web browser
(Electron, CEF, Edge WebView2, etc.).

#### `get_current_context`

Get the currently active context. No parameters.

Returns: `"NATIVE_APP"` (UIA element tree, `find_element` works here)
or `"WEBVIEW_<id>"` (web DOM, standard web selectors apply).

---

#### `get_contexts`

List all available contexts. No parameters.

Returns: JSON array with `"NATIVE_APP"` and any `"WEBVIEW_<id>"`
contexts present.

---

#### `set_context`

Switch the active context.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | `"NATIVE_APP"` or a `"WEBVIEW_<id>"` from `get_contexts` |

---

## Locator Strategies

| Strategy | Description | Example selector |
| --- | --- | --- |
| `accessibility id` | UIA AutomationId (most reliable) | `CalculatorResults` |
| `name` | Element Name property | `Close` |
| `id` | Same as AutomationId | `TextBox1` |
| `xpath` | XPath expression | `//Button[@Name='OK']` |
| `class name` | UIA ControlType class | `TextBlock` |
| `tag name` | UIA element type | `Button` |
| `-windows uiautomation` | Raw UIA condition expression | *(advanced)* |

**Best practice:** prefer `accessibility id` (AutomationId) when
available. Use `get_page_source` to discover AutomationIds and element
hierarchy, then call `get_element_info` to get ranked selector
suggestions.

---

## Capabilities Reference

Capabilities passed via `create_session` map to Appium Desktop driver
capabilities:

| Capability | Session parameter | Description |
| --- | --- | --- |
| `appium:app` | `app` | Application to launch |
| `appium:appArguments` | `appArguments` | CLI arguments |
| `appium:appWorkingDir` | `appWorkingDir` | Working directory |
| `appium:ms:waitForAppLaunch` | `waitForAppLaunch` | Post-launch wait (ms) |
| `appium:shouldCloseApp` | `shouldCloseApp` | Close on session delete |
| `appium:delayAfterClick` | `delayAfterClick` | Click delay (ms) |
| `appium:delayBeforeClick` | `delayBeforeClick` | Pre-click delay (ms) |
| `appium:smoothPointerMove` | `smoothPointerMove` | Pointer easing function |
| `appium:webviewEnabled` | `webviewEnabled` | Enable webview support |
| `appium:webviewDevtoolsPort` | `webviewDevtoolsPort` | DevTools port |
| `appium:javaSwing` | `javaSwing` | Java Swing UIA bridge |

---

## Example Workflows

### Open Notepad and type text

```text
1. create_session(app="C:\Windows\notepad.exe")
2. find_element(strategy="class name", selector="RichEditD2DPT")  → <id>
3. set_value(elementId=<id>, value="Hello from the AI agent!")
4. delete_session()
```

### Open Windows Calculator and perform a calculation

```text
1. create_session(app="Microsoft.WindowsCalculator_8wekyb3d8bbwe!App")
2. find_element(strategy="accessibility id", selector="num5Button")  → <5>
3. click_element(elementId=<5>)
4. find_element(strategy="accessibility id", selector="multiplyButton")
5. click_element(elementId=<mul>)
6. find_element(strategy="accessibility id", selector="num3Button")  → <3>
7. click_element(elementId=<3>)
8. find_element(strategy="accessibility id", selector="equalButton")  → <eq>
9. click_element(elementId=<eq>)
10. find_element(strategy="accessibility id", selector="CalculatorResults")
11. get_text(elementId=<res>)  → "Display is 15"
12. delete_session()
```

### Inspect an unknown app

```text
1. create_session(app="C:\MyApp\MyApp.exe")
2. get_page_source()        # inspect element tree XML
3. analyze_screen(prompt="describe what is visible")
4. get_window_rect()        # window bounds
5. ...interact based on findings...
6. delete_session()
```

### Right-click context menu

```text
1. create_session(app="C:\Windows\explorer.exe", appArguments="C:\Users")
2. find_element(strategy="name", selector="Documents")  → <doc>
3. advanced_click(elementId=<doc>, button="right")
4. find_element(strategy="name", selector="Properties")  → <props>
5. click_element(elementId=<props>)
6. delete_session()
```

### Automate a hybrid app with an embedded webview

```text
1. create_session(app="C:\MyElectronApp\app.exe", webviewEnabled=true)
2. get_contexts()                       # ["NATIVE_APP", "WEBVIEW_0"]
3. set_context(name="WEBVIEW_0")        # switch to web DOM
4. find_element(strategy="xpath", selector="//button[@id='submit']")
5. click_element(elementId=<btn>)
6. set_context(name="NATIVE_APP")       # back to UIA
7. delete_session()
```

---

## File Structure

```text
lib/mcp/
├── index.ts            # Server entry point & lifecycle
├── config.ts           # Environment variable config
├── session.ts          # WebdriverIO session wrapper
├── errors.ts           # Error formatting utility
└── tools/
    ├── index.ts        # Registers all tool groups
    ├── session.ts      # create_session, attach_session, delete_session, get_session_status
    ├── find.ts         # find_element, find_elements, find_child_element, wait_for_element
    ├── inspect.ts      # get_element_info
    ├── interact.ts     # click_element, set_value, clear_element, get_text, get_attribute, is_element_*
    ├── advanced.ts     # advanced_click, send_keys, hover, scroll, click_and_drag
    ├── patterns.ts     # UIA pattern tools (invoke, expand, toggle, value, focus, select)
    ├── window.ts       # get_page_source, get_window_rect, handles, window state, get_monitors
    ├── app.ts          # get_window_element, launch_app, close_app, get_device_time
    ├── clipboard.ts    # get_clipboard, set_clipboard
    ├── vision.ts       # analyze_screen, find_by_vision
    └── context.ts      # get_current_context, get_contexts, set_context
```
