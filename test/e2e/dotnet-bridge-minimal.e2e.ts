import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    launchMinimalOwnerDrawExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: test-apps/minimal-ownerdraw-winforms/ — single StatusIndicator Control that paints
// "Healthy" manually via GDI and blanks AccessibleName, so plain UIA can never see the value.
// Minimum bar for the bridge: it must read that value where plain UIA genuinely cannot.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — minimal owner-draw fixture, minimum requirement', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('without the bridge, plain UIA does not expose the painted value anywhere', async () => {
        const launched = await launchMinimalOwnerDrawExternally();
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

        const source = await driver.getPageSource();
        expect(source).not.toContain('Healthy');
    });

    it('with the bridge attached, the painted value becomes readable', async () => {
        await quitSession(driver);

        const launched = await launchMinimalOwnerDrawExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);

        const source = await driver.getPageSource();
        expect(source).toContain('Healthy');
    });
});
