/**
 * Unit tests for pattern extension commands (invoke, expand, collapse, close, etc.).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    patternInvoke,
    patternExpand,
    patternCollapse,
    patternScrollIntoView,
    patternClose,
    patternMaximize,
    patternMinimize,
    patternRestore,
    patternIsMultiple,
    patternGetSelectedItem,
    patternGetAllSelectedItems,
    patternAddToSelection,
    patternRemoveFromSelection,
    patternSelect,
    patternToggle,
    patternSetValue,
    patternGetValue,
    focusElement,
} from '../../../lib/commands/extension';
import { W3C_ELEMENT_KEY } from '@appium/base-driver';
import { createMockDriver, MOCK_ELEMENT } from '../../fixtures/driver';

vi.mock('../../../lib/winapi/user32', () => ({
    keyDown: vi.fn(),
    keyUp: vi.fn(),
    mouseMoveAbsolute: vi.fn().mockResolvedValue(undefined),
    mouseDown: vi.fn(),
    mouseUp: vi.fn(),
    getCursorPos: vi.fn().mockReturnValue({ x: 0, y: 0 }),
}));

const ELEMENT_ID = MOCK_ELEMENT[W3C_ELEMENT_KEY];

const PATTERN_COMMANDS = [
    { name: 'patternInvoke', fn: patternInvoke, expectedMethod: 'invokeElement' },
    { name: 'patternCollapse', fn: patternCollapse, expectedMethod: 'collapseElement' },
    { name: 'patternScrollIntoView', fn: patternScrollIntoView, expectedMethod: 'scrollElementIntoView' },
    { name: 'patternClose', fn: patternClose, expectedMethod: 'closeWindow' },
    { name: 'patternMaximize', fn: patternMaximize, expectedMethod: 'maximizeWindow' },
    { name: 'patternMinimize', fn: patternMinimize, expectedMethod: 'minimizeWindow' },
    { name: 'patternRestore', fn: patternRestore, expectedMethod: 'restoreWindow' },
    { name: 'patternAddToSelection', fn: patternAddToSelection, expectedMethod: 'addToSelection' },
    { name: 'patternRemoveFromSelection', fn: patternRemoveFromSelection, expectedMethod: 'removeFromSelection' },
    { name: 'patternSelect', fn: patternSelect, expectedMethod: 'selectElement' },
    { name: 'patternToggle', fn: patternToggle, expectedMethod: 'toggleElement' },
] as const;

describe('pattern commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(PATTERN_COMMANDS)('$name sends sendCommand with element id and correct method', async ({ fn, expectedMethod }) => {
        const driver = createMockDriver() as any;
        await fn.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith(expectedMethod, { elementId: ELEMENT_ID });
    });

    it('patternExpand trusts expandElement when ExpandCollapseState confirms Expanded', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'expandElement') {return null;}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Expanded';}
            return null;
        });
        await patternExpand.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('expandElement', { elementId: ELEMENT_ID });
        expect(driver.sendCommand).not.toHaveBeenCalledWith('setFocus', expect.anything());
    });

    it('patternExpand falls back to ALT+Down when expandElement throws', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'expandElement') {throw new Error('does not support ExpandCollapsePattern');}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Expanded';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await patternExpand.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternExpand falls back to ALT+Down when expandElement succeeds but state never confirms', async () => {
        const driver = createMockDriver() as any;
        let expanded = false;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'expandElement') {return null;}
            if (method === 'setFocus') { expanded = true; return null; }
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return expanded ? 'Expanded' : 'Collapsed';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await patternExpand.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternExpand falls back to a real click when SetFocus does not confirm keyboard focus', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'expandElement') {throw new Error('does not support ExpandCollapsePattern');}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Expanded';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return false;}
            if (method === 'getProperty' && args.property === 'ClickablePoint') {return { x: 10, y: 20 };}
            return null;
        });
        await patternExpand.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
        expect(driver.sendCommand).toHaveBeenCalledWith('getProperty', { elementId: ELEMENT_ID, property: 'ClickablePoint' });
    });

    it('patternExpand resolves without throwing when native and ALT+Down both fail to confirm expansion', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Collapsed';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await expect(patternExpand.call(driver, MOCK_ELEMENT)).resolves.toBeUndefined();
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternCollapse trusts collapseElement when ExpandCollapseState confirms Collapsed', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'collapseElement') {return null;}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Collapsed';}
            return null;
        });
        await patternCollapse.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('collapseElement', { elementId: ELEMENT_ID });
        expect(driver.sendCommand).not.toHaveBeenCalledWith('setFocus', expect.anything());
    });

    it('patternCollapse falls back to ALT+Down when collapseElement throws', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'collapseElement') {throw new Error('does not support ExpandCollapsePattern');}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Collapsed';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await patternCollapse.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternCollapse falls back to ALT+Down when collapseElement succeeds but state never confirms', async () => {
        const driver = createMockDriver() as any;
        let collapsed = false;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'collapseElement') {return null;}
            if (method === 'setFocus') { collapsed = true; return null; }
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return collapsed ? 'Collapsed' : 'Expanded';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await patternCollapse.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternCollapse falls back to a real click when SetFocus does not confirm keyboard focus', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'collapseElement') {throw new Error('does not support ExpandCollapsePattern');}
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Collapsed';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return false;}
            if (method === 'getProperty' && args.property === 'ClickablePoint') {return { x: 10, y: 20 };}
            return null;
        });
        await patternCollapse.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
        expect(driver.sendCommand).toHaveBeenCalledWith('getProperty', { elementId: ELEMENT_ID, property: 'ClickablePoint' });
    });

    it('patternCollapse resolves without throwing when native and ALT+Down both fail to confirm collapse', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockImplementation(async (method: string, args: any) => {
            if (method === 'getProperty' && args.property === 'ExpandCollapseState') {return 'Expanded';}
            if (method === 'getProperty' && args.property === 'HasKeyboardFocus') {return true;}
            return null;
        });
        await expect(patternCollapse.call(driver, MOCK_ELEMENT)).resolves.toBeUndefined();
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });

    it('patternIsMultiple returns true when result is true', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue(true);
        const result = await patternIsMultiple.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('isMultipleSelect', { elementId: ELEMENT_ID });
        expect(result).toBe(true);
    });

    it('patternIsMultiple returns false when result is false', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue(false);
        const result = await patternIsMultiple.call(driver, MOCK_ELEMENT);
        expect(result).toBe(false);
    });

    it('patternGetSelectedItem returns element when selection exists', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue(['2.3.4.5.6']);
        const result = await patternGetSelectedItem.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('getSelectedElements', { elementId: ELEMENT_ID });
        expect(result).toEqual({ [W3C_ELEMENT_KEY]: '2.3.4.5.6' });
    });

    it('patternGetSelectedItem throws when no selection', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue([]);
        await expect(patternGetSelectedItem.call(driver, MOCK_ELEMENT)).rejects.toThrow();
    });

    it('patternGetAllSelectedItems returns array of elements', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue(['2.3.4.5.6', '3.4.5.6.7']);
        const result = await patternGetAllSelectedItems.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('getSelectedElements', { elementId: ELEMENT_ID });
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ [W3C_ELEMENT_KEY]: '2.3.4.5.6' });
        expect(result[1]).toEqual({ [W3C_ELEMENT_KEY]: '3.4.5.6.7' });
    });

    it('patternSetValue calls setElementValue first', async () => {
        const driver = createMockDriver() as any;
        await patternSetValue.call(driver, MOCK_ELEMENT, 'test value');
        expect(driver.sendCommand).toHaveBeenCalledWith('setElementValue', { elementId: ELEMENT_ID, value: 'test value' });
    });

    it('patternSetValue falls back to setElementRangeValue when setElementValue throws', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand
            .mockRejectedValueOnce(new Error('not a value pattern'))
            .mockResolvedValueOnce(undefined);
        await patternSetValue.call(driver, MOCK_ELEMENT, '42');
        expect(driver.sendCommand).toHaveBeenCalledWith('setElementRangeValue', { elementId: ELEMENT_ID, value: 42 });
    });

    it('patternGetValue sends getElementValue command', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue('some value');
        const result = await patternGetValue.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('getElementValue', { elementId: ELEMENT_ID });
        expect(result).toBe('some value');
    });

    it('focusElement sends setFocus command', async () => {
        const driver = createMockDriver() as any;
        await focusElement.call(driver, MOCK_ELEMENT);
        expect(driver.sendCommand).toHaveBeenCalledWith('setFocus', { elementId: ELEMENT_ID });
    });
});
