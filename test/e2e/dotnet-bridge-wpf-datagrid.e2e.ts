import type { ChildProcess } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    launchWpfDataGridTemplateExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-windows2-test-apps/wpf-datagrid-template/ — a plain System.Windows.Controls.DataGrid (no
// DevExpress dependency) with two bound text columns (Id, Name) and one DataGridTemplateColumn
// whose cell content is a custom FrameworkElement that paints its own text via OnRender and
// returns a null AutomationPeer — genuinely invisible to plain UIA, the WPF analog of
// appium-windows2-test-apps/devexpress-grid-ownerdraw/'s CustomDrawCell "Status" column. Confirmed empirically
// (see the first test below): plain UIA sees the bound Alpha/Bravo/Charlie values but never the
// templated Healthy/Degraded/Offline values, anywhere.

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

describe('.NET Bridge — WPF DataGrid with a UIA-blind templated column', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    afterAll(async () => {
        await quitSession(driver);
        killProc(appProc);
    });

    it('without the bridge, plain UIA sees bound columns but never the templated Status value', async () => {
        const launched = await launchWpfDataGridTemplateExternally();
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
        expect(source).toContain('Alpha');
        expect(source).toContain('Bravo');
        expect(source).not.toContain('Healthy');
        expect(source).not.toContain('Degraded');
        expect(source).not.toContain('Offline');
    });

    it('with the bridge attached, standard getPageSource is still pure UIA — the templated values stay absent', async () => {
        await quitSession(driver);

        const launched = await launchWpfDataGridTemplateExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);

        const source = await driver.getPageSource();
        expect(source).toContain('Alpha');
        expect(source).not.toContain('Healthy');
        expect(source).not.toContain('Degraded');
        expect(source).not.toContain('Offline');
    });

    it('windows: getPageSourceViaDotnetBridge exposes all three real Status cell values', async () => {
        const source = await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}]) as string;
        expect(source).toContain('Alpha');
        expect(source).toContain('Healthy');
        expect(source).toContain('Degraded');
        expect(source).toContain('Offline');
    });

    it('reads an individual templated cell value by xpath, not just via a bulk page-source scan', async () => {
        // The templated column's cells paint their own content via OnRender with no
        // AutomationPeer — genuinely invisible to real UIA — reached via the explicit
        // .NET bridge find, not standard find.
        const found = await driver.executeScript(
            'windows: findElementViaDotnetBridge', [{ using: 'xpath', value: '//StatusCellFixture' }]
        );
        expect(found).not.toBeNull();
        const cell = await driver.$(found as unknown as Selector);
        expect(await cell.isExisting()).toBe(true);
        expect(await cell.getText()).toBe('Healthy');
    });
});
