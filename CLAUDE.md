# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to build/
npm run watch          # Watch mode compilation
npm run lint           # ESLint validation
npm run test           # Unit tests (Vitest)
npm run test:e2e       # E2E tests (requires Windows + Appium setup)
```

Run a single test file:

```bash
npx vitest run test/path/to/file.test.ts
```

## Architecture

This is an **Appium driver** for Windows desktop UI automation, exposed via the standard Appium WebDriver API (Selenium-style). An MCP server for AI-agent use previously lived here (`lib/mcp/`) but has moved to its own repo, [windows2-mcp](https://github.com/verisoft-ai/windows2-mcp) — it talks to this driver purely over the WebDriver protocol against a running Appium server, so it has no dependency on this codebase's internals.

### Core driver flow

`lib/driver.ts` — `AppiumDesktopDriver` extends `BaseDriver`. On `createSession()`, it spawns **`DesktopDriverServer.exe`** (`lib/server/client.ts`) — a persistent .NET process that remains open for the session lifetime. Its source lives in this repo at `csharp/DesktopDriverServer/` (command handlers under `Commands/`); `native/win-x64/DesktopDriverServer.exe` is just the build output, not a vendored/external binary. All UI Automation operations are sent to this process as newline-delimited JSON requests over stdin/stdout (`lib/server/protocol.ts`: `{id, method, params}` → `{id, result|error, duration_ms}`), resolved by request id. `DesktopDriverServer.exe` handles far more than tree navigation — process lifecycle (`startProcess`/`stopProcess`/window move/resize), clipboard, screenshots, file ops, bridge injection (Java/.NET), and PowerShell execution (`executePowerShellScript`) all dispatch through it too; there is no persistent PowerShell session on the Node side. The one channel that bypasses this process entirely is raw input synthesis: `lib/winapi/user32.ts` loads `user32.dll`/`kernel32.dll` directly via the `koffi` FFI library and calls `SendInput`/`SetCursorPos`/etc. straight from Node.

### Element finding

Appium locator strategies (XPath, accessibility id, class name, etc.) are converted into `ConditionDto` JSON objects (`lib/server/protocol.ts`, built via `lib/server/conditions.ts` and `lib/server/converter-bridge.ts`) and sent to `DesktopDriverServer.exe`, which reconstructs real `UIA3` `Condition` objects natively in .NET and runs `FindFirst`/`FindAll` against the live tree. `lib/powershell/` (`conditions.ts`, `converter.ts`) is legacy naming kept for the `-windows uiautomation` locator converter and XPath plumbing — it no longer executes PowerShell scripts; `converter-bridge.ts` bridges its PSObject-shaped `Condition` classes into `ConditionDto`s for the server. XPath is evaluated in `lib/xpath/` against the live UI Automation tree via the same DTO conditions and element-id refs. As a fallback for legacy controls with no UIA children (old ActiveX/hand-rolled Win32 grids), `lib/commands/native.ts` walks the raw `IAccessible` (MSAA) tree instead — dispatched over the same JSON protocol.

### Input simulation

Low-level mouse and keyboard events use native Windows API bindings in `lib/winapi/user32.ts` via the `koffi` FFI library. Higher-level action sequences (W3C Actions) are handled in `lib/commands/actions.ts` which translates WebDriver action chains into `user32` calls with optional easing/delay curves.

### Driver Commands

All driver commands live in `lib/commands/` and are mixed into the driver class via `lib/commands/index.ts`. Key files:

- `actions.ts` — mouse, keyboard, wheel via W3C ActionSequence
- `element.ts` — element finding and attribute retrieval
- `app.ts` — app launch/close/window management
- `extension.ts` — `executeScript()` platform-specific commands
- `native.ts` — MSAA fallback tree walk for legacy controls with no UIA children
- `server-session.ts` — session-level root element / server lifecycle
- `screen-recorder.ts` — FFmpeg-based recording

### TypeScript paths

`@/` resolves to `lib/` (configured in both `tsconfig.json` and Vitest configs).

## Key capabilities

- `platformName`: `"Windows"`, `automationName`: `"DesktopDriver"`
- Supported locator strategies: `xpath`, `accessibility id`, `id`, `name`, `class name`, `tag name`, `-windows uiautomation`
- Custom `executeScript()` commands listed in README.md
- Prerun/postrun PowerShell scripts via session capabilities
