import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    launchWpfMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: test-apps/wpf-minimal/ — plain WPF window (TextBox, Button, owner-drawn list), no
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
        const input = await driver.$('//*[@AutomationId="TxtInput"]');
        await input.setValue('hello wpf');
        expect(await input.getText()).toBe('hello wpf');
    });

    it('invoke fires the real WPF Button.Click handler, marshaled onto the Dispatcher thread', async () => {
        const button = await driver.$('//*[@AutomationId="BtnClick"]');
        const elementId: string = await button.elementId;
        await driver.executeScript('windows: invoke', [{ elementId }]);

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 1');
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

    it('selectElement moves real state on an owner-drawn WPF list element (no Control ancestor to marshal onto)', async () => {
        const item = await driver.$('//BridgeListItem[contains(@Name,"Banana")]');
        expect(await item.isExisting()).toBe(true);
        expect(await item.getAttribute('IsSelected')).toBe(false);

        const elementId: string = await item.elementId;
        await driver.executeScript('windows: select', [{ elementId }]);

        expect(await item.getAttribute('IsSelected')).toBe(true);
    });
});
