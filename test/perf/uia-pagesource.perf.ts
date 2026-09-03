import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { createWinformsLargeSession, quitSession } from '../e2e/helpers/session.js';
import { finalizeRun, measure, type OpResult } from './helpers/bench.js';

const RUN = process.env.RUN_PERF === '1' || process.env.RUN_PERF === 'true';
const NODE_COUNT = Number(process.env.PERF_NODE_COUNT || 1500);
const SUITE = 'uia';

/**
 * Plain-UIA tree-walk benchmark against the winforms-large fixture. Measures the same
 * operations as the Java and .NET-bridge suites so the three walk costs are comparable
 * on comparable trees. Perf counters here are per-node COM-walk timings
 * (`uia.pageSource.node`, `uia.xpathModel.node`), not RPCs.
 *
 * Opt-in: RUN_PERF=1, a running Appium server with this driver, winforms-large built
 * in ../appium-wincore-test-apps. Records to test/perf/results/, fails only on a >3x
 * regression vs test/perf/baselines/uia.json.
 */
describe.skipIf(!RUN)('plain UIA page source / tree walk perf', () => {
    let driver: Browser;
    const results: OpResult[] = [];

    beforeAll(async () => {
        driver = await createWinformsLargeSession(NODE_COUNT, { 'appium:perfMetrics': true });
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }, 120_000);

    afterAll(async () => {
        try {
            finalizeRun(SUITE, results);
        } finally {
            await quitSession(driver);
        }
    });

    it('measures getPageSource', async () => {
        const r = await measure(driver, 'getPageSource', NODE_COUNT, () => driver.getPageSource());
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });

    it('measures full-tree //* findElements', async () => {
        const r = await measure(driver, 'findAll-star', NODE_COUNT, () => driver.$$('//*'));
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });

    it('measures a deep single-element XPath find', async () => {
        const r = await measure(driver, 'find-anchorLast', NODE_COUNT, () =>
            driver.$('//*[@Name="perfAnchorLast"]').getAttribute('Name'));
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });

    it('measures bulk getAttribute over 50 elements', async () => {
        const fields = await driver.$$('//Text');
        const slice = fields.slice(0, 50);
        const r = await measure(driver, 'getAttribute-x50', NODE_COUNT, async () => {
            for (const el of slice) {await el.getAttribute('Name');}
        });
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });
});
