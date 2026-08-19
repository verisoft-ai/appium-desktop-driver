import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    NOTEPAD_APP_PATH,
    launchDevExpressGridExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-windows2-test-apps/devexpress-grid-ownerdraw/ — a bespoke single-window WinForms app (not a
// cloned DevExpress-Examples repo; two prior clones both turned out to already be visible to
// plain UIA). A DevExpress XtraGrid GridControl bound to three rows:
//   Id 1 / Name "Alpha"   / Status "Healthy"  (row handle 0)
//   Id 2 / Name "Bravo"   / Status "Degraded" (row handle 1)
//   Id 3 / Name "Charlie" / Status "Offline"  (row handle 2)
// Id/Name are genuinely bound columns; Status is unbound with its real value wired through
// GridView.CustomUnboundColumnData (reachable via GridView.GetRowCellValue, what the bridge
// reads) and painted separately via CustomDrawCell. Confirmed empirically: plain UIA exposes only
// a generic "<Column> row <N>" placeholder for every column — bound or not — never the real
// value, via Name, the Value pattern, or HelpText. That's the actual "invisible to UIA" scenario
// this fixture reproduces.

// ─── helpers ──────────────────────────────────────────────────────────────────

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

// ─── Path A: appTopLevelWindow + dotnetBridge (session-time attach) ───────────

describe('.NET Bridge — appTopLevelWindow + dotnetBridge attach', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchDevExpressGridExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    // Grid rows/cells are custom-drawn — genuinely invisible to real UIA (only a generic
    // "<Column> row <N>" placeholder is ever exposed there) — so every query below goes
    // through the explicit .NET bridge find, not standard find.
    async function findViaBridge(xpath: string) {
        const found = await driver.executeScript('windows: findElementViaDotnetBridge', [{ using: 'xpath', value: xpath }]);
        return found ? driver.$(found as unknown as Selector) : null;
    }

    it('standard getPageSource stays pure UIA — never the generic UIA placeholder, never a real grid value', async () => {
        const source = await driver.getPageSource();
        expect(source).not.toContain('Healthy');
        expect(source).not.toContain('Degraded');
        expect(source).not.toContain('Offline');
    });

    it('windows: getPageSourceViaDotnetBridge reflects real grid cell values', async () => {
        const source = await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}]) as string;
        expect(source).toContain('Healthy');
        expect(source).toContain('Degraded');
        expect(source).toContain('Offline');
    });

    it('finds all grid rows and the count matches the three known rows', async () => {
        const rows = await driver.executeScript('windows: findElementsViaDotnetBridge', [{ using: 'xpath', value: '//GridRow' }]);
        expect((rows as unknown[]).length).toBe(3);
    });

    it('reads a real unbound Status cell value by name, proving custom-drawn column data reaches the bridge', async () => {
        const cell = await findViaBridge('//GridCell[contains(@Name,"Status row 1")]');
        expect(cell).not.toBeNull();
        expect(await cell!.isExisting()).toBe(true);
        expect(await cell!.getText()).toBe('Healthy');
    });

    it('reads a real bound Name cell value, proving bound columns are also unavailable via plain UIA but readable via the bridge', async () => {
        const cell = await findViaBridge('//GridCell[contains(@Name,"Name row 2")]');
        expect(await cell!.getText()).toBe('Bravo');
    });

    it('isEnabled and isDisplayed report real (non-hardcoded) state for a visible cell', async () => {
        const cell = await findViaBridge('//GridCell[contains(@Name,"Status row 3")]');
        expect(await cell!.isEnabled()).toBe(true);
        expect(await cell!.isDisplayed()).toBe(true);
    });

    it('selectElement moves the real DevExpress FocusedRowHandle, not just a fake success', async () => {
        const row1 = await findViaBridge('//GridRow[contains(@Name,"Row 1")]');
        expect(await row1!.getAttribute('IsSelected')).toBe(true);

        const row2 = await findViaBridge('//GridRow[contains(@Name,"Row 2")]');
        const elementId: string = await row2!.elementId;
        await driver.executeScript('windows: select', [{ elementId }]);

        expect(await row2!.getAttribute('IsSelected')).toBe(true);
        expect(await row1!.getAttribute('IsSelected')).toBe(false);
    });
});

