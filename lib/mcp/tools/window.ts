import { W3C_ELEMENT_KEY } from '@appium/base-driver';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

const elementIdSchema = z.string().min(1).describe('Element ID returned by find_element or get_window_element');
const elementIdInput = { elementId: elementIdSchema };

export function registerWindowTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_page_source',
        {
            description:
                'Get the XML representation of the current UIA element tree. ' +
                'Use as the source of truth for current UI state — call whenever you are unsure what is on screen or after a UI change (navigation, dialog, window switch). ' +
                'Inspect the result to discover element Names and AutomationIds.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const source = await driver.getPageSource();
                return { content: [{ type: 'text' as const, text: source }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_window_rect',
        {
            description: 'Get the position and size of the current app window.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const rect = await driver.getWindowRect();
                return { content: [{ type: 'text' as const, text: JSON.stringify(rect) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_window_handles',
        {
            description: 'Get all available window handles for the current session. Use when the app has multiple windows.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const handles = await driver.getWindowHandles();
                return { content: [{ type: 'text' as const, text: JSON.stringify(handles) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'switch_to_window',
        {
            description: 'Switch focus to a different window by its handle (from get_window_handles).',
            inputSchema: {
                handle: z.string().min(1).describe('Window handle to switch to (from get_window_handles)'),
            },
        },
        async ({ handle }) => {
            try {
                const driver = session.getDriver();
                await driver.switchToWindow(handle);
                return { content: [{ type: 'text' as const, text: `Switched to window: ${handle}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    // Window-pattern tools (UIA Window pattern) — operate on a window element ID

    server.registerTool(
        'maximize_window',
        {
            description: 'Maximize a window element via the UIA Window pattern.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: maximize', [{ [W3C_ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'maximized' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'minimize_window',
        {
            description: 'Minimize a window element via the UIA Window pattern.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: minimize', [{ [W3C_ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'minimized' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'restore_window',
        {
            description: 'Restore a minimized or maximized window to its normal state via the UIA Window pattern.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: restore', [{ [W3C_ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'restored' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'close_window',
        {
            description: 'Close a window element via the UIA Window pattern.',
            inputSchema: elementIdInput,
            annotations: { destructiveHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: close', [{ [W3C_ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'closed' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_monitors',
        {
            description: 'List all connected monitors with their bounds, working area, device name, and whether each is the primary display.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const monitors = await driver.executeScript('windows: getMonitors', []);
                return { content: [{ type: 'text' as const, text: JSON.stringify(monitors, null, 2) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
