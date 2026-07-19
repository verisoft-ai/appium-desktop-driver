import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';
import { ELEMENT_KEY } from '../constants.js';

const elementIdSchema = z.string().min(1).describe('Element ID returned by find_element');
const elementIdInput = { elementId: elementIdSchema };

export function registerPatternTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'invoke_element',
        {
            description: 'Invoke the default action of an element via the UIA Invoke pattern without simulating mouse input. Use for elements that do not respond to mouse clicks.',
            inputSchema: elementIdInput,
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: invoke', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'invoked' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'expand_element',
        {
            description: 'Expand a collapsible element (tree node, combo box, menu) via the UIA ExpandCollapse pattern.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: expand', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'expanded' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'collapse_element',
        {
            description: 'Collapse an expanded element via the UIA ExpandCollapse pattern.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: collapse', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'collapsed' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'toggle_element',
        {
            description: 'Toggle a checkbox or toggle button via the UIA Toggle pattern. To confirm the resulting state, call is_element_selected after this.',
            inputSchema: elementIdInput,
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: toggle', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'toggled' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'set_element_value',
        {
            description: 'Set the value of an element via the UIA Value or RangeValue pattern (e.g. sliders, spin boxes).',
            inputSchema: {
                elementId: elementIdSchema,
                value: z.string().describe('The value to set'),
            },
            annotations: { destructiveHint: false },
        },
        async ({ elementId, value }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: setValue', [{ [ELEMENT_KEY]: elementId }, value]);
                return { content: [{ type: 'text' as const, text: 'value set' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_element_value',
        {
            description: 'Get the value of an element via the UIA Value pattern.',
            inputSchema: elementIdInput,
            annotations: { readOnlyHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: getValue', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: String(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'focus_element',
        {
            description: 'Set focus to an element via the UIA Focus pattern (windows: setFocus). Required before keyboard-driven interactions such as send_keys on a specific control.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: setFocus', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'focused' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'select_item',
        {
            description: 'Select an item in a list box, tab control, or combo box via the UIA SelectionItem pattern (windows: select). Use when click does not trigger selection.',
            inputSchema: elementIdInput,
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: select', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'selected' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'is_multi_select',
        {
            description: 'Check whether a container (e.g. ListBox) allows multiple items to be selected via the UIA Selection pattern.',
            inputSchema: elementIdInput,
            annotations: { readOnlyHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: isMultiple', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: String(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'scroll_element_into_view',
        {
            description: 'Scroll a container so the given element becomes visible, via the UIA ScrollItem pattern. Use before clicking an element that may be outside the visible scroll area.',
            inputSchema: elementIdInput,
            annotations: { idempotentHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: scrollIntoView', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'scrolled into view' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_selected_item',
        {
            description: 'Get the first selected item in a container (e.g. ListBox, TreeView) via the UIA Selection pattern. Returns an element ID.',
            inputSchema: elementIdInput,
            annotations: { readOnlyHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: selectedItem', [{ [ELEMENT_KEY]: elementId }]) as Record<string, string>;
                return { content: [{ type: 'text' as const, text: result[ELEMENT_KEY] }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_all_selected_items',
        {
            description: 'Get all currently selected items in a multi-select container via the UIA Selection pattern. Returns a JSON array of element IDs.',
            inputSchema: elementIdInput,
            annotations: { readOnlyHint: true },
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: allSelectedItems', [{ [ELEMENT_KEY]: elementId }]) as Array<Record<string, string>>;
                const ids = result.map((el) => el[ELEMENT_KEY]);
                return { content: [{ type: 'text' as const, text: JSON.stringify(ids) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'add_to_selection',
        {
            description: 'Add an item to the current selection in a multi-select container via the UIA SelectionItem pattern (does not deselect existing items).',
            inputSchema: elementIdInput,
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: addToSelection', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'added to selection' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'remove_from_selection',
        {
            description: 'Remove an item from the current selection in a multi-select container via the UIA SelectionItem pattern.',
            inputSchema: elementIdInput,
        },
        async ({ elementId }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: removeFromSelection', [{ [ELEMENT_KEY]: elementId }]);
                return { content: [{ type: 'text' as const, text: 'removed from selection' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
