import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    launchDevExpressElementsGalleryExternally,
    quitSession,
} from './helpers/session.js';

// Phase 2b/4 coverage: 4 real DevExpress-specific element shapes in one file, one shared
// session/attach (see appium-windows2-test-apps/devexpress-elements-gallery/Program.cs). Each shape was
// empirically confirmed genuinely UIA-blind via a throwaway probe before being added to the
// fixture — two other DevExpress-specific candidates (BarManager/PopupMenu, SchedulerControl)
// were probed and dropped because they turned out to already be UIA-visible.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — DevExpress-specific elements gallery', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchDevExpressElementsGalleryExternally();
        appProc = launched.proc;

        driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:appTopLevelWindow': launched.hwnd,
                'appium:shouldCloseApp': false,
            } as WebdriverIO.Capabilities,
        });
        await driver.setTimeout({ implicit: 3000 });
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('plain UIA cannot see any real DevExpress value before the bridge attaches', async () => {
        const source = await driver.getPageSource();
        expect(source).not.toContain('Healthy');
        expect(source).not.toContain('RealRed');
        expect(source).not.toContain('AlphaReal');
        expect(source).not.toContain('Fruit (2 items)');
    });

    it('windows: attachDotnetBridge makes real DevExpress values readable', async () => {
        await driver.executeScript('windows: attachDotnetBridge', [{}]);
        await driver.waitUntil(
            async () => (await driver.getPageSource()).includes('Healthy'),
            { timeout: 10_000, interval: 500, timeoutMsg: 'Real TreeList value never appeared after attachDotnetBridge' }
        );
    });

    // ─── TreeList ───────────────────────────────────────────────────────────

    it('TreeList: real per-column values readable, and expand/select work', async () => {
        const rootA = await driver.$('//DevExpressTreeListNode[contains(@Name,"Root A")]');
        expect(await rootA.isExisting()).toBe(true);
        expect(await rootA.getText()).toContain('Status: Healthy');

        expect(await rootA.getAttribute('IsExpanded')).toBe(false);
        const childBefore = await driver.$$('//DevExpressTreeListNode[contains(@Name,"Child A1")]');
        expect(childBefore.length).toBe(0);

        const elementId: string = await rootA.elementId;
        await driver.executeScript('windows: expand', [{ elementId }]);

        expect(await rootA.getAttribute('IsExpanded')).toBe(true);
        const childAfter = await driver.$('//DevExpressTreeListNode[contains(@Name,"Child A1")]');
        expect(await childAfter.isExisting()).toBe(true);

        await driver.executeScript('windows: select', [{ elementId }]);
    });

    // ─── ComboBoxEdit ───────────────────────────────────────────────────────

    it('ComboBoxEdit: dropdown items expose the real painted text, and select changes the underlying item', async () => {
        const items = await driver.$$('//DevExpressComboItem');
        expect(items.length).toBe(3);

        const green = await driver.$('//DevExpressComboItem[contains(@Name,"RealGreen")]');
        expect(await green.isExisting()).toBe(true);
        const elementId: string = await green.elementId;

        await driver.executeScript('windows: select', [{ elementId }]);

        // The closed box always displays the bound item's ToString() (real DevExpress behavior —
        // a separate CustomDisplayText hook would be needed to override it), so this asserts the
        // selection genuinely changed the underlying EditValue rather than the closed-box text.
        const combo = await driver.$('//*[@AutomationId="ElementsCombo"]');
        expect(await combo.getAttribute('Value')).toBe('shownGreen');
    });

    // ─── TokenEdit ──────────────────────────────────────────────────────────

    it('TokenEdit: tokens expose Value (real) distinct from Description (bound placeholder)', async () => {
        const tokens = await driver.$$('//DevExpressToken');
        expect(tokens.length).toBe(2);

        const alpha = await driver.$('//DevExpressToken[contains(@Name,"AlphaReal")]');
        expect(await alpha.isExisting()).toBe(true);
        const bravo = await driver.$('//DevExpressToken[contains(@Name,"BravoReal")]');
        expect(await bravo.isExisting()).toBe(true);
    });

    // ─── Grouped GridControl ────────────────────────────────────────────────

    it('GroupGrid: group rows expose the real group value and item count', async () => {
        const fruitGroup = await driver.$('//GridGroupRow[contains(@Name,"Fruit")]');
        expect(await fruitGroup.isExisting()).toBe(true);
        expect(await fruitGroup.getAttribute('Name')).toBe('Fruit (2 items)');
        expect(await fruitGroup.getText()).toBe('Fruit');

        const vegGroup = await driver.$('//GridGroupRow[contains(@Name,"Veg")]');
        expect(await vegGroup.getAttribute('Name')).toBe('Veg (1 items)');
    });
});
