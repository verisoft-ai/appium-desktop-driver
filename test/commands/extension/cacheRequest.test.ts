/**
 * Unit tests for pushCacheRequest (cacheRequest) extension command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushCacheRequest } from '../../../lib/commands/extension';
import { createMockDriver } from '../../fixtures/driver';

describe('pushCacheRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws when all properties are undefined', async () => {
        const driver = createMockDriver() as any;
        await expect(
            pushCacheRequest.call(driver, {})
        ).rejects.toThrow('At least one property of the cache request must be set.');
        await expect(
            pushCacheRequest.call(driver, { treeScope: undefined, treeFilter: undefined, automationElementMode: undefined })
        ).rejects.toThrow('At least one property of the cache request must be set.');
        expect(driver.sendCommand).not.toHaveBeenCalled();
    });

    it('sends setCacheRequestTreeFilter command when treeFilter is set', async () => {
        const driver = createMockDriver() as any;
        await pushCacheRequest.call(driver, { treeFilter: 'TrueCondition' });
        expect(driver.sendCommand).toHaveBeenCalledWith('setCacheRequestTreeFilter', expect.objectContaining({ condition: expect.any(Object) }));
    });

    it('sends setCacheRequestTreeScope command when treeScope is set', async () => {
        const driver = createMockDriver() as any;
        await pushCacheRequest.call(driver, { treeScope: 'Children' });
        expect(driver.sendCommand).toHaveBeenCalledWith('setCacheRequestTreeScope', { scope: 'Children' });
    });

    it('sends setCacheRequestAutomationElementMode command when automationElementMode is set', async () => {
        const driver = createMockDriver() as any;
        await pushCacheRequest.call(driver, { automationElementMode: 'Full' });
        expect(driver.sendCommand).toHaveBeenCalledWith('setCacheRequestAutomationElementMode', { mode: 'Full' });
    });
});
