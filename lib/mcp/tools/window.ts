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
        'get_windows',
        {
            description:
                'Get all visible windows including untitled ones. ' +
                'Returns an array of { handle, title, className } objects. ' +
                'Use handle to switch to any window (including those with no title) via switch_to_window. ' +
                'Use className to identify untitled windows such as popups and dialogs.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const windows = await driver.executeScript('windows: getWindows', []);
                return { content: [{ type: 'text' as const, text: JSON.stringify(windows, null, 2) }] };
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

    server.registerTool(
        'switch_to_window_by_title',
        {
            description:
                'Switch focus to a window by its title. ' +
                'By default uses case-insensitive substring matching so partial titles work (e.g. "Notepad" matches "Untitled - Notepad"). ' +
                'Set exact=true to require a full case-insensitive match.',
            inputSchema: {
                title: z.string().min(1).describe('Window title (or partial title) to match'),
                exact: z.boolean().optional().describe('If true, require an exact case-insensitive title match. Default: false (substring match)'),
            },
        },
        async ({ title, exact }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: switchToWindowByTitle', [{ title, exact }]);
                return { content: [{ type: 'text' as const, text: `Switched to window with title matching '${title}'` }] };
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

    server.registerTool(
        'switch_to_frame',
        {
            description:
                'Switch context into an iframe or frame inside an IE window. ' +
                'After switching, element finds are scoped to that frame\'s document. ' +
                'Provide exactly one of: index (0-based integer), name (frame name/id attribute), or elementId (element ID of the iframe element). ' +
                'Only supported in IE context (after switch_to_window targeting an IE window).',
            inputSchema: {
                index: z.number().int().min(0).optional()
                    .describe('0-based frame index'),
                name: z.string().min(1).optional()
                    .describe('Frame name or id attribute'),
                elementId: z.string().min(1).optional()
                    .describe('Element ID of an <iframe> or <frame> element (from find_element)'),
            },
        },
        async ({ index, name, elementId }) => {
            try {
                const driver = session.getDriver();
                if (index !== undefined) {
                    await driver.switchFrame(index as never);
                } else if (name !== undefined) {
                    // switchFrame does not accept strings in WebDriver Classic — find the element first
                    const frameEl = await driver.$(`//iframe[@name="${name}"]`)
                        ?? await driver.$(`//frame[@name="${name}"]`);
                    await driver.switchFrame(frameEl);
                } else if (elementId !== undefined) {
                    await driver.switchFrame({ [W3C_ELEMENT_KEY]: elementId } as never);
                } else {
                    return { isError: true, content: [{ type: 'text' as const, text: 'Provide one of: index, name, or elementId' }] };
                }
                return { content: [{ type: 'text' as const, text: 'Switched to frame' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'switch_to_default_content',
        {
            description:
                'Switch back to the top-level document after a switch_to_frame call. ' +
                'Required before interacting with elements outside the frame. ' +
                'Only supported in IE context.',
        },
        async () => {
            try {
                const driver = session.getDriver();
                await driver.switchFrame(null);
                return { content: [{ type: 'text' as const, text: 'Switched to default content' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
