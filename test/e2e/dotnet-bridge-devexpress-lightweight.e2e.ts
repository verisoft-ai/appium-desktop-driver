import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    launchWpfDevExpressLightweightExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

// Fixture: appium-windows2-test-apps' wpf-devexpress-lightweight/ — DevExpress.Xpf.Grid
// GridControl (CoreCLR, .NET 8 WPF) with 5000 rows and explicit (non-templated, non-auto-generated)
// columns, large enough that TableView renders unfocused/off-screen cells via
// DevExpress.Xpf.Grid.LightweightCellEditor instead of a full editor — its own perf optimization
// for virtualized rows. Confirmed empirically (see project memory) that a real customer report hit
// this: LightweightCellEditor exposes none of the Text/EditValue/DisplayText properties
// Reflector.TryAddDevExpressProps already probed for, so every cell in the page source came back
// with Name="" Value="" — structurally present, no info.
//
// Fix (dotnet-bridge-agent-core/Reflector.cs + dotnet-bridge-agent/BridgeAgent.cpp, mirrored):
// LightweightCellEditor.RowData.Row is the actual bound data item, and
// LightweightCellEditor.Column.FieldName names the bound property on it — reading the value that
// way needs no DevExpress-internal API, just the row object's own property by name via reflection.
describe('.NET Bridge — DevExpress Xpf.Grid LightweightCellEditor real values (wpf-devexpress-lightweight fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchWpfDevExpressLightweightExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        try { appProc?.kill(); } catch { /* already exited */ }
    });

    it('windows: getPageSourceViaDotnetBridge exposes real per-cell values on LightweightCellEditor nodes, not blanks', async () => {
        const source = await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}]) as string;

        expect(source).toContain('LightweightCellEditor');

        const cells = [...source.matchAll(/<LightweightCellEditor[^>]*\bValue="([^"]*)"/g)]
            .map((m) => m[1]);
        expect(cells.length).toBeGreaterThan(0);

        // Every LightweightCellEditor cell in this fixture is bound to a non-empty field
        // (Id/Name/Status/Notes) — none should come back blank now that the fix reads the real
        // bound value via RowData.Row + Column.FieldName.
        for (const value of cells) {
            expect(value).not.toBe('');
        }

        // Specific known values from the fixture's first row (see
        // appium-windows2-test-apps' wpf-devexpress-lightweight/Program.cs)
        expect(cells).toContain('1');
        expect(cells).toContain('Row 1');
        expect(cells.some((v) => ['Healthy', 'Degraded', 'Offline'].includes(v))).toBe(true);
        expect(cells).toContain('Notes for row 1');
    });
});
