import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerContextTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_current_context',
        {
            description: 'Get the current active context. Returns "NATIVE_APP" (UIA element tree, find_element works here) or "WEBVIEW_<id>" (web DOM, standard web selectors apply). Call this if unsure which context is active before interacting.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const context = await driver.getContext();
                return { content: [{ type: 'text' as const, text: String(context) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_contexts',
        {
            description: 'List all available contexts. Returns "NATIVE_APP" for the UIA element tree, and any embedded webview contexts as "WEBVIEW_<id>".',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const result = await driver.execute('mobile: getContexts', [{}]);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'set_context',
        {
            description: 'Switch the active context. Pass "NATIVE_APP" to return to the UIA element tree, or a "WEBVIEW_<id>" from get_contexts to switch into an embedded webview.',
            inputSchema: z.object({
                name: z.string().describe('Context name to switch to'),
            }),
        },
        async ({ name }) => {
            try {
                const driver = session.getDriver();
                await driver.switchContext(name);
                return { content: [{ type: 'text' as const, text: `Switched to context: ${name}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
