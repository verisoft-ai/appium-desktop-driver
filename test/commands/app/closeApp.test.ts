/**
 * Unit tests for the W3C closeApp command (session-scoped).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeApp } from '../../../lib/commands/app';
import { createMockDriver } from '../../fixtures/driver';

describe('closeApp (W3C)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes the session app window via C# server commands', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand
            .mockResolvedValueOnce('element-123')
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        await closeApp.call(driver);

        expect(driver.sendCommand).toHaveBeenCalledTimes(3);
        expect(driver.sendCommand).toHaveBeenNthCalledWith(1, 'saveRootElementToTable', {});
        expect(driver.sendCommand).toHaveBeenNthCalledWith(2, 'closeWindow', { elementId: 'element-123' });
        expect(driver.sendCommand).toHaveBeenNthCalledWith(3, 'setRootElementNull', {});
    });

    it('throws NoSuchWindowError when root element is empty string', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValueOnce('');

        await expect(closeApp.call(driver)).rejects.toThrow('No active app window');
    });

    it('throws NoSuchWindowError when root element is null', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValueOnce(null);

        await expect(closeApp.call(driver)).rejects.toThrow('No active app window');
    });
});
