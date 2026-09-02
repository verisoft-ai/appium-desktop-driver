import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    isProcess32Bit,
    launchNet8WinformsMinimalX86Externally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// 32-bit twin of dotnet-bridge-coreclr.e2e.ts — same fixture source (appium-wincore-test-apps/net8-winforms-
// minimal/), published with -r win-x86 so it genuinely loads a 32-bit CoreCLR. Exercises
// BridgeInjector.InjectFromPidAutoBitness's CoreCLR branch picking the x86 profiler DLL and
// CoreClrAttacher picking the x86-published bridge-core.dll — see
// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md for the bitness bugs this caught.
//
// Requires an x86 .NET 8 Desktop Runtime installed (`winget install
// Microsoft.DotNet.DesktopRuntime.8.x86`) — a 32-bit CoreCLR process needs its own
// architecture-specific runtime, unlike the Framework 32-bit path which only needs WOW64.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — CoreCLR profiler attach, 32-bit target (net8-winforms-minimal x86 fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchNet8WinformsMinimalX86Externally();
        appProc = launched.proc;

        expect(appProc.pid).toBeDefined();
        expect(isProcess32Bit(appProc.pid!)).toBe(true);

        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('setValue writes real WinForms TextBox.Text on a 32-bit CoreCLR target', async () => {
        // Found through the .NET bridge (not standard find) so the elementId is
        // bridge-tagged and setValue routes through BridgeAgentElement.IsDotnetId ->
        // state.DotNetBridge.SetValue, exercising the real bridge RPC path instead of
        // the plain UIA ValuePattern that a standard find's elementId would hit.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'TxtInput' }]
        );
        const input = await driver.$(found as unknown as Selector);
        const elementId: string = await input.elementId;
        await driver.executeScript('windows: setValue', [{ elementId, value: 'hello 32-bit coreclr' }]);

        const plainInput = await driver.$('//*[@AutomationId="TxtInput"]');
        expect(await plainInput.getText()).toBe('hello 32-bit coreclr');
    });

    it('invoke fires the real Button.Click handler on a 32-bit CoreCLR target', async () => {
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

    it('element.click() performs a real mouse click on a bridge-found 32-bit CoreCLR target', async () => {
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

    it('selectElement moves real state on an owner-drawn 32-bit CoreCLR list element', async () => {
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
