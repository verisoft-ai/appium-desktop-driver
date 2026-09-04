import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { createJavaSwingLargeSession, quitSession } from '../e2e/helpers/session.js';
import { finalizeRun, measure, type OpResult } from './helpers/bench.js';

const RUN = process.env.RUN_PERF === '1' || process.env.RUN_PERF === 'true';
// Larger default than the other suites: the Java agent walk is one RPC per node, so a
// big tree (JTable-cell-dominated) is what pushes it into the multi-second range where
// the dumpTree fix can be shown to help.
const NODE_COUNT = Number(process.env.PERF_NODE_COUNT || 12000);
const SUITE = 'java';

/**
 * Java-agent tree-walk benchmark. Measures the operations that walk the whole
 * accessibility tree over the newline-JSON RPC channel to the in-JVM agent —
 * the ~20s getPageSource that kicked this investigation off.
 *
 * Opt-in: needs RUN_PERF=1, a running Appium server with this driver, and the
 * java-swing-large fixture built in ../appium-wincore-test-apps. Records every run
 * to test/perf/results/ and fails only on a >3x regression vs test/perf/baselines/java.json.
 */
describe.skipIf(!RUN)('java-agent page source / tree walk perf', () => {
    let driver: Browser;
    const results: OpResult[] = [];

    beforeAll(async () => {
        driver = await createJavaSwingLargeSession(NODE_COUNT, { 'appium:perfMetrics': true });
        // Let the tabbed pane realize its content so the accessibility tree is fully built.
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
        const fields = await driver.$$('//*[@JavaSimpleClass="JTextField"]');
        const slice = fields.slice(0, 50);
        const r = await measure(driver, 'getAttribute-x50', NODE_COUNT, async () => {
            for (const el of slice) {await el.getAttribute('Name');}
        });
        results.push(r);
        expect(r.p50Ms).toBeGreaterThan(0);
    });
});
