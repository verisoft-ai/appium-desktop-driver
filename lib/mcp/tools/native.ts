import { W3C_ELEMENT_KEY } from '@appium/base-driver';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerNativeTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_native_children',
        {
            description: [
                'Fallback for legacy WinForms controls that expose zero UIA children (verify with get_page_source / Inspect.exe first).',
                'Bypasses UI Automation and enumerates the real Win32 child-window tree (EnumChildWindows) under the given element, returning each child\'s handle, ClassName, window text, and screen rect.',
                'If this also returns an empty array, the control paints its own content with no child windows either, and there is no structural data to recover — use find_by_vision / analyze_screen plus advanced_click instead.',
            ].join(' '),
            inputSchema: {
                elementId: z.string().min(1).describe('Element ID (e.g. from find_element) whose native window handle should be walked for child HWNDs'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: getNativeChildren', [{ [W3C_ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
