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
                'Fallback for legacy WinForms/ActiveX controls that expose zero UIA children (verify with get_page_source / Inspect.exe first).',
                'Bypasses UI Automation and walks the control\'s raw IAccessible (MSAA) tree instead — many of these controls were built with hand-written MSAA support for screen readers, exposing rows/cells as "simple children" (plain integer childIds with no HWND) that UIA and Win32 child-window enumeration can never see.',
                'Returns a tree of {name, role, value, description, state, defaultAction, rect, childCount, children}.',
                'If `supported` is false, or the root node has zero children, the control paints its own content with no accessibility tree either, and there is no structural data left to recover — use find_by_vision / analyze_screen plus advanced_click instead.',
            ].join(' '),
            inputSchema: {
                elementId: z.string().min(1).describe('Element ID (e.g. from find_element) whose native window handle should be walked via IAccessible'),
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
