import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    launchNet8WpfMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-wincore-test-apps/net8-wpf-minimal/ — CoreCLR (.NET 8, coreclr.dll) WPF twin of
// net8-winforms-minimal. Written to reproduce and then verify the fix for the profiler's
// anchor-discovery gap: ProfilerCallback.cpp's kAnchorCandidates originally only listed
// System.Windows.Forms.Control.WndProc, so a pure-WPF process (no System.Windows.Forms module
// ever loaded) never satisfied ScanLoadedModulesForAnchor — RequestReJIT was never called, and
// attach timed out after 15s waiting on a port file that was never written. See
// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
describe('.NET Bridge — CoreCLR profiler attach (net8-wpf-minimal fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchNet8WpfMinimalExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        try { appProc?.kill(); } catch { /* already exited */ }
    });

    it('setValue writes real WPF TextBox.Text on a CoreCLR WPF target', async () => {
        // Found through the .NET bridge (not standard find) so the elementId is
        // bridge-tagged and setValue routes through BridgeAgentElement.IsDotnetId ->
        // state.DotNetBridge.SetValue, exercising the real bridge RPC path instead of
        // the plain UIA ValuePattern that a standard find's elementId would hit.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'TxtInput' }]
        );
        const input = await driver.$(found as unknown as Selector);
        const elementId: string = await input.elementId;
        await driver.executeScript('windows: setValue', [{ elementId, value: 'hello coreclr wpf' }]);

        const plainInput = await driver.$('//*[@AutomationId="TxtInput"]');
        expect(await plainInput.getText()).toBe('hello coreclr wpf');
    });

    it('invoke fires the real Button.Click handler on a CoreCLR WPF target', async () => {
        // Found through the .NET bridge so the elementId routes windows: invoke through
        // state.DotNetBridge.Invoke instead of a plain UIA InvokePattern call.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'BtnClick' }]
        );
        const button = await driver.$(found as unknown as Selector);
        const elementId: string = await button.elementId;
        await driver.executeScript('windows: invoke', [{ elementId }]);

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 1');
    });

    it('element.click() performs a real mouse click on a bridge-found CoreCLR WPF target', async () => {
        // Bridge-found elementId — click() reads ClickablePoint/getRect through
        // BridgeAgentElement.IsDotnetId -> state.DotNetBridge.GetRect for coordinates,
        // then fires a real OS mouse click, landing on the real Button.Click handler.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'BtnClick' }]
        );
        const button = await driver.$(found as unknown as Selector);
        await button.click();

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 2');
    });

    it('selectElement moves real state on an owner-drawn CoreCLR WPF list element', async () => {
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
