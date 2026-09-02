import type { ChildProcess } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    isProcess32Bit,
    launchMinimalOwnerDrawX86Externally,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-wincore-test-apps/minimal-ownerdraw-x86/ — the 32-bit twin of minimal-ownerdraw-winforms.
// Proves the bridge's x86 injection path end to end: a 64-bit host can't CreateRemoteThread into
// a 32-bit process directly (Windows disallows crossing bitness), so this only passes if bitness
// detection (BridgeInjector.DetectIs32Bit) and the x86 stub dispatch (InjectFromPidAutoBitness →
// BridgeInjectorX86Stub.exe → the Win32 build of appium-dotnet-bridge.dll) are all wired correctly.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — 32-bit target support', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('the fixture app is genuinely a 32-bit (WOW64) process', async () => {
        const launched = await launchMinimalOwnerDrawX86Externally();
        appProc = launched.proc;

        expect(appProc.pid).toBeDefined();
        expect(isProcess32Bit(appProc.pid!)).toBe(true);

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
    });

    it('without the bridge, plain UIA does not expose the painted value anywhere', async () => {
        const source = await driver.getPageSource();
        expect(source).not.toContain('Healthy');
    });

    it('windows: attachDotnetBridge routes through the x86 injector stub and makes the value readable', async () => {
        await driver.executeScript('windows: attachDotnetBridge', [{}]);
        await driver.waitUntil(
            async () => (await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}]) as string).includes('Healthy'),
            { timeout: 10_000, interval: 500, timeoutMsg: 'Painted value never appeared after attachDotnetBridge on a 32-bit target' }
        );
    });
});
