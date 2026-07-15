import { describe, it, expect } from 'vitest';
import { createCalculatorSession, quitSession } from './helpers/session.js';

// Each test creates its own session because cacheRequest modifies global PowerShell session state.

describe('windows: cacheRequest', () => {
    // Each positive case also drives a real find + click through the session afterward —
    // proving the cache config didn't just "not throw" but left the session in a working
    // state (the UIA CacheRequest properties themselves aren't observable over the wire).
    async function assertSessionStillWorks(driver: WebdriverIO.Browser) {
        const btn = await driver.$('~num7Button');
        await btn.click();
        const display = await driver.$('~CalculatorResults');
        await driver.waitUntil(
            async () => (await display.getText()).includes('7'),
            { timeoutMsg: 'session stopped finding/clicking elements after cacheRequest' }
        );
    }

    it('pushes a cacheRequest with treeScope: SubTree and the session keeps working', async () => {
        const driver = await createCalculatorSession();
        try {
            await driver.executeScript('windows: cacheRequest', [{ treeScope: 'SubTree' }]);
            await assertSessionStillWorks(driver);
        } finally {
            await quitSession(driver);
        }
    });

    it('pushes a cacheRequest with treeFilter: RawView and the session keeps working', async () => {
        const driver = await createCalculatorSession();
        try {
            await driver.executeScript('windows: cacheRequest', [{ treeFilter: 'RawView' }]);
            await assertSessionStillWorks(driver);
        } finally {
            await quitSession(driver);
        }
    });

    it('pushes a cacheRequest with automationElementMode: Full and the session keeps working', async () => {
        const driver = await createCalculatorSession();
        try {
            await driver.executeScript('windows: cacheRequest', [{ automationElementMode: 'Full' }]);
            await assertSessionStillWorks(driver);
        } finally {
            await quitSession(driver);
        }
    });

    it('pushes a cacheRequest with all three properties set and the session keeps working', async () => {
        const driver = await createCalculatorSession();
        try {
            await driver.executeScript('windows: cacheRequest', [{
                treeScope: 'SubTree',
                treeFilter: 'RawView',
                automationElementMode: 'Full',
            }]);
            await assertSessionStillWorks(driver);
        } finally {
            await quitSession(driver);
        }
    });

    it('throws InvalidArgumentError when no property is provided', async () => {
        const driver = await createCalculatorSession();
        try {
            await expect(
                driver.executeScript('windows: cacheRequest', [{}])
            ).rejects.toThrow();
        } finally {
            await quitSession(driver);
        }
    });

    it('throws InvalidArgumentError for an invalid treeScope value', async () => {
        const driver = await createCalculatorSession();
        try {
            await expect(
                driver.executeScript('windows: cacheRequest', [{ treeScope: 'InvalidScope' }])
            ).rejects.toThrow();
        } finally {
            await quitSession(driver);
        }
    });

    it('throws InvalidArgumentError for an invalid automationElementMode value', async () => {
        const driver = await createCalculatorSession();
        try {
            await expect(
                driver.executeScript('windows: cacheRequest', [{ automationElementMode: 'InvalidMode' }])
            ).rejects.toThrow();
        } finally {
            await quitSession(driver);
        }
    });
});
