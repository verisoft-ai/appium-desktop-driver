/**
 * Unit tests for the executeMethodMap dispatch path, focused on the arg-shape
 * normalization in coerceExecuteMethodArgs (raw W3C element -> { elementId },
 * legacy two-positional-arg setValue(element, value) -> single opts object) and the
 * error cases when a script or its args don't match anything this driver understands.
 * Uses the real @appium/base-driver executeMethod (via withExecuteMethodDispatch)
 * rather than a reimplementation, so these tests track real validation behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as extension from '../../../lib/commands/extension';
import * as executeMethods from '../../../lib/commands/execute-methods';
import { createMockDriver, withExecuteMethodDispatch, MOCK_ELEMENT } from '../../fixtures/driver';
import { W3C_ELEMENT_KEY } from '@appium/base-driver';

describe('execute (executeMethodMap dispatch)', () => {
    let driver: any;

    beforeEach(() => {
        vi.clearAllMocks();
        driver = withExecuteMethodDispatch(createMockDriver()) as any;
        Object.assign(driver, extension, executeMethods);
    });

    it('routes a zero-arg script straight through', async () => {
        driver.launchApp = vi.fn().mockResolvedValue(undefined);
        await extension.execute.call(driver, 'windows: launchApp', []);
        expect(driver.launchApp).toHaveBeenCalledOnce();
    });

    it('accepts the standard { elementId } opts object', async () => {
        const elementId = MOCK_ELEMENT[W3C_ELEMENT_KEY];
        await extension.execute.call(driver, 'windows: invoke', [{ elementId }]);
        expect(driver.sendCommand).toHaveBeenCalledWith('invokeElement', { elementId });
    });

    it('reassembles a multi-field opts object (click) correctly', async () => {
        await extension.execute.call(driver, 'windows: click', [{ x: 5, y: 7 }]);
        expect(driver.sendCommand).not.toHaveBeenCalledWith('invokeElement', expect.anything());
    });

    it('normalizes a raw W3C element (WebdriverIO calling convention) into { elementId }', async () => {
        // e.g. calc.executeScript('windows: invoke', [oneBtn]) - WebdriverIO serializes
        // the element handle to a raw W3C element object, not { elementId }.
        await extension.execute.call(driver, 'windows: invoke', [MOCK_ELEMENT]);
        expect(driver.sendCommand).toHaveBeenCalledWith('invokeElement', { elementId: MOCK_ELEMENT[W3C_ELEMENT_KEY] });
    });

    it('normalizes the legacy setValue(element, value) two-positional-arg call', async () => {
        // e.g. notepad.executeScript('windows: setValue', [textArea, 'some value'])
        await extension.execute.call(driver, 'windows: setValue', [MOCK_ELEMENT, 'some value']);
        expect(driver.sendCommand).toHaveBeenCalledWith('setElementValue', {
            elementId: MOCK_ELEMENT[W3C_ELEMENT_KEY],
            value: 'some value',
        });
    });

    it('throws InvalidArgumentError when args do not match any understood shape', async () => {
        // Two positional args for a script other than setValue - nothing normalizes this.
        await expect(
            extension.execute.call(driver, 'windows: invoke', [MOCK_ELEMENT, 'unexpected-extra-arg'])
        ).rejects.toThrow('Did not get correct format of arguments');
    });

    it('throws UnknownCommandError for an unrecognized windows: script', async () => {
        await expect(
            extension.execute.call(driver, 'windows: unknownCommand', [])
        ).rejects.toThrow('Unknown command');
    });
});
