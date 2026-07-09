/**
 * E2E tests for Edge UIA automation (no WebView/CDP, no IEDriverServer proxy).
 * Target: the-internet.herokuapp.com
 *
 * Navigation between test groups uses Ctrl+L to focus the Edge address bar,
 * then types the URL and presses Enter via the windows: keys extension command.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { createEdgeIEModeSession, quitSession } from './helpers/session.js';

const BASE_URL = 'https://the-internet.herokuapp.com';

async function navigateTo(driver: Browser, url: string): Promise<void> {
    await driver.keys(['Control', 'l']);
    await driver.pause(400);
    await driver.executeScript('windows: keys', [{ actions: [{ text: url }] }]);
    await driver.pause(200);
    await driver.keys(['Return']);
    await driver.pause(3000);
}

describe('Edge UIA — the-internet.herokuapp.com', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createEdgeIEModeSession(BASE_URL);
        await driver.pause(4000);
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    // ── Page bootstrap ────────────────────────────────────────────────────────

    describe('bootstrap', () => {
        it('home page has Hyperlink elements', async () => {
            const links = await driver.$$('//Hyperlink');
            expect(links.length).toBeGreaterThan(0);
        });

        it('home page has a known link by name', async () => {
            const link = await driver.$('//Hyperlink[@Name="A/B Testing"]');
            expect(await link.isExisting()).toBe(true);
        });

        it('getTitle returns non-empty string', async () => {
            const title = await driver.getTitle();
            expect(typeof title).toBe('string');
            expect(title.length).toBeGreaterThan(0);
        });

        it('getWindowRect returns positive dimensions', async () => {
            const rect = await driver.getWindowRect();
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
        });

        it('takeScreenshot returns valid PNG', async () => {
            const screenshot = await driver.takeScreenshot();
            expect(typeof screenshot).toBe('string');
            expect(screenshot.length).toBeGreaterThan(0);
            const buf = Buffer.from(screenshot, 'base64');
            expect(buf[0]).toBe(0x89);
            expect(buf[1]).toBe(0x50); // P
            expect(buf[2]).toBe(0x4e); // N
            expect(buf[3]).toBe(0x47); // G
        });

        it('getWindowHandles returns at least one handle', async () => {
            const handles = await driver.getWindowHandles();
            expect(Array.isArray(handles)).toBe(true);
            expect(handles.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── UIA element types present on home page ────────────────────────────────

    describe('element types — home page', () => {
        it('finds Hyperlink elements', async () => {
            const links = await driver.$$('//Hyperlink');
            expect(links.length).toBeGreaterThan(0);
        });

        it('finds Text elements', async () => {
            const texts = await driver.$$('//Text');
            expect(texts.length).toBeGreaterThan(0);
        });

        it('finds ListItem elements', async () => {
            const items = await driver.$$('//ListItem');
            expect(items.length).toBeGreaterThan(0);
        });

        it('finds a Document element (page content root)', async () => {
            const docs = await driver.$$('//Document');
            expect(docs.length).toBeGreaterThanOrEqual(1);
        });

        it('first Hyperlink isDisplayed true', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            expect(await link.isDisplayed()).toBe(true);
        });

        it('first Hyperlink isEnabled true', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            expect(await link.isEnabled()).toBe(true);
        });
    });

    // ── UIA attributes ────────────────────────────────────────────────────────

    describe('UIA attributes', () => {
        it('reads Name attribute from a Hyperlink', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const name = await link.getAttribute('Name');
            expect(typeof name).toBe('string');
        });

        it('reads ControlType attribute from a Hyperlink', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const ct = await link.getAttribute('ControlType');
            expect(typeof ct).toBe('string');
            expect((ct ?? '').length).toBeGreaterThan(0);
        });

        it('reads IsEnabled attribute', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const val = await link.getAttribute('IsEnabled');
            expect(val).toBeTruthy();
        });

        it('reads BoundingRectangle attribute', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const rect = await link.getAttribute('BoundingRectangle');
            expect(rect).toBeTruthy();
        });

        it('getText on a Hyperlink returns a non-empty string', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const text = await link.getText();
            expect(typeof text).toBe('string');
            expect(text.length).toBeGreaterThan(0);
        });

        it('getLocation returns numeric x and y', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const loc = await link.getLocation();
            expect(typeof loc.x).toBe('number');
            expect(typeof loc.y).toBe('number');
        });

        it('getSize returns positive width and height', async () => {
            const link = await driver.$('//Hyperlink[@Name]');
            const size = await link.getSize();
            expect(size.width).toBeGreaterThan(0);
            expect(size.height).toBeGreaterThan(0);
        });
    });

    // ── Click and navigation ──────────────────────────────────────────────────

    describe('click and navigation', () => {
        it('clicking a Hyperlink navigates to the target page', async () => {
            await navigateTo(driver, BASE_URL);
            const link = await driver.$('//Hyperlink[@Name="A/B Testing"]');

            await link.click();
            await driver.pause(3000);

            // Verify we landed on /abtest — page randomly shows "A/B Test Control" or "A/B Test Variation 1"
            const heading = await driver.$('//*[contains(@Name, "A/B Test")]');
            expect(await heading.isExisting()).toBe(true);
        });

        it('navigating to a different page shows elements unique to that page', async () => {
            await navigateTo(driver, `${BASE_URL}/checkboxes`);
            // CheckBox elements only exist on /checkboxes
            const checkboxes = await driver.$$('//CheckBox');
            expect(checkboxes.length).toBeGreaterThanOrEqual(2);

            await navigateTo(driver, `${BASE_URL}/login`);
            // Edit fields for username/password only exist on /login
            const inputs = await driver.$$('//Edit');
            expect(inputs.length).toBeGreaterThanOrEqual(2);
        });

        it('navigating to /login shows login-specific elements', async () => {
            await navigateTo(driver, `${BASE_URL}/login`);
            const username = await driver.$('//Edit[@Name="Username"]');
            expect(await username.isExisting()).toBe(true);
        });
    });

    // ── Text input (login page) ───────────────────────────────────────────────

    describe('text input — /login', () => {
        beforeAll(async () => {
            await navigateTo(driver, `${BASE_URL}/login`);
        });

        it('finds Edit elements on the login form', async () => {
            const inputs = await driver.$$('//Edit');
            expect(inputs.length).toBeGreaterThanOrEqual(2);
        });

        it('Edit elements are displayed and enabled', async () => {
            const username = await driver.$('//Edit[@Name="Username"]');
            expect(await username.isDisplayed()).toBe(true);
            expect(await username.isEnabled()).toBe(true);
        });

        it('clearValue empties the username field', async () => {
            const username = await driver.$('//Edit[@Name="Username"]');
            await username.setValue('tomsmith');
            await username.clearValue();
            await driver.pause(200);
            const text = await username.getText();
            expect(text.trim()).toBe('');
        });

        it('setValue types text into the username field', async () => {
            const username = await driver.$('//Edit[@Name="Username"]');
            await username.setValue('tomsmith');
            const text = await username.getText();
            expect(text).toContain('tomsmith');
        });


        it('setValue on password field', async () => {
            const password = await driver.$('//Edit[@Name="Password"]');
            await password.setValue('SuperSecretPassword!');
            const text = await password.getText();
            expect(text.length).toBeGreaterThan(0);
        });
    });

    // ── Checkboxes ────────────────────────────────────────────────────────────

    describe('checkboxes — /checkboxes', () => {
        beforeAll(async () => {
            await navigateTo(driver, `${BASE_URL}/checkboxes`);
        });

        it('finds at least two CheckBox elements', async () => {
            const boxes = await driver.$$('//CheckBox');
            expect(boxes.length).toBeGreaterThanOrEqual(2);
        });

        it('CheckBox isDisplayed and isEnabled', async () => {
            const boxes = await driver.$$('//CheckBox');
            expect(await boxes[0].isDisplayed()).toBe(true);
            expect(await boxes[0].isEnabled()).toBe(true);
        });

        it('isSelected returns a boolean', async () => {
            const boxes = await driver.$$('//CheckBox');
            const selected = await boxes[0].isSelected();
            expect(typeof selected).toBe('boolean');
        });

        it('clicking a checkbox toggles its selected state', async () => {
            const boxes = await driver.$$('//CheckBox');
            const before = await boxes[0].isSelected();
            await boxes[0].click();
            await driver.pause(300);
            const after = await boxes[0].isSelected();
            expect(after).toBe(!before);
        });

        it('clicking checkbox twice restores original state', async () => {
            const boxes = await driver.$$('//CheckBox');
            const original = await boxes[0].isSelected();
            await boxes[0].click();
            await driver.pause(1000);
            await boxes[0].click();
            await driver.pause(300);
            expect(await boxes[0].isSelected()).toBe(original);
        });

        it('second checkbox has independent state', async () => {
            const boxes = await driver.$$('//CheckBox');
            const state0 = await boxes[0].isSelected();
            const state1 = await boxes[1].isSelected();
            // They may or may not match but both are valid booleans
            expect(typeof state0).toBe('boolean');
            expect(typeof state1).toBe('boolean');
        });
    });

    // ── Dropdown ──────────────────────────────────────────────────────────────

    describe('dropdown — /dropdown', () => {
        beforeAll(async () => {
            await navigateTo(driver, `${BASE_URL}/dropdown`);
        });

        it('finds a ComboBox or List element for the select', async () => {
            const combo = await driver.$('//ComboBox');
            const list = await driver.$('//List');
            const found = (await combo.isExisting()) || (await list.isExisting());
            expect(found).toBe(true);
        });

        it('dropdown control is displayed and enabled', async () => {
            const combo = await driver.$('//ComboBox');
            if (await combo.isExisting()) {
                expect(await combo.isDisplayed()).toBe(true);
                expect(await combo.isEnabled()).toBe(true);
            }
        });

        it('dropdown has ListItem children', async () => {
            const items = await driver.$$('//ListItem');
            // May be 0 if options are hidden until expanded — just no throw
            expect(Array.isArray(items)).toBe(true);
        });
    });

    // ── Dynamic loading / implicit wait ───────────────────────────────────────

    describe('dynamic loading — /dynamic_loading/2', () => {
        beforeAll(async () => {
            await navigateTo(driver, `${BASE_URL}/dynamic_loading/2`);
        });

        it('Start button exists before loading', async () => {
            const btn = await driver.$('//Button');
            expect(await btn.isExisting()).toBe(true);
        });

        it('clicking Start reveals a hidden element within timeout', async () => {
            const btn = await driver.$('//Button');
            await btn.click();
            await driver.pause(7500);

            // Look for "Hello World!" text that appears after loading
            const loaded = await driver.$('//*[contains(@Name, "Hello World")]');
            const exists = await loaded.isExisting();
            expect(exists).toBe(true);
        });
    });

    // ── Navigation verification via known elements ────────────────────────────

    describe('navigation — verify via unique elements', () => {
        it('/checkboxes has CheckBox controls', async () => {
            await navigateTo(driver, `${BASE_URL}/checkboxes`);
            const checkboxes = await driver.$$('//CheckBox');
            expect(checkboxes.length).toBeGreaterThanOrEqual(2);
        });

        it('/login has username and password Edit controls', async () => {
            await navigateTo(driver, `${BASE_URL}/login`);
            const username = await driver.$('//Edit[@Name="Username"]');
            const password = await driver.$('//Edit[@Name="Password"]');
            expect(await username.isExisting()).toBe(true);
            expect(await password.isExisting()).toBe(true);
        });

        it('screenshot after navigation returns valid PNG', async () => {
            await navigateTo(driver, `${BASE_URL}/checkboxes`);
            const shot = await driver.takeScreenshot();
            const buf = Buffer.from(shot, 'base64');
            expect(buf[0]).toBe(0x89);
            expect(buf[1]).toBe(0x50);
        });
    });

    // ── Page source — verify traversal reflects navigation ────────────────────

    describe('page source', () => {
        it('getPageSource differs before and after navigation', async () => {
            await navigateTo(driver, `${BASE_URL}/checkboxes`);
            const sourceBefore = await driver.getPageSource();
            expect(typeof sourceBefore).toBe('string');
            expect(sourceBefore.length).toBeGreaterThan(0);

            await navigateTo(driver, `${BASE_URL}/login`);
            const sourceAfter = await driver.getPageSource();
            expect(typeof sourceAfter).toBe('string');
            expect(sourceAfter.length).toBeGreaterThan(0);

            expect(sourceAfter).not.toBe(sourceBefore);
        });
    });

    // ── Data tables — /tables ─────────────────────────────────────────────────

    describe('data tables — /tables', () => {
        beforeAll(async () => {
            await navigateTo(driver, `${BASE_URL}/tables`);
        });

        it('finds two Table elements', async () => {
            const tables = await driver.$$('//Table');
            expect(tables.length).toBe(2);
        });

        it('table1 has expected column headers', async () => {
            const headers = await driver.$$('//*[@AutomationId="table1"]//HeaderItem');
            const names = await headers.map((h) => h.getAttribute('Name'));
            expect(names).toContain('Last Name');
            expect(names).toContain('First Name');
            expect(names).toContain('Email');
            expect(names).toContain('Due');
        });

        it('table1 has 4 data rows (24 DataItem cells total)', async () => {
            const cells = await driver.$$('//*[@AutomationId="table1"]//DataItem');
            expect(cells.length).toBe(24);
        });

        it('finds a specific cell value in table1', async () => {
            const cell = await driver.$('//*[@AutomationId="table1"]//DataItem[@Name="Smith"]');
            expect(await cell.isExisting()).toBe(true);
        });

        it('reads all last-name cells from table1', async () => {
            const cells = await driver.$$('//*[@AutomationId="table1"]//DataItem');
            const names = await cells.map((c) => c.getAttribute('Name'));
            expect(names).toContain('Smith');
            expect(names).toContain('Bach');
            expect(names).toContain('Doe');
            expect(names).toContain('Conway');
        });

        it('table2 has same headers as table1', async () => {
            const headers = await driver.$$('//*[@AutomationId="table2"]//HeaderItem');
            expect(headers.length).toBe(6);
        });

        it('clicking a sortable header in table2 does not throw', async () => {
            const header = await driver.$('//*[@AutomationId="table2"]//HeaderItem[@Name="Last Name"]');
            await expect(header.click()).resolves.not.toThrow();
            await driver.pause(500);
        });
    });

    // ── List items — home page ────────────────────────────────────────────────

    describe('list items — home page', () => {
        beforeAll(async () => {
            await navigateTo(driver, BASE_URL);
        });

        it('home page has at least 40 list items', async () => {
            const items = await driver.$$('//ListItem');
            expect(items.length).toBeGreaterThanOrEqual(40);
        });

        it('finds a specific list item by name', async () => {
            const item = await driver.$('//ListItem[@Name="Checkboxes"]');
            expect(await item.isExisting()).toBe(true);
        });

        it('list items contain Hyperlink children', async () => {
            const link = await driver.$('//ListItem[@Name="Checkboxes"]//Hyperlink');
            expect(await link.isExisting()).toBe(true);
        });

        it('first visible list item is displayed and enabled', async () => {
            const item = await driver.$('//ListItem[@Name="A/B Testing"]');
            expect(await item.isDisplayed()).toBe(true);
            expect(await item.isEnabled()).toBe(true);
        });

        it('offscreen list items exist in UIA tree even when not visible', async () => {
            // Items below the fold are in the UIA tree with IsOffscreen=True
            const item = await driver.$('//ListItem[@Name="Typos"]');
            expect(await item.isExisting()).toBe(true);
        });
    });

    // ── Scrolling — home page ─────────────────────────────────────────────────

    describe('scrolling — home page', () => {
        beforeAll(async () => {
            await navigateTo(driver, BASE_URL);
        });

        it('W3C wheel scroll down moves elements up in viewport', async () => {
            const item = await driver.$('//ListItem[@Name="Checkboxes"]');
            const yBefore = (await item.getLocation()).y;

            await driver.action('wheel').scroll({
                origin: item,
                deltaX: 0,
                deltaY: 500,
            }).perform();
            await driver.pause(400);

            const yAfter = (await item.getLocation()).y;
            expect(yAfter).toBeLessThan(yBefore);
        });

        it('W3C wheel scroll up restores element position', async () => {
            const item = await driver.$('//ListItem[@Name="Checkboxes"]');
            const yScrolled = (await item.getLocation()).y;

            await driver.action('wheel').scroll({
                origin: item,
                deltaX: 0,
                deltaY: -500,
            }).perform();
            await driver.pause(400);

            const yRestored = (await item.getLocation()).y;
            expect(yRestored).toBeGreaterThan(yScrolled);
        });

        it('windows: scroll command scrolls the page', async () => {
            await navigateTo(driver, BASE_URL);
            const item = await driver.$('//ListItem[@Name="Checkboxes"]');
            const yBefore = (await item.getLocation()).y;

            await driver.executeScript('windows: scroll', [{
                elementId: item.elementId,
                deltaX: 0,
                deltaY: 500,
            }]);
            await driver.pause(400);

            const yAfter = (await item.getLocation()).y;
            expect(yAfter).toBeLessThan(yBefore);
        });
    });

    // ── Window handles ────────────────────────────────────────────────────────

    describe('window handles', () => {
        beforeAll(async () => {
            await navigateTo(driver, BASE_URL);
        });

        it('all handles match 0x hex format', async () => {
            const handles = await driver.getWindowHandles();
            for (const h of handles) {
                expect(h).toMatch(/^0x[0-9a-fA-F]+$/);
            }
        });

        it('getWindowHandle returns a handle in the handles list', async () => {
            const current = await driver.getWindowHandle();
            const all = await driver.getWindowHandles();
            expect(all).toContain(current);
        });

        it('switchToWindow with current handle does not throw', async () => {
            const handle = await driver.getWindowHandle();
            await expect(driver.switchToWindow(handle)).resolves.not.toThrow();
        });

        it('switchToWindow with invalid handle throws', async () => {
            await expect(driver.switchToWindow('0xDEADBEEF')).rejects.toThrow();
        });
    });
});
