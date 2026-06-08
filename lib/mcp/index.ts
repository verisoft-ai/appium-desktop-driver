#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { AppiumSession } from './session.js';
import { registerAllTools } from './tools/index.js';

async function main() {
    // Step 1: Load infrastructure config (host, port — no app required)
    let config;
    try {
        config = loadConfig();
    } catch (err) {
        process.stderr.write(`[MCP] Configuration error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }

    // Step 2: Create session holder (no app launched yet — agent calls create_session)
    const session = new AppiumSession(config);

    // Step 4: Create and configure MCP server
    const server = new McpServer({
        name: 'desktop-driver-mcp',
        version: '1.3.0',
    }, {
        instructions: `
You are a Windows desktop automation agent using the Appium DesktopDriver via UI Automation (UIA).

## Session
- Before starting, ask the user: should you launch a new app or connect to an existing session?
- If connecting to an existing session: call list_sessions, show the results to the user, and ask which session to attach to before calling attach_session.
- Only call delete_session when the user explicitly asks to end the session.

## Finding elements
1. Call get_page_source to inspect the current UIA element tree. This is your source of truth — call it whenever you are unsure about the current UI state.
2. Use the Names and AutomationIds from the tree to call find_element.
3. If the element is not in the tree, fall back to visual analysis: use analyze_screen for the calling agent to analyze the image directly (no API key needed), or find_by_vision to delegate analysis to an external vision model (requires an API key).
4. Use those coordinates with advanced_click to interact.

## Clicking elements
1. Use click_element for standard UIA element clicks.
2. If click_element does not trigger the expected action, try invoke_element (UIA Invoke pattern).
3. For right-click, double-click, modifier keys, or coordinate-based clicks, use advanced_click.

## Multiple windows
Call get_window_handles to list open windows, then switch_to_window to focus the target.

## Webview / hybrid apps
Call get_contexts to list available contexts. If WEBVIEW contexts are present, ask the user which to switch to before calling set_context.

## General
- When in doubt about what is on screen or what changed, call get_page_source before acting.
- When in doubt about what the user wants, ask before taking action.
- Never call delete_session, close_app, or any destructive tool without explicit user confirmation.
`.trim(),
    });

    // Step 5: Register all tools (including create_session / delete_session)
    registerAllTools(server, session);

    // Step 6: Shutdown handler
    let shuttingDown = false;
    async function shutdown(reason: string) {
        if (shuttingDown) {return;}
        shuttingDown = true;
        process.stderr.write(`[MCP] Shutting down (${reason})...\n`);

        if (session.isActive()) {
            await Promise.race([
                session.delete(),
                new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
            ]);
        }

        process.exit(0);
    }

    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
    process.stdin.on('end', () => { shutdown('stdin closed'); });

    // Step 7: Connect transport (stdout is owned by MCP protocol — all logs go to stderr)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[MCP] desktop-driver-mcp server ready. Call create_session to launch an app.\n');
}

main();
