/**
 * Unit tests for additional lib/commands/app.ts functions
 * (getPageSource, getWindowHandle, getWindowHandles, getWindowRect, setWindow)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getPageSource,
    getWindowHandle,
    getWindowHandles,
    getWindowRect,
    setWindow,
} from '../../../lib/commands/app';
import { createMockDriver } from '../../fixtures/driver';

const mockGetAllWindowHandles = vi.fn().mockReturnValue([]);

vi.mock('../../../lib/winapi/user32', () => ({
    getAllWindowHandles: (...args: unknown[]) => mockGetAllWindowHandles(...args),
    getWindowAllHandlesForProcessIds: vi.fn().mockReturnValue([]),
    isIEWindowHwnd: vi.fn().mockReturnValue(false),
    trySetForegroundWindow: vi.fn().mockReturnValue(true),
}));

describe('getPageSource', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns XML page source string', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue('<Root><Child /></Root>');
        const result = await getPageSource.call(driver);
        expect(driver.sendCommand).toHaveBeenCalledWith('getPageSource', {});
        expect(result).toBe('<Root><Child /></Root>');
    });
});

describe('getWindowHandle', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns hex-formatted window handle', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand
            .mockResolvedValueOnce('root-id')
            .mockResolvedValueOnce('12648430'); // 0x00C0FFEE
        const result = await getWindowHandle.call(driver);
        expect(result).toBe('0x00c0ffee');
    });

    it('pads handle to 8 hex digits', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand
            .mockResolvedValueOnce('root-id')
            .mockResolvedValueOnce('1'); // 0x00000001
        const result = await getWindowHandle.call(driver);
        expect(result).toBe('0x00000001');
    });
});

describe('getWindowHandles', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns array of hex window handles for each visible window', async () => {
        mockGetAllWindowHandles.mockReturnValue([100, 200]);
        const driver = createMockDriver() as any;
        const result = await getWindowHandles.call(driver);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe('0x00000064');
        expect(result[1]).toBe('0x000000c8');
    });

    it('returns empty array when no windows found', async () => {
        mockGetAllWindowHandles.mockReturnValue([]);
        const driver = createMockDriver() as any;
        const result = await getWindowHandles.call(driver);
        expect(result).toEqual([]);
    });

});

describe('getWindowRect', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns rect object from C# server', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue({ x: 10, y: 20, width: 800, height: 600 });
        const result = await getWindowRect.call(driver);
        expect(driver.sendCommand).toHaveBeenCalledWith('getRootRect', {});
        expect(result).toEqual({ x: 10, y: 20, width: 800, height: 600 });
    });
});

describe('setWindow', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sets root element by numeric handle via setRootElementFromHandle (no tree search)', async () => {
        const driver = createMockDriver() as any;
        const { trySetForegroundWindow } = await import('../../../lib/winapi/user32');

        driver.sendCommand.mockResolvedValueOnce('1.2.3');

        await setWindow.call(driver, '12345');

        expect(driver.sendCommand).toHaveBeenCalledWith('setRootElementFromHandle', { handle: 12345 });
        expect(trySetForegroundWindow).toHaveBeenCalledWith(12345);
    });

    it('sets root element by window name when name is not numeric', async () => {
        const driver = createMockDriver() as any;

        driver.sendCommand
            .mockResolvedValueOnce('5.6.7')
            .mockResolvedValueOnce(undefined);

        await setWindow.call(driver, 'Calculator');

        expect(driver.sendCommand).toHaveBeenCalledWith(
            'findElement',
            expect.objectContaining({ scope: 'children' })
        );
        expect(driver.sendCommand).toHaveBeenCalledWith('setRootElementFromElementId', { elementId: '5.6.7' });
    });

    it('throws NoSuchWindowError when window is never found', async () => {
        const driver = createMockDriver() as any;
        driver.sendCommand.mockResolvedValue(null);

        await expect(setWindow.call(driver, 'Nonexistent')).rejects.toThrow('No window was found');
    }, 30000);
});
