/**
 * Shared test fixtures for extension command tests.
 */
import { vi } from 'vitest';
import { BaseDriver, W3C_ELEMENT_KEY } from '@appium/base-driver';
import { executeMethodMap } from '../../lib/execute-method-map';

export interface MockDriver {
    sendCommand: ReturnType<typeof vi.fn>;
    sendPowerShellCommand: ReturnType<typeof vi.fn>;
    log: { debug: ReturnType<typeof vi.fn>; info?: ReturnType<typeof vi.fn>; warn?: ReturnType<typeof vi.fn> };
    assertFeatureEnabled: ReturnType<typeof vi.fn>;
    appProcessIds: number[];
    caps: Record<string, unknown>;
    isIEContext: ReturnType<typeof vi.fn>;
    handleKeyAction: ReturnType<typeof vi.fn>;
}

export function createMockDriver(overrides?: Partial<MockDriver>): MockDriver {
    const sendCommand = vi.fn().mockResolvedValue(null);
    const sendPowerShellCommand = vi.fn().mockResolvedValue('');
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
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

/**
 * `execute()` resolves `this.constructor.executeMethodMap` and calls `this.executeMethod`
 * (mixed onto `BaseDriver.prototype` by `@appium/base-driver`) to dispatch `windows: x`
 * scripts. A plain `createMockDriver()` object has neither, so tests that exercise the
 * dispatcher (as opposed to calling command implementations directly) need this wired in.
 * Uses the real `@appium/base-driver` validation/dispatch logic rather than a
 * reimplementation, so tests fail if that behavior ever changes.
 */
export function withExecuteMethodDispatch<T extends object>(driver: T): T {
    class MockDriverCtor {
        static executeMethodMap = executeMethodMap;
    }
    Object.setPrototypeOf(driver, MockDriverCtor.prototype);
    (driver as any).executeMethod = BaseDriver.prototype.executeMethod.bind(driver);
    return driver;
}
