import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    createDotnetBridgeAttachSession,
    launchWinformsLargeExternally,
    quitSession,
} from '../e2e/helpers/session.js';
import { finalizeRun, measure, type OpResult } from './helpers/bench.js';

const RUN = process.env.RUN_PERF === '1' || process.env.RUN_PERF === 'true';
// Larger default than the uia suite (which shares the fixture but has no N+1 to show):
// the bridge walk is one RPC per node, so a big tree is what makes dumpTree's effect visible.
const NODE_COUNT = Number(process.env.PERF_NODE_COUNT || 6000);
const SUITE = 'dotnet-bridge';

/**
 * .NET bridge reflected-tree walk benchmark. Same winforms-large fixture as the plain
 * UIA suite, attached with dotnetBridge:true and walked via the bridge's own reflected
 * tree (`windows: getPageSourceViaDotnetBridge` / bridge XPath). The bridge uses the
 * same one-RPC-per-node newline-JSON channel as the Java agent, so its counters read
 * `dotnetBridge.getChildren` etc.
 *
 * Opt-in: RUN_PERF=1, a running Appium server with this driver, winforms-large built
 * in ../appium-wincore-test-apps. Records to test/perf/results/, fails only on a >3x
 * regression vs test/perf/baselines/dotnet-bridge.json.
 */
describe.skipIf(!RUN)('.NET bridge reflected-tree walk perf', () => {
    let driver: Browser;
    let appProc: ChildProcess;
    const results: OpResult[] = [];

    beforeAll(async () => {
        const launched = await launchWinformsLargeExternally(NODE_COUNT);
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd, { 'appium:perfMetrics': true });
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }, 120_000);

    afterAll(async () => {
        try {
            finalizeRun(SUITE, results);
        } finally {
            await quitSession(driver);
            try { appProc?.kill(); } catch { /* already exited */ }
        }
    });

    it('measures getPageSourceViaDotnetBridge', async () => {
        const r = await measure(driver, 'getPageSource', NODE_COUNT, () =>
            driver.executeScript('windows: getPageSourceViaDotnetBridge', []));
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });

    it('measures full-tree //* bridge findElements', async () => {
        const r = await measure(driver, 'findAll-star', NODE_COUNT, () =>
            driver.executeScript('windows: findElementsViaDotnetBridge', [{ using: 'xpath', value: '//*' }]));
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });

    it('measures a deep single-element bridge XPath find', async () => {
        const r = await measure(driver, 'find-anchorLast', NODE_COUNT, () =>
            driver.executeScript('windows: findElementViaDotnetBridge', [
                { using: 'xpath', value: '//*[@Name="perfAnchorLast"]' },
            ]));
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });
});
