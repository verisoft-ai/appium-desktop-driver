import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerIeTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_url',
        {
            description:
                'Get the current page URL. Only supported when the active window is an IE window ' +
                '(IE mode is enabled automatically by switch_to_window / switch_to_window_by_title when the target is an Internet Explorer window).',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const url = await driver.getUrl();
                return { content: [{ type: 'text' as const, text: url }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'set_url',
        {
            description:
                'Navigate the current IE window to a URL. No keyboard shortcuts (Ctrl+L) needed and the window does not need to be in the foreground — ' +
                'this calls IHTMLWindow2.navigate directly through the IE COM bridge. ' +
                'Only supported when the active window is an IE window.',
            inputSchema: {
                url: z.string().min(1).describe('URL to navigate to'),
            },
        },
        async ({ url }) => {
            try {
                const driver = session.getDriver();
                await driver.url(url);
                return { content: [{ type: 'text' as const, text: `Navigated to: ${url}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