// ─── Path B: windows: attachDotnetBridge post-session ─────────────────────────

describe('.NET Bridge — windows: attachDotnetBridge post-session', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchDevExpressGridExternally();
        appProc = launched.proc;

        // Plain UIA session first — no dotnetBridge capability yet.
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

    it('before attach: plain UIA does not see real grid cell values anywhere', async () => {
        const source = await driver.getPageSource();
        expect(source).not.toContain('Healthy');
        expect(source).not.toContain('Degraded');
        expect(source).not.toContain('Offline');
    });

    it('after windows: attachDotnetBridge, real cell values become visible via the bridge', async () => {
        await driver.executeScript('windows: attachDotnetBridge', [{}]);

        await driver.waitUntil(
            async () => (await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}]) as string).includes('Healthy'),
            { timeout: 10_000, interval: 500, timeoutMsg: 'Real cell values never appeared after attachDotnetBridge' }
        );

        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'xpath', value: '//GridCell[contains(@Name,"Status row 2")]' }]
        );
        expect(found).not.toBeNull();
        const cell = await driver.$(found as unknown as Selector);
        expect(await cell.getText()).toBe('Degraded');
    });
});

// ─── Path D: root session → launch external → switchToWindow → attach ────────

describe('.NET Bridge — root session, launch external, switchToWindow, then attachDotnetBridge', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:app': 'Root',
                'appium:shouldCloseApp': false,
            } as WebdriverIO.Capabilities,
        });
        await driver.setTimeout({ implicit: 5000 });

        const launched = await launchDevExpressGridExternally();
        appProc = launched.proc;

        const hexHwnd = `0x${parseInt(launched.hwnd, 10).toString(16).padStart(8, '0')}`;
        await driver.switchToWindow(hexHwnd);
        await driver.executeScript('windows: attachDotnetBridge', [{}]);
    }, 45_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('reads a real cell value after root→switch→attach', async () => {
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'xpath', value: '//GridCell[contains(@Name,"Status row 3")]' }]
        );
        expect(found).not.toBeNull();
        const cell = await driver.$(found as unknown as Selector);
        expect(await cell.isExisting()).toBe(true);
        expect(await cell.getText()).toBe('Offline');
    });
});

// ─── Path F: error cases ─────────────────────────────────────────────────────

describe('.NET Bridge — error cases', () => {
    it('dotnetBridge:true with no appTopLevelWindow and no app throws', async () => {
        await expect(
            remote({
                ...APPIUM_SERVER,
                capabilities: {
                    platformName: 'Windows',
                    'appium:automationName': 'DesktopDriver',
                    'appium:app': 'root',
                    'appium:dotnetBridge': true,
                } as WebdriverIO.Capabilities,
            })
        ).rejects.toThrow();
    });

    it('attachDotnetBridge on a plain Win32 app (no CLR) includes diagnostics in the error', async () => {
        const driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:app': NOTEPAD_APP_PATH,
            } as WebdriverIO.Capabilities,
        });

        try {
            await expect(
                driver.executeScript('windows: attachDotnetBridge', [{}])
            ).rejects.toSatisfy((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                expect(msg).toContain('attachDotnetBridge diagnostics');
                expect(msg).toMatch(/hwnd\s*:/i);
                expect(msg).toMatch(/pid\s*:/i);
                expect(msg).toMatch(/process\s*:/i);
                expect(msg).toMatch(/clr\s*:/i);
                return true;
            });
        } finally {
            await quitSession(driver);
        }
    });
});
