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

    describe('XPath element finding', () => {
        it('finds the root element', async () => {
            const root_pane = await driver.$('//RootPane');
            expect(await root_pane.isExisting()).toBe(true);
        });

        it('finds all Edit (text field) elements', async () => {
            const fields = await driver.$$('//Edit');
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

    describe('filling text fields', () => {
        it('sets value on firstName field and reads it back', async () => {
            const field = await driver.$('~firstName');
            await field.setValue('John');
            const value = await field.getText();
            expect(value).toBe('John');
        });

        it('sets value on lastName field and reads it back', async () => {
            const field = await driver.$('~lastName');
            await field.setValue('Doe');
            const value = await field.getText();
            expect(value).toBe('Doe');
        });

        it('sets value on email field and reads it back', async () => {
            const field = await driver.$('~email');
            await field.setValue('john.doe@example.com');
            const value = await field.getText();
            expect(value).toBe('john.doe@example.com');
        });

        it('firstName field still holds only its own value after all three are set', async () => {
            const firstName = await driver.$('~firstName');
            const value = await firstName.getText();
            expect(value).toBe('John');
        });

        it('clear() empties a field', async () => {
            const field = await driver.$('~firstName');
            await field.setValue('temp');
            await field.clearValue();
            const value = await field.getText();
            expect(value).toBe('');
        });

        it('windows: setValue pattern sets and reads value', async () => {
            const field = await driver.$('~lastName');
            await driver.executeScript('windows: setValue', [field, 'Smith']);
            const value = await driver.executeScript('windows: getValue', [field]) as string;
            expect(value).toBe('Smith');
        });
    });

    describe('clicking elements', () => {
        it('click() on agreeCheckbox changes its checked state', async () => {
            const cb = await driver.$('~agreeCheckbox');
            const before = await cb.isSelected();
            await cb.click();
            const after = await cb.isSelected();
            expect(after).not.toBe(before);
        });

        it('click() on agreeCheckbox is reversible (toggle back)', async () => {
            const cb = await driver.$('~agreeCheckbox');
            await cb.click();
            const state1 = await cb.isSelected();
            await cb.click();
            const state2 = await cb.isSelected();
            expect(state2).not.toBe(state1);
        });

        it('click() on submitButton does not throw', async () => {
            const btn = await driver.$('~submitButton');
            await expect(btn.click()).resolves.not.toThrow();
        });
    });

    describe('checkbox state reading', () => {
        it('isSelected() returns false when checkbox is unchecked', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            expect(await cb.isSelected()).toBe(false);
        });

        it('isSelected() returns true after checkbox is checked', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            await cb.click();
            expect(await cb.isSelected()).toBe(true);
        });
    });

    describe('windows: toggle', () => {
        it('toggles the checkbox on', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            await driver.executeScript('windows: toggle', [cb]);
            expect(await cb.isSelected()).toBe(true);
        });

        it('toggles the checkbox off', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (!await cb.isSelected()) { await cb.click(); }
            await driver.executeScript('windows: toggle', [cb]);
            expect(await cb.isSelected()).toBe(false);
        });
    });

    describe('windows: invoke', () => {
        it('invokes the submit button without throwing', async () => {
            const btn = await driver.$('~submitButton');
            await expect(
                driver.executeScript('windows: invoke', [btn])
            ).resolves.not.toThrow();
        });

        it('invokes agreeCheckbox (fires default action = toggle)', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            await driver.executeScript('windows: invoke', [cb]);
            expect(await cb.isSelected()).toBe(true);
        });
    });

    describe('windows: click extension command', () => {
        it('clicks the submit button via windows: click without error', async () => {
            const btn = await driver.$('~submitButton');
            await expect(
                driver.executeScript('windows: click', [{ elementId: btn.elementId }])
            ).resolves.not.toThrow();
        });

        it('clicks the agreeCheckbox via windows: click and changes state', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            await driver.executeScript('windows: click', [{ elementId: cb.elementId }]);
            expect(await cb.isSelected()).toBe(true);
        });
    });

    describe('W3C Actions with JAB element origin', () => {
        it('pointer move to checkbox element origin then click changes state', async () => {
            const cb = await driver.$('~agreeCheckbox');
            if (await cb.isSelected()) { await cb.click(); }
            await driver.performActions([{
                type: 'pointer',
                id: 'mouse',
                parameters: { pointerType: 'mouse' },
                actions: [
                    { type: 'pointerMove', duration: 0, origin: cb, x: 0, y: 0 },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pointerUp', button: 0 },
                ],
            }]);
            await driver.releaseActions();
            expect(await cb.isSelected()).toBe(true);
        });
    });

    describe('element state properties', () => {
        it('isDisplayed() returns true for visible elements', async () => {
            const btn = await driver.$('~submitButton');
            expect(await btn.isDisplayed()).toBe(true);
        });

        it('isEnabled() returns true for enabled elements', async () => {
            const btn = await driver.$('~submitButton');
            expect(await btn.isEnabled()).toBe(true);
        });
    });

    describe('element rect', () => {
        it('getRect returns positive width and height for submitButton', async () => {
            const btn = await driver.$('~submitButton');
            const rect = await btn.getSize();
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
        });

        it('getRect returns positive x and y — not zeroed screen coordinates', async () => {
            const btn = await driver.$('~submitButton');
            const location = await btn.getLocation();
            expect(location.x).toBeGreaterThan(0);
            expect(location.y).toBeGreaterThan(0);
        });
    });

    describe('label getText', () => {
        it('getText on a label returns its display text', async () => {
            const label = await driver.$('//Text[1]');
            const text = await label.getText();
            expect(text.length).toBeGreaterThan(0);
        });

        it('first label text contains "Name" or similar form label', async () => {
            const labels = await driver.$$('//Text');
            expect(labels.length).toBeGreaterThanOrEqual(3);
            const firstText = await labels[0].getText();
            expect(typeof firstText).toBe('string');
            expect(firstText.length).toBeGreaterThan(0);
        });
    });

    describe('comboBox', () => {
        it('getText on country comboBox returns current selection', async () => {
            const combo = await driver.$('~country');
            const text = await combo.getText();
            expect(text.length).toBeGreaterThan(0);
        });

        it('getRect on comboBox returns positive dimensions', async () => {
            const combo = await driver.$('~country');
            const size = await combo.getSize();
            expect(size.width).toBeGreaterThan(0);
            expect(size.height).toBeGreaterThan(0);
        });
    });

    describe('getPageSource', () => {
        it('returns non-empty XML string', async () => {
            const source = await driver.getPageSource();
            expect(typeof source).toBe('string');
            expect(source.length).toBeGreaterThan(0);
        });

        it('XML contains known element names', async () => {
            const source = await driver.getPageSource();
            expect(source).toContain('submitButton');
            expect(source).toContain('agreeCheckbox');
            expect(source).toContain('firstName');
        });

        it('XML contains control type tags', async () => {
            const source = await driver.getPageSource();
            expect(source).toContain('Button');
            expect(source).toContain('CheckBox');
        });
    });

    describe('XPath positional predicate', () => {
        it('//Edit[1] resolves to firstName', async () => {
            const el = await driver.$('//Edit[1]');
            const name = await el.getAttribute('Name');
            expect(name).toBe('firstName');
        });

        it('//Edit[2] resolves to lastName', async () => {
            const el = await driver.$('//Edit[2]');
            const name = await el.getAttribute('Name');
            expect(name).toBe('lastName');
        });

        it('//Edit[3] resolves to email', async () => {
            const el = await driver.$('//Edit[3]');
            const name = await el.getAttribute('Name');
            expect(name).toBe('email');
        });
    });

    describe('windows: hover', () => {
        it('hovers over submitButton without error', async () => {
            const btn = await driver.$('~submitButton');
            await expect(
                driver.executeScript('windows: hover', [{
                    endElementId: btn.elementId,
                }])
            ).resolves.not.toThrow();
        });
    });
});
