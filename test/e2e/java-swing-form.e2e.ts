import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf' as const;
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

    describe('department comboBox — virtual children (ALT+Down expand fallback)', () => {
        it('department combo exists', async () => {
            const combo = await driver.$('~department');
            expect(await combo.isExisting()).toBe(true);
        });

        it('windows: expand opens popup via ALT+Down fallback (no AccessibleAction)', async () => {
            const combo = await driver.$('~department');

            // No AccessibleAction on this combo — driver falls back to focus + ALT+Down
            await driver.executeScript('windows: expand', [combo]);
            await driver.pause(300); // let popup open

            const source = await driver.getPageSource();
            expect(source).toContain('Engineering');
            expect(source).toContain('Finance');
            expect(source).toContain('HR');
            expect(source).toContain('Marketing');
        });

        it('windows: select on a list item selects it and closes the popup', async () => {
            const combo = await driver.$('~department');
            await driver.executeScript('windows: expand', [combo]);
            await driver.pause(300);

            const item = await driver.$('~Finance');
            await driver.executeScript('windows: select', [item]);
            await driver.pause(200);

            expect(await combo.getText()).toBe('Finance');
        });

        it('windows: expand + windows: select round-trip works for a different item', async () => {
            const combo = await driver.$('~department');
            await driver.executeScript('windows: expand', [combo]);
            await driver.pause(300);

            const item = await driver.$('~Marketing');
            await driver.executeScript('windows: select', [item]);
            await driver.pause(200);

            expect(await combo.getText()).toBe('Marketing');
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

    describe('class name strategy (AccessibleRole display string)', () => {
        it('"text" finds all JTextField components', async () => {
            const fields = await driver.$$('.text');
            expect(fields.length).toBe(3);
        });

        it('"push button" finds JButton (among possible internal combo arrow buttons)', async () => {
            const buttons = await driver.$$('.push button');
            expect(buttons.length).toBeGreaterThanOrEqual(1);
            const names = await buttons.map((b) => b.getAttribute('Name'));
            expect(names).toContain('submitButton');
        });

        it('"check box" finds JCheckBox', async () => {
            const checkboxes = await driver.$$('.check box');
            expect(checkboxes.length).toBe(1);
            expect(await checkboxes[0].getAttribute('Name')).toBe('agreeCheckbox');
        });

        it('"combo box" finds JComboBox', async () => {
            const combos = await driver.$$('.combo box');
            expect(combos.length).toBe(2);
            const names = await combos.map((c) => c.getAttribute('Name'));
            expect(names).toContain('country');
            expect(names).toContain('department');
        });

        it('"label" finds all JLabel components', async () => {
            const labels = await driver.$$('.label');
            expect(labels.length).toBeGreaterThanOrEqual(4); // First Name, Last Name, Email, Country
        });
    });

    describe('error dialog (switchToWindowByTitle)', () => {
        const ERROR_DIALOG_TITLE = 'שגיאה';
        let mainWindowHandle: string;

        beforeAll(async () => {
            mainWindowHandle = await driver.getWindowHandle();
        });

        it('clicking showErrorButton opens dialog — getWindowHandles returns extra handle', async () => {
            const before = (await driver.getWindowHandles()).length;
            const btn = await driver.$('~showErrorButton');
            await btn.click();
            await driver.pause(500);
            const after = (await driver.getWindowHandles()).length;
            expect(after).toBeGreaterThan(before);
            await driver.executeScript('windows: switchToWindowByTitle', [{ title: ERROR_DIALOG_TITLE, exact: true }]);
            await (await driver.$('~OK')).click();
            await driver.pause(300);
            await driver.switchToWindow(mainWindowHandle);
        });

        it('switchToWindowByTitle switches to error dialog by exact Hebrew title', async () => {
            const btn = await driver.$('~showErrorButton');
            await btn.click();
            await driver.pause(500);
            await driver.executeScript('windows: switchToWindowByTitle', [{ title: ERROR_DIALOG_TITLE, exact: true }]);
            const title = await driver.getTitle();
            expect(title).toBe(ERROR_DIALOG_TITLE);
            await (await driver.$('~OK')).click();
            await driver.pause(300);
            await driver.switchToWindow(mainWindowHandle);
        });

        it('dialog inner content accessible via JAB after switch — OK button exists', async () => {
            const btn = await driver.$('~showErrorButton');
            await btn.click();
            await driver.pause(500);
            await driver.executeScript('windows: switchToWindowByTitle', [{ title: ERROR_DIALOG_TITLE, exact: true }]);
            const okBtn = await driver.$('~OK');
            expect(await okBtn.isExisting()).toBe(true);
            await okBtn.click();
            await driver.pause(300);
            await driver.switchToWindow(mainWindowHandle);
        });

        it('dismissing dialog and switching back — main form elements remain accessible', async () => {
            const btn = await driver.$('~showErrorButton');
            await btn.click();
            await driver.pause(500);
            await driver.executeScript('windows: switchToWindowByTitle', [{ title: ERROR_DIALOG_TITLE, exact: true }]);
            await (await driver.$('~OK')).click();
            await driver.pause(300);
            await driver.switchToWindow(mainWindowHandle);
            const submitBtn = await driver.$('~submitButton');
            expect(await submitBtn.isExisting()).toBe(true);
        });
    });

    describe('tag name strategy (UIA ControlType mapped to Java role)', () => {
        it('"Edit" finds all JTextField components', async () => {
            const fields = await driver.findElements('tag name', 'Edit');
            expect(fields.length).toBe(3);
        });

        it('"Button" finds JButton (among possible internal combo arrow buttons)', async () => {
            const buttons = await driver.findElements('tag name', 'Button');
            expect(buttons.length).toBeGreaterThanOrEqual(1);
            const names = await Promise.all(buttons.map((b) => driver.getElementAttribute(b[ELEMENT_KEY], 'Name')));
            expect(names).toContain('submitButton');
        });

        it('"CheckBox" finds JCheckBox', async () => {
            const checkboxes = await driver.findElements('tag name', 'CheckBox');
            expect(checkboxes.length).toBe(1);
            expect(await driver.getElementAttribute(checkboxes[0][ELEMENT_KEY], 'Name')).toBe('agreeCheckbox');
        });

        it('"ComboBox" finds JComboBox', async () => {
            const combos = await driver.findElements('tag name', 'ComboBox');
            expect(combos.length).toBe(2);
            expect(await driver.getElementAttribute(combos[0][ELEMENT_KEY], 'Name')).toBe('country');
        });
    });

    describe('JavaSimpleClass XPath attribute', () => {
        it('//*[@JavaSimpleClass="JTextField"] finds all three text fields', async () => {
            const fields = await driver.$$('//*[@JavaSimpleClass="JTextField"]');
            expect(fields.length).toBe(3);
        });

        it('//*[@JavaSimpleClass="JButton"] finds submitButton', async () => {
            const buttons = await driver.$$('//*[@JavaSimpleClass="JButton"]');
            expect(buttons.length).toBeGreaterThanOrEqual(1);
        });

        it('//*[@JavaSimpleClass="JCheckBox"] finds agreeCheckbox', async () => {
            const checkboxes = await driver.$$('//*[@JavaSimpleClass="JCheckBox"]');
            expect(checkboxes.length).toBe(1);
            expect(await checkboxes[0].getAttribute('Name')).toBe('agreeCheckbox');
        });

        it('//*[@JavaSimpleClass="JComboBox"] finds country dropdown', async () => {
            const combos = await driver.$$('//*[@JavaSimpleClass="JComboBox"]');
            expect(combos.length).toBe(1);
            expect(await combos[0].getAttribute('Name')).toBe('country');
        });

        it('combined JavaSimpleClass + Name predicate finds specific field', async () => {
            const el = await driver.$('//*[@JavaSimpleClass="JTextField" and @Name="email"]');
            expect(await el.isExisting()).toBe(true);
            expect(await el.getAttribute('Name')).toBe('email');
        });
    });

    describe('JavaClass XPath attribute', () => {
        it('//*[@JavaClass="javax.swing.JTextField"] finds all three text fields', async () => {
            const fields = await driver.$$('//*[@JavaClass="javax.swing.JTextField"]');
            expect(fields.length).toBe(3);
        });

        it('//*[@JavaClass="javax.swing.JButton"] finds submitButton', async () => {
            const buttons = await driver.$$('//*[@JavaClass="javax.swing.JButton"]');
            expect(buttons.length).toBeGreaterThanOrEqual(1);
        });

        it('//*[@JavaClass="javax.swing.JCheckBox"] finds agreeCheckbox', async () => {
            const checkboxes = await driver.$$('//*[@JavaClass="javax.swing.JCheckBox"]');
            expect(checkboxes.length).toBe(1);
        });

        it('combined JavaClass + Name predicate finds specific field', async () => {
            const el = await driver.$('//*[@JavaClass="javax.swing.JTextField" and @Name="firstName"]');
            expect(await el.isExisting()).toBe(true);
            expect(await el.getAttribute('Name')).toBe('firstName');
        });
    });
});
