/**
 * Shared test fixtures for extension command tests.
 */
import { vi } from 'vitest';
import { W3C_ELEMENT_KEY } from '@appium/base-driver';

export interface MockDriver {
    sendCommand: ReturnType<typeof vi.fn>;
    sendPowerShellCommand: ReturnType<typeof vi.fn>;
    log: { debug: ReturnType<typeof vi.fn>; info?: ReturnType<typeof vi.fn> };
    assertFeatureEnabled: ReturnType<typeof vi.fn>;
    appProcessIds: number[];
    caps: Record<string, unknown>;
    isIEContext: ReturnType<typeof vi.fn>;
    handleKeyAction: ReturnType<typeof vi.fn>;
}

export function createMockDriver(overrides?: Partial<MockDriver>): MockDriver {
    const sendCommand = vi.fn().mockResolvedValue(null);
    const sendPowerShellCommand = vi.fn().mockResolvedValue('');
    const log = { debug: vi.fn(), info: vi.fn() };
    const assertFeatureEnabled = vi.fn();
    const isIEContext = vi.fn().mockReturnValue(false);
    const handleKeyAction = vi.fn().mockResolvedValue(undefined);
    const driver: MockDriver = {
        sendCommand,
        sendPowerShellCommand,
        log,
        assertFeatureEnabled,
        appProcessIds: [],
        caps: {},
        isIEContext,
        handleKeyAction,
        ...overrides,
    };
    return driver;
}

export const MOCK_ELEMENT: { [W3C_ELEMENT_KEY]: string } = {
    [W3C_ELEMENT_KEY]: '1.2.3.4.5',
};
