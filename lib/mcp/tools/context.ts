import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerContextTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_current_context',
        {
            description: 'Get the current context name ("NATIVE_APP" or "WEBVIEW_<id>").',
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
            description: 'Get all available context names, including NATIVE_APP and any WEBVIEW_* contexts.',
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
            description: 'Switch to a context by name ("NATIVE_APP" or "WEBVIEW_<id>").',
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
