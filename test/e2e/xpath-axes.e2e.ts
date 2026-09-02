/**
 * E2E coverage for XPath axes and functions, exercised end to end: driver ->
 * `evaluateXPath` RPC -> `DesktopDriverServer.exe` materialises the live UIA
 * subtree into an `XmlDocument` and runs the whole expression through
 * `System.Xml.XPath` (`lib/xpath/` is just the client shim). The synthetic-tree
 * unit coverage is `csharp/DesktopDriverServer.Tests/XPathEvaluatorTests.cs`;
 * this pins the same behaviour against a real UIA tree.
 *
 * Target: Windows Calculator. Its NumberPad group (`AutomationId="NumberPad"`)
 * holds `num0Button`..`num9Button` as direct sibling children — a stable,
 * always-present structure to exercise sibling/parent/ancestor axes against.
 *
 * Motivating regression: `//X[...]/following-sibling::Y` silently returned
 * nothing when callers assumed a DOM-like layout but the UIA tree nested the
 * target under a different parent. The axis itself works — these tests pin that.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { createCalculatorSession, quitSession } from './helpers/session.js';

const NUMPAD = '//Group[@AutomationId="NumberPad"]';

describe('XPath axes and functions (native UIA engine)', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createCalculatorSession();
        await driver.$('~num1Button').waitForExist({ timeout: 15_000 });
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    // ── Sibling axes ─────────────────────────────────────────────────────────

    describe('following-sibling', () => {
        it('finds a later sibling by attribute', async () => {
            const el = await driver.$(
                '//Button[@AutomationId="num1Button"]/following-sibling::Button[@AutomationId="num2Button"]'
            );
            expect(await el.isExisting()).toBe(true);
        });

        it('returns every following Button sibling', async () => {
            const els = await driver.$$(
                '//Button[@AutomationId="num1Button"]/following-sibling::Button'
            );
            expect(els.length).toBeGreaterThanOrEqual(1);
        });

        it('[1] selects the immediately adjacent sibling', async () => {
            const el = await driver.$(
                '//Button[@AutomationId="num1Button"]/following-sibling::Button[1]'
            );
            expect(await el.isExisting()).toBe(true);
        });

        it('returns nothing when the match has no following sibling of that type', async () => {
            const els = await driver.$$(
                '//Button[@AutomationId="num1Button"]/following-sibling::Edit'
            );
            expect(els.length).toBe(0);
        });
    });

    describe('preceding-sibling', () => {
        it('finds an earlier sibling by attribute (reciprocal of following-sibling)', async () => {
            const el = await driver.$(
                '//Button[@AutomationId="num2Button"]/preceding-sibling::Button[@AutomationId="num1Button"]'
            );
            expect(await el.isExisting()).toBe(true);
        });

        it('returns every preceding Button sibling', async () => {
            const els = await driver.$$(
                '//Button[@AutomationId="num9Button"]/preceding-sibling::Button'
            );
            expect(els.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── Parent / ancestor axes ──────────────────────────────────────────────

    describe('parent axis', () => {
        it('parent::Group resolves to the NumberPad container', async () => {
            const el = await driver.$('//Button[@AutomationId="num1Button"]/parent::Group');
            expect(await el.getAttribute('AutomationId')).toBe('NumberPad');
        });

        it('abbreviated .. resolves to the same parent', async () => {
            const el = await driver.$('//Button[@AutomationId="num1Button"]/..');
            expect(await el.getAttribute('AutomationId')).toBe('NumberPad');
        });
    });

    describe('ancestor / ancestor-or-self axes', () => {
        it('ancestor::Window resolves to the app window', async () => {
            const el = await driver.$('//Button[@AutomationId="num1Button"]/ancestor::Window');
            expect(await el.isExisting()).toBe(true);
        });

        it('ancestor-or-self::Button matches the element itself', async () => {
            const el = await driver.$(
                '//Button[@AutomationId="num1Button"]/ancestor-or-self::Button[@AutomationId="num1Button"]'
            );
            expect(await el.isExisting()).toBe(true);
        });
    });

    // ── Descendant / child / self axes ──────────────────────────────────────

    describe('descendant / child / self axes', () => {
        it('child::Button lists the direct number buttons', async () => {
            const els = await driver.$$(`${NUMPAD}/child::Button`);
            expect(els.length).toBeGreaterThanOrEqual(10);
        });

        it('descendant::Button reaches nested buttons', async () => {
            const els = await driver.$$(`${NUMPAD}/descendant::Button`);
            expect(els.length).toBeGreaterThanOrEqual(10);
        });

        it('self::Button matches when the node test agrees', async () => {
            const el = await driver.$('//Button[@AutomationId="num1Button"]/self::Button');
            expect(await el.isExisting()).toBe(true);
        });

        it('self::Edit does not match a Button', async () => {
            const els = await driver.$$('//Button[@AutomationId="num1Button"]/self::Edit');
            expect(els.length).toBe(0);
        });
    });

    // ── Document-order axes ─────────────────────────────────────────────────

    describe('following / preceding axes', () => {
        it('following::Button returns later buttons in document order', async () => {
            const els = await driver.$$('//Button[@AutomationId="num1Button"]/following::Button');
            expect(els.length).toBeGreaterThanOrEqual(1);
        });

        it('preceding::Button returns earlier buttons in document order', async () => {
            const els = await driver.$$('//Button[@AutomationId="num9Button"]/preceding::Button');
            expect(els.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── Union ───────────────────────────────────────────────────────────────

    describe('union operator', () => {
        it('| merges two node sets', async () => {
            const els = await driver.$$(
                '//Button[@AutomationId="num1Button"] | //Button[@AutomationId="num2Button"]'
            );
            expect(els.length).toBe(2);
        });
    });

    // ── Positional predicates ───────────────────────────────────────────────

    describe('position() and last() — step predicate', () => {
        it('position()=2 selects the second child', async () => {
            const el = await driver.$(`${NUMPAD}/Button[position()=2]`);
            expect(await el.isExisting()).toBe(true);
        });

        it('last() selects the final child', async () => {
            const el = await driver.$(`${NUMPAD}/Button[last()]`);
            expect(await el.isExisting()).toBe(true);
        });
    });

    describe('filter expression — (node-set)[predicate]', () => {
        it('(set)[1] selects the first node', async () => {
            const first = await driver.$(`${NUMPAD}/Button[1]`);
            const filtered = await driver.$(`(${NUMPAD}/Button)[1]`);
            expect(await filtered.getAttribute('AutomationId'))
                .toBe(await first.getAttribute('AutomationId'));
        });

        it('(set)[last()] selects the same node as the step form', async () => {
            const stepLast = await driver.$(`${NUMPAD}/Button[last()]`);
            const filterLast = await driver.$(`(${NUMPAD}/Button)[last()]`);
            expect(await filterLast.getAttribute('AutomationId'))
                .toBe(await stepLast.getAttribute('AutomationId'));
        });

        it('(set)[position() > 1] drops the first node', async () => {
            const all = await driver.$$(`${NUMPAD}/Button`);
            const sliced = await driver.$$(`(${NUMPAD}/Button)[position() > 1]`);
            expect(sliced.length).toBe(all.length - 1);
        });

        it('(set)[last() - 1] selects the penultimate node', async () => {
            const all = await driver.$$(`${NUMPAD}/Button`);
            const penultimateId = await all[all.length - 2].getAttribute('AutomationId');
            const el = await driver.$(`(${NUMPAD}/Button)[last() - 1]`);
            expect(await el.getAttribute('AutomationId')).toBe(penultimateId);
        });
    });

    // ── Function predicates ─────────────────────────────────────────────────

    describe('function predicates', () => {
        it('not() excludes a specific element', async () => {
            const els = await driver.$$(`${NUMPAD}/Button[not(@AutomationId="num1Button")]`);
            const ids = await els.map((e) => e.getAttribute('AutomationId'));
            expect(ids.length).toBeGreaterThanOrEqual(9);
            expect(ids).not.toContain('num1Button');
        });

        it('or predicate matches either branch', async () => {
            const els = await driver.$$(
                '//Button[@AutomationId="num1Button" or @AutomationId="num2Button"]'
            );
            expect(els.length).toBe(2);
        });

        it('and predicate requires both branches', async () => {
            const el = await driver.$(
                '//Button[@AutomationId="num1Button" and @Name="One"]'
            );
            expect(await el.isExisting()).toBe(true);
        });

        it('normalize-space() around an attribute value', async () => {
            const el = await driver.$('//Button[normalize-space(@Name)="One"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('count() over child axis inside a predicate', async () => {
            const els = await driver.$$('//Group[count(child::Button) >= 10]');
            const ids = await els.map((e) => e.getAttribute('AutomationId'));
            expect(ids).toContain('NumberPad');
        });

        it('nested element predicate (Group containing num1Button)', async () => {
            const el = await driver.$('//Group[Button[@AutomationId="num1Button"]]');
            expect(await el.getAttribute('AutomationId')).toBe('NumberPad');
        });
    });

    // ── Wildcards ───────────────────────────────────────────────────────────

    describe('wildcards', () => {
        it('* node test with positional predicate', async () => {
            const el = await driver.$(`${NUMPAD}/*[1]`);
            expect(await el.isExisting()).toBe(true);
        });

        it('//* with attribute predicate', async () => {
            const el = await driver.$('//*[@AutomationId="num1Button"]');
            expect(await el.getTagName()).toBe('Button');
        });
    });
});
