import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    launchWpfMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-windows2-test-apps/wpf-minimal/ — plain WPF window (TextBox, Button, owner-drawn list), no
// DevExpress dependency. Validates dotnet-bridge-agent/BridgeAgent.cpp's WPF Dispatcher-marshaling
// fix (Reflector::FindWpfDispatcher / BridgeServer::RunOnUiThread): before that fix, every mutating
// command against a WPF target ran inline on the bridge's background TCP thread instead of the
// WPF Dispatcher thread — a real threading violation WPF enforces more strictly than WinForms
// does. Each assertion below checks real WPF state changed, not just that the RPC call didn't throw.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — WPF Dispatcher marshaling (wpf-minimal fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchWpfMinimalExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('setValue writes real WPF TextBox.Text, marshaled onto the Dispatcher thread', async () => {
        // Found through the .NET bridge (not standard find) so the elementId is
        // bridge-tagged and setValue routes through BridgeAgentElement.IsDotnetId ->
        // state.DotNetBridge.SetValue, exercising the real bridge RPC + Dispatcher-marshal
        // path instead of the plain UIA ValuePattern that a standard find's elementId would hit.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'TxtInput' }]
        );
        const input = await driver.$(found as unknown as Selector);
        const elementId: string = await input.elementId;
        await driver.executeScript('windows: setValue', [{ elementId, value: 'hello wpf' }]);

        const plainInput = await driver.$('//*[@AutomationId="TxtInput"]');
        expect(await plainInput.getText()).toBe('hello wpf');
    });

    it('invoke fires the real WPF Button.Click handler, marshaled onto the Dispatcher thread', async () => {
        // Found through the .NET bridge so the elementId routes windows: invoke through
        // state.DotNetBridge.Invoke (and its Dispatcher marshal) instead of a plain UIA
        // InvokePattern call.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'accessibility id', value: 'BtnClick' }]
        );
        const button = await driver.$(found as unknown as Selector);
        const elementId: string = await button.elementId;
        await driver.executeScript('windows: invoke', [{ elementId }]);

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 1');
    });

    it('element.click() performs a real mouse click on a bridge-found WPF target, marshaled onto the Dispatcher thread', async () => {
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

    it('windows: setFocus calls real WPF UIElement.Focus(), not just WinForms Control.Focus()', async () => {
        const btnElementId: string = await (await driver.$('//*[@AutomationId="BtnClick"]')).elementId;
        await driver.executeScript('windows: setFocus', [{ elementId: btnElementId }]);

        const input = await driver.$('//*[@AutomationId="TxtInput"]');
        const inputElementId: string = await input.elementId;
        await driver.executeScript('windows: setFocus', [{ elementId: inputElementId }]);

        const activeRef = await driver.getActiveElement();
        const active = await driver.$(activeRef as unknown as Selector);
        expect(await active.getAttribute('AutomationId')).toBe('TxtInput');
    });

    it('HasKeyboardFocus reflects real WPF FrameworkElement.IsFocused, not a silent-fail empty string', async () => {
        const input = await driver.$('//*[@AutomationId="TxtInput"]');
        const inputElementId: string = await input.elementId;
        const button = await driver.$('//*[@AutomationId="BtnClick"]');
        const buttonElementId: string = await button.elementId;

        await driver.executeScript('windows: setFocus', [{ elementId: inputElementId }]);
        await driver.waitUntil(
            async () => String(await input.getAttribute('HasKeyboardFocus')).toLowerCase() === 'true',
            { timeoutMsg: 'TxtInput never reported HasKeyboardFocus=true after setFocus' }
        );
        expect(String(await button.getAttribute('HasKeyboardFocus')).toLowerCase()).toBe('false');

        await driver.executeScript('windows: setFocus', [{ elementId: buttonElementId }]);
        await driver.waitUntil(
            async () => String(await button.getAttribute('HasKeyboardFocus')).toLowerCase() === 'true',
            { timeoutMsg: 'BtnClick never reported HasKeyboardFocus=true after setFocus' }
        );
        expect(String(await input.getAttribute('HasKeyboardFocus')).toLowerCase()).toBe('false');
    });

    it('selectElement moves real state on an owner-drawn WPF list element (no Control ancestor to marshal onto)', async () => {
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
