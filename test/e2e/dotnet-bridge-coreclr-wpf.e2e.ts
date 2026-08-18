import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    launchNet8WpfMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: test-apps/net8-wpf-minimal/ — CoreCLR (.NET 8, coreclr.dll) WPF twin of
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
        const input = await driver.$('//*[@AutomationId="TxtInput"]');
        await input.setValue('hello coreclr wpf');
        expect(await input.getText()).toBe('hello coreclr wpf');
    });

    it('invoke fires the real Button.Click handler on a CoreCLR WPF target', async () => {
        const button = await driver.$('//*[@AutomationId="BtnClick"]');
        const elementId: string = await button.elementId;
        await driver.executeScript('windows: invoke', [{ elementId }]);

        const label = await driver.$('//*[@AutomationId="LblClickCount"]');
        expect(await label.getText()).toBe('Clicked: 1');
    });

    it('selectElement moves real state on an owner-drawn CoreCLR WPF list element', async () => {
        const item = await driver.$('//BridgeListItem[contains(@Name,"Banana")]');
        expect(await item.isExisting()).toBe(true);
        expect(await item.getAttribute('IsSelected')).toBe(false);

        const elementId: string = await item.elementId;
        await driver.executeScript('windows: select', [{ elementId }]);

        expect(await item.getAttribute('IsSelected')).toBe(true);
    });
});
