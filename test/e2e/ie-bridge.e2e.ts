/**
 * E2E tests for the IE DOM Bridge.
 *
 * The driver attaches to a running iexplore.exe process via WM_HTML_GETOBJECT,
 * retrieves IHTMLDocument2 via COM, and routes all element commands through a
 * 32-bit C# bridge process over stdio JSON.
 *
 * Supported locator strategies: id, css selector, xpath
 * Target site: https://the-internet.herokuapp.com
 *
 * Requirements:
 *   - Appium running on localhost:4723 with appium-desktop-driver installed
 *   - Internet Explorer 11 at C:\Program Files\Internet Explorer\iexplore.exe
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    createIEBridgeSession,
    createIEBridgeAttachSession,
    launchIEExternally,
    quitSession,
} from './helpers/session.js';

const BASE_URL = 'https://the-internet.herokuapp.com';

// ── Launch via app capability ─────────────────────────────────────────────────

describe('IE bridge — launch via app capability', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/login`);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('getTitle returns non-empty string', async () => {
        const title = await driver.getTitle();
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
    });

    it('getUrl returns the navigated URL', async () => {
        const url = await driver.getUrl();
        expect(url).toContain('the-internet.herokuapp.com');
    });

    it('getPageSource returns HTML containing known elements', async () => {
        const source = await driver.getPageSource();
        expect(typeof source).toBe('string');
        expect(source.toLowerCase()).toContain('<html');
        expect(source).toContain('username');
        expect(source).toContain('password');
    });
});

// ── Attach to existing IE window ──────────────────────────────────────────────

describe('IE bridge — attach to existing IE window', () => {
    let driver: Browser;

    beforeAll(async () => {
        // Launch IE externally, get its HWND, then attach without taking ownership
        const { hwnd } = await launchIEExternally(`${BASE_URL}/login`);
        await new Promise((resolve) => setTimeout(resolve, 6000));
        driver = await createIEBridgeAttachSession(hwnd);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('getTitle works after attaching to existing window', async () => {
        const title = await driver.getTitle();
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
    });

    it('getUrl returns URL of existing window', async () => {
        const url = await driver.getUrl();
        expect(url).toContain('the-internet.herokuapp.com');
    });

    it('can find elements in the attached window', async () => {
        const el = await driver.$('#username');
        expect(await el.isExisting()).toBe(true);
    });
});

// ── Locator strategies ────────────────────────────────────────────────────────

describe('IE bridge — locator strategies — /login', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/login`);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    describe('id', () => {
        it('findElement by id returns element', async () => {
            const el = await driver.findElement('id', 'username');
            expect(el).toBeDefined();
        });

        it('findElements by id returns array', async () => {
            const els = await driver.findElements('id', 'username');
            expect(Array.isArray(els)).toBe(true);
            expect(els.length).toBe(1);
        });
    });

    describe('css selector', () => {
        it('findElement by css selector — simple id selector', async () => {
            const el = await driver.$('#username');
            expect(await el.isExisting()).toBe(true);
        });

        it('findElement by css selector — attribute selector', async () => {
            const el = await driver.$('input[type="password"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('findElement by css selector — class selector', async () => {
            const el = await driver.$('button.radius');
            expect(await el.isExisting()).toBe(true);
        });

        it('findElements by css selector returns all matches', async () => {
            const inputs = await driver.$$('input');
            expect(Array.isArray(inputs)).toBe(true);
            expect(inputs.length).toBeGreaterThanOrEqual(2);
        });

        it('findElement with no match returns isExisting false', async () => {
            await driver.setTimeout({ implicit: 500 });
            const el = await driver.$('#does-not-exist-xyz');
            expect(await el.isExisting()).toBe(false);
            await driver.setTimeout({ implicit: 5000 });
        });
    });

    describe('xpath', () => {
        it('findElement by xpath — attribute predicate', async () => {
            const el = await driver.$('//input[@id="username"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('findElement by xpath — text content', async () => {
            const el = await driver.$('//button[contains(text(),"Login")]');
            expect(await el.isExisting()).toBe(true);
        });

        it('findElements by xpath returns array', async () => {
            const inputs = await driver.$$('//input');
            expect(Array.isArray(inputs)).toBe(true);
            expect(inputs.length).toBeGreaterThanOrEqual(2);
        });
    });
});

// ── Element interactions ──────────────────────────────────────────────────────

describe('IE bridge — element interactions — /login', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/login`);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('getText returns visible text', async () => {
        const btn = await driver.$('button[type="submit"]');
        const text = await btn.getText();
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
    });

    it('getAttribute returns the requested attribute', async () => {
        const el = await driver.$('#username');
        expect(await el.getAttribute('type')).toBe('text');
    });

    it('isDisplayed returns true for visible element', async () => {
        expect(await driver.$('#username').isDisplayed()).toBe(true);
    });

    it('isEnabled returns true for enabled input', async () => {
        expect(await driver.$('#username').isEnabled()).toBe(true);
    });

    it('setValue types into username field', async () => {
        const el = await driver.$('#username');
        await el.setValue('tomsmith');
        expect(await el.getValue()).toBe('tomsmith');
    });

    it('clearValue empties the field', async () => {
        const el = await driver.$('#username');
        await el.setValue('tomsmith');
        await el.clearValue();
        expect(await el.getValue()).toBe('');
    });

    it('click on submit navigates away from login', async () => {
        await driver.$('#username').setValue('tomsmith');
        await driver.$('#password').setValue('SuperSecretPassword!');
        await driver.$('button[type="submit"]').click();
        await driver.pause(2000);
        const url = await driver.getUrl();
        expect(url).not.toContain('/login');
    });
});

// ── Checkboxes (isSelected) ───────────────────────────────────────────────────

describe('IE bridge — checkboxes — /checkboxes', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/checkboxes`);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('isSelected returns boolean for checkbox', async () => {
        const boxes = await driver.$$('input[type="checkbox"]');
        expect(typeof await boxes[0].isSelected()).toBe('boolean');
    });

    it('click toggles checkbox isSelected state', async () => {
        const boxes = await driver.$$('input[type="checkbox"]');
        const before = await boxes[0].isSelected();
        await boxes[0].click();
        await driver.pause(300);
        expect(await boxes[0].isSelected()).toBe(!before);
    });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe('IE bridge — navigation', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/login`);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('url() navigates and getUrl reflects the new page', async () => {
        await driver.url(`${BASE_URL}/checkboxes`);
        await driver.pause(2000);
        expect(await driver.getUrl()).toContain('/checkboxes');
    });

    it('getTitle updates after navigation', async () => {
        await driver.url(`${BASE_URL}/login`);
        await driver.pause(2000);
        const title = await driver.getTitle();
        expect(title.length).toBeGreaterThan(0);
    });
});

// ── frame switching ─────────────────────────────────────────────────────────
// Uses /nested_frames, not /iframe — TinyMCE's iframe depends on cdn.tiny.cloud,
// unreachable from this VM.

describe('IE bridge — switchToFrame / switchToDefaultContent', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createIEBridgeSession(`${BASE_URL}/nested_frames`);
        await driver.pause(2000);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    it('switchFrame(0) scopes finds to the first frame (frame-top)', async () => {
        await driver.switchFrame(0 as never);
        const nestedFrameset = await driver.$('//frameset');
        expect(await nestedFrameset.isExisting()).toBe(true);
        await driver.switchFrame(null);
    });

    it('switchFrame by name scopes finds to that frame\'s content', async () => {
        const frameEl = await driver.$('//frame[@name="frame-bottom"]');
        expect(await frameEl.isExisting()).toBe(true);
        await driver.switchFrame(frameEl);
        const body = await driver.$('//body');
        expect(await body.isExisting()).toBe(true);
        expect(await body.getText()).toContain('BOTTOM');
        await driver.switchFrame(null);
    });

    it('top-level elements are not reachable while inside a frame', async () => {
        const frameEl = await driver.$('//frame[@name="frame-bottom"]');
        await driver.switchFrame(frameEl);
        await driver.setTimeout({ implicit: 500 });
        const topFrameset = await driver.$('//frameset');
        expect(await topFrameset.isExisting()).toBe(false);
        await driver.setTimeout({ implicit: 5000 });
        await driver.switchFrame(null);
    });

    it('switchFrame(null) restores access to the top-level document', async () => {
        const frameEl = await driver.$('//frame[@name="frame-bottom"]');
        await driver.switchFrame(frameEl);
        await driver.switchFrame(null);
        const topFrameset = await driver.$('//frameset');
        expect(await topFrameset.isExisting()).toBe(true);
    });

    it('switching directly between two frames (no default-content in between) scopes correctly each time', async () => {
        const bottomEl = await driver.$('//frame[@name="frame-bottom"]');
        await driver.switchFrame(bottomEl);
        expect(await (await driver.$('//body')).getText()).toContain('BOTTOM');
        await driver.switchFrame(null);

        const topEl = await driver.$('//frame[@name="frame-top"]');
        await driver.switchFrame(topEl);
        const nestedFrameset = await driver.$('//frameset');
        expect(await nestedFrameset.isExisting()).toBe(true);
        await driver.switchFrame(null);
    });

    it('supports nested frame switching (frame-top -> frame-left)', async () => {
        const topEl = await driver.$('//frame[@name="frame-top"]');
        await driver.switchFrame(topEl);

        const leftEl = await driver.$('//frame[@name="frame-left"]');
        expect(await leftEl.isExisting()).toBe(true);
        await driver.switchFrame(leftEl);

        const body = await driver.$('//body');
        expect(await body.getText()).toContain('LEFT');

        await driver.switchFrame(null);
        const topFrameset = await driver.$('//frameset');
        expect(await topFrameset.isExisting()).toBe(true);
    });

    it('repeated in/out cycles do not leak stale frame state', async () => {
        for (let i = 0; i < 2; i++) {
            const bottomEl = await driver.$('//frame[@name="frame-bottom"]');
            await driver.switchFrame(bottomEl);
            expect(await (await driver.$('//body')).getText()).toContain('BOTTOM');
            await driver.switchFrame(null);
            const topFrameset = await driver.$('//frameset');
            expect(await topFrameset.isExisting()).toBe(true);
        }
    });

    it('setValue and click work on elements inside a frame', async () => {
        const bottomEl = await driver.$('//frame[@name="frame-bottom"]');
        await driver.switchFrame(bottomEl);

        // /frame_bottom ships static text only — inject a real input + button so
        // setValue/click exercise the full element-interaction path inside a frame.
        await driver.execute(`
            var input = document.createElement('input');
            input.id = 'ieb-test-input';
            document.body.appendChild(input);
            var btn = document.createElement('button');
            btn.id = 'ieb-test-btn';
            btn.onclick = function () {
                btn.setAttribute('data-clicked', input.value);
            };
            document.body.appendChild(btn);
        `);

        const input = await driver.$('#ieb-test-input');
        await input.setValue('hello-frame');
        expect(await input.getValue()).toBe('hello-frame');

        const btn = await driver.$('#ieb-test-btn');
        await btn.click();
        expect(await btn.getAttribute('data-clicked')).toBe('hello-frame');

        await driver.switchFrame(null);
    });
});
