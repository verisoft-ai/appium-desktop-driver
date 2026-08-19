import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    launchNet8WinformsMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-windows2-test-apps/net8-winforms-minimal/ — CoreCLR (.NET 8, coreclr.dll) twin of
// winform-combo/wpf-minimal, validating BridgeInjector's CoreCLR attach path (profiler attach via
// CoreClrAttacher/CoreClrDiagnosticsIpcClient + dotnet-bridge-profiler's ReJIT IL rewrite of
// Control.WndProc) instead of the Win32-injection path Framework targets use. See
// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md for the full design and live-attach history.
describe('.NET Bridge — CoreCLR profiler attach (net8-winforms-minimal fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchNet8WinformsMinimalExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        try { appProc?.kill(); } catch { /* already exited */ }
    });

    it('setValue writes real WinForms TextBox.Text on a CoreCLR target', async () => {
        const input = await driver.$('//*[@AutomationId="TxtInput"]');
        await input.setValue('hello coreclr');
        expect(await input.getText()).toBe('hello coreclr');
    });

    it('invoke fires the real Button.Click handler on a CoreCLR target', async () => {
        const button = await driver.$('//*[@AutomationId="BtnClick"]');
        const elementId: string = await button.elementId;
        await driver.executeScript('windows: invoke', [{ elementId }]);

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 1');
    });

    it('selectElement moves real state on an owner-drawn CoreCLR list element', async () => {
        // Owner-drawn list items are genuinely invisible to real UIA — reached via the
        // explicit .NET bridge find, not standard find (which stays pure UIA even here).
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'xpath', value: '//BridgeListItem[contains(@Name,"Banana")]' }]
        );
        expect(found).not.toBeNull();
        const item = await driver.$(found as unknown as Selector);
        expect(await item.isExisting()).toBe(true);
        expect(await item.getAttribute('IsSelected')).toBe(false);

        const elementId: string = await item.elementId;
        await driver.executeScript('windows: select', [{ elementId }]);

        expect(await item.getAttribute('IsSelected')).toBe(true);
    });
});
