import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Selector } from 'webdriverio';
import {
    launchNet8WpfMinimalExternally,
    createDotnetBridgeAttachSession,
    quitSession,
} from './helpers/session.js';

/**
 * Multi-step XPath (descendant / child axis with an @Name predicate on an
 * intermediate node) resolved through the .NET bridge on a CoreCLR (.NET 8) WPF
 * target — the `windows: findElement(s)ViaDotnetBridge` + `xpath` path.
 *
 * Reproduces a user report: `windows: findElementViaDotnetBridge` with a selector
 * like `//TextBlock[@Name='x']//...` against a CoreCLR .NET bridge. That request
 * flows executeScript -> findElementViaDotnetBridge -> locateElements('xpath') ->
 * xpathToElIdOrIds -> evaluateXPath, remapped by wrapForDotnetBridge to
 * evaluateXPathDotnetBridge, which materialises the bridge's reflected subtree and
 * runs the whole expression through System.Xml.XPath.
 *
 * Fixture: appium-windows2-test-apps/net8-wpf-minimal/ —
 *   Grid
 *     TextBox   TxtInput
 *     Button    BtnClick
 *     TextBlock LblClickCount
 *     OwnerDrawListFixture ListFixture
 *     Border "InfoCard"
 *       StackPanel "InfoPanel"
 *         TextBlock "InfoTitle"  ("Account")
 *         TextBlock "InfoBody"   ("Active")
 *         Button    "InfoAction" ("Refresh")
 */
describe('.NET Bridge — CoreCLR WPF multi-step XPath (net8-wpf-minimal fixture)', () => {
    let driver: Browser;
    let appProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchNet8WpfMinimalExternally();
        appProc = launched.proc;
        driver = await createDotnetBridgeAttachSession(launched.hwnd);
        // WPF fixture launch + session + CoreCLR profiler attach (up to a 20s
        // wait budget in CoreClrAttacher) must all fit here; 30s is too tight on
        // a loaded CI machine.
    }, 60_000);

    afterAll(async () => {
        await quitSession(driver);
        try { appProc?.kill(); } catch { /* already exited */ }
    });

    const findOne = (value: string) =>
        driver.executeScript('windows: findElementViaDotnetBridge', [{ using: 'xpath', value }]);
    const findAll = (value: string) =>
        driver.executeScript('windows: findElementsViaDotnetBridge', [{ using: 'xpath', value }]) as Promise<unknown[]>;

    it('resolves a bare node test with an @Name predicate', async () => {
        const found = await findOne('//TextBlock[@Name="InfoTitle"]');
        expect(found).not.toBeNull();
        const el = await driver.$(found as unknown as Selector);
        expect(await el.getText()).toBe('Account');
    });

    it('resolves a descendant step under a named intermediate (//Border[@Name=..]//TextBlock[@Name=..])', async () => {
        const found = await findOne('//Border[@Name="InfoCard"]//TextBlock[@Name="InfoBody"]');
        expect(found).not.toBeNull();
        const el = await driver.$(found as unknown as Selector);
        expect(await el.getText()).toBe('Active');
    });

    it('descendant axis returns every match in document order', async () => {
        // Every TextBlock under the panel, in document order. InfoAction's Button template
        // renders its "Refresh" content as a nested TextBlock, and the bridge names any
        // unnamed FrameworkElement after its text/content (Reflector: Name <- Text fallback),
        // so that node has Name="Refresh" and is a genuine third match of the descendant axis.
        const els = await findAll('//StackPanel[@Name="InfoPanel"]//TextBlock[@Name!=""]');
        const texts: string[] = [];
        for (const e of els) {
            texts.push(await driver.$(e as unknown as Selector).getText());
        }
        expect(texts).toEqual(['Account', 'Active', 'Refresh']);
    });

    it('reaches a Button through a descendant step', async () => {
        const found = await findOne('//Border[@Name="InfoCard"]//Button[@Name="InfoAction"]');
        expect(found).not.toBeNull();
        const el = await driver.$(found as unknown as Selector);
        expect(await el.getAttribute('Name')).toBe('InfoAction');
    });

    it('positional predicate over a materialised descendant set', async () => {
        // Set is [InfoTitle "Account", InfoBody "Active", InfoAction's template TextBlock
        // "Refresh"] in document order — see the descendant-axis test above for why "Refresh"
        // is in the set.
        const set = '(//StackPanel[@Name="InfoPanel"]//TextBlock[@Name!=""])';
        const first = await findOne(`${set}[1]`);
        const el = await driver.$(first as unknown as Selector);
        expect(await el.getText()).toBe('Account');

        const second = await findOne(`${set}[2]`);
        expect(await driver.$(second as unknown as Selector).getText()).toBe('Active');

        const last = await findOne(`${set}[last()]`);
        const elLast = await driver.$(last as unknown as Selector);
        expect(await elLast.getText()).toBe('Refresh');
    });

    it('contains() predicate on an attribute', async () => {
        const els = await findAll('//TextBlock[contains(@Name,"Info")]');
        expect(els.length).toBeGreaterThanOrEqual(2);
    });

    it('following-sibling axis inside the panel', async () => {
        const found = await findOne(
            '//TextBlock[@Name="InfoTitle"]/following-sibling::TextBlock[@Name="InfoBody"]',
        );
        expect(found).not.toBeNull();
        const el = await driver.$(found as unknown as Selector);
        expect(await el.getText()).toBe('Active');
    });

    it('a no-match multi-step selector: findElements -> [], findElement -> NoSuchElement', async () => {
        expect(await findAll('//Border[@Name="InfoCard"]//TextBlock[@Name="Nope"]')).toEqual([]);

        // The driver responds to the singular no-match with a W3C `no such element` error
        // (HTTP 404) — same contract as standard findElement. WebdriverIO's executeScript
        // transport does not re-throw that particular error, it resolves with the error
        // body, so assert on the payload rather than expecting a rejection here.
        const res = await findOne('//Border[@Name="Nope"]//TextBlock') as { error?: string };
        expect(res?.error).toBe('no such element');
    });
});
