/**
 * Unit tests for deleteFile extension command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteFile } from '../../../lib/commands/extension';
import { createMockDriver } from '../../fixtures/driver';

describe('deleteFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws when path is not provided', async () => {
        const driver = createMockDriver() as any;
        await expect(
            deleteFile.call(driver, {} as any)
        ).rejects.toThrow("'path' must be provided");
        await expect(
            deleteFile.call(driver, { path: '' })
        ).rejects.toThrow("'path' must be provided");
        expect(driver.sendCommand).not.toHaveBeenCalled();
    });

    it('sends deleteFile command with path', async () => {
        const driver = createMockDriver() as any;
        await deleteFile.call(driver, { path: 'C:\\temp\\file.txt' });
        expect(driver.sendCommand).toHaveBeenCalledWith('deleteFile', { path: 'C:\\temp\\file.txt' });
    });

    it('asserts MODIFY_FS_FEATURE before sending command', async () => {
        const driver = createMockDriver() as any;
        await deleteFile.call(driver, { path: 'C:\\temp\\file.txt' });
        expect(driver.assertFeatureEnabled).toHaveBeenCalledTimes(1);
    });

    it('passes path with special characters unchanged', async () => {
        const driver = createMockDriver() as any;
        await deleteFile.call(driver, { path: 'C:\\temp\\file[1].txt' });
        expect(driver.sendCommand).toHaveBeenCalledWith('deleteFile', { path: 'C:\\temp\\file[1].txt' });
    });
});
