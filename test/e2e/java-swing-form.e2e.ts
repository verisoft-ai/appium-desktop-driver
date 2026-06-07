import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { createJavaSwingFormSession, quitSession } from './helpers/session.js';

describe('Java Swing Form', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createJavaSwingFormSession();
    }, 30000);

    afterAll(async () => {
        await quitSession(driver);
    });

    // ── XPath finding ──────────────────────────────────────────────────────────

    describe('XPath element finding', () => {
        it('finds the root element', async () => {
            const root_pane = await driver.$('//RootPane');
            expect(await root_pane.isExisting()).toBe(true);
        });

        it('finds all Edit (text field) elements', async () => {
            const fields = await driver.$$('//Edit');
            // firstName, lastName, email = at least 3
            expect(fields.length).toBeGreaterThanOrEqual(3);
        });

        it('finds firstName field by XPath Name attribute', async () => {
            const el = await driver.$('//Edit[@Name="firstName"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds lastName field by XPath Name attribute', async () => {
            const el = await driver.$('//Edit[@Name="lastName"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds email field by XPath Name attribute', async () => {
            const el = await driver.$('//Edit[@Name="email"]');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds submit button by XPath', async () => {
            const btn = await driver.$('//Button[@Name="submitButton"]');
            expect(await btn.isExisting()).toBe(true);
        });

        it('finds agree checkbox by XPath', async () => {
            const cb = await driver.$('//CheckBox[@Name="agreeCheckbox"]');
            expect(await cb.isExisting()).toBe(true);
        });

        it('finds country combo box by XPath', async () => {
            const combo = await driver.$('//ComboBox[@Name="country"]');
            expect(await combo.isExisting()).toBe(true);
        });

        it('findElements returns multiple Edit elements', async () => {
            const fields = await driver.$$('//Edit');
            expect(fields.length).toBeGreaterThan(1);
        });
    });

    // ── Accessibility id finding ───────────────────────────────────────────────

    describe('accessibility id finding', () => {
        it('finds firstName field by accessibility id', async () => {
            const el = await driver.$('~firstName');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds lastName field by accessibility id', async () => {
            const el = await driver.$('~lastName');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds email field by accessibility id', async () => {
            const el = await driver.$('~email');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds submitButton by accessibility id', async () => {
            const el = await driver.$('~submitButton');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds agreeCheckbox by accessibility id', async () => {
            const el = await driver.$('~agreeCheckbox');
            expect(await el.isExisting()).toBe(true);
        });

        it('finds country combo box by accessibility id', async () => {
            const el = await driver.$('~country');
            expect(await el.isExisting()).toBe(true);
        });
    });

    // ── Filling fields ─────────────────────────────────────────────────────────

    describe('filling text fields', () => {
        it('sets value on firstName field', async () => {
            const field = await driver.$('~firstName');
            await field.setValue('John');
        });

        it('sets value on lastName field', async () => {
            const field = await driver.$('~lastName');
            await field.setValue('Doe');
        });

        it('sets value on email field', async () => {
            const field = await driver.$('~email');
            await field.setValue('john.doe@example.com');
        });
    });

    // ── Clicking ───────────────────────────────────────────────────────────────

    describe('clicking elements', () => {
        it('clicks the agree checkbox', async () => {
            const cb = await driver.$('~agreeCheckbox');
            await cb.click();
        });

        it('clicks the submit button', async () => {
            const btn = await driver.$('~submitButton');
            await btn.click();
        });
    });
});
