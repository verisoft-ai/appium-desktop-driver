import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    createCalculatorSession,
    createNotepadSession,
    getNotepadTextArea,
    quitSession,
    resetCalculator,
    clearNotepad,
    calcResults,
    calcNumBtn,
    calcEqualBtn,
    calcPlusBtn,
    calcTogglePane,
    calcStandardMode,
} from './helpers/session.js';

describe('W3C element commands', () => {
    let calc: Browser;
    let notepad: Browser;

    beforeAll(async () => {
        calc = await createCalculatorSession();
        notepad = await createNotepadSession();
    });

    afterAll(async () => {
        await quitSession(calc);
        await quitSession(notepad);
    });

    beforeEach(async () => {
        await resetCalculator(calc);
    });

    describe('getProperty / getAttribute', () => {
        it('gets the Name property of the result display element', async () => {
            const name = await (await calcResults(calc)).getAttribute('Name');
            expect(name).toBeTruthy();
        });

        it('gets the AutomationId property of a button', async () => {
            const automationId = await (await calcNumBtn(calc, 1)).getAttribute('AutomationId');
            expect(automationId).toBeTruthy();
        });

        it('gets the IsEnabled property of a button', async () => {
            const isEnabled = await (await calcEqualBtn(calc)).getAttribute('IsEnabled');
            expect(isEnabled).toBeTruthy();
        });

        it('gets the ControlType property of a button', async () => {
            const controlType = await (await calcNumBtn(calc, 1)).getAttribute('ControlType');
            expect(controlType).toBeTruthy();
        });
    });

    describe('getText', () => {
        it('returns text content of the result display after pressing a digit', async () => {
            await (await calcNumBtn(calc, 5)).click();
            const text = await (await calcResults(calc)).getText();
            expect(text).toContain('5');
        });

        it('returns a string for an element', async () => {
            const text = await (await calcNumBtn(calc, 1)).getText();
            expect(typeof text).toBe('string');
        });
    });

    describe('getName', () => {
        it('returns the control type name for a Button element', async () => {
            const name = await (await calcNumBtn(calc, 1)).getTagName();
            expect(name).toBeTruthy();
        });
    });

    describe('getElementRect', () => {
        it('returns a rect with positive width and height for a visible button', async () => {
            const rect = await (await calcNumBtn(calc, 1)).getSize();
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
        });

        it('returns x and y coordinates', async () => {
            const location = await (await calcNumBtn(calc, 1)).getLocation();
            expect(typeof location.x).toBe('number');
            expect(typeof location.y).toBe('number');
        });
    });

    describe('elementDisplayed', () => {
        it('returns true for a visible button', async () => {
            expect(await (await calcNumBtn(calc, 1)).isDisplayed()).toBe(true);
        });
    });

    describe('elementEnabled', () => {
        it('returns true for an enabled button', async () => {
            expect(await (await calcEqualBtn(calc)).isEnabled()).toBe(true);
        });
    });

    describe('elementSelected', () => {
        it('returns true for the active navigation mode item (Standard)', async () => {
            await (await calcTogglePane(calc)).click();
            try {
                expect(await (await calcStandardMode(calc)).isSelected()).toBe(true);
            } finally {
                await (await calcTogglePane(calc)).click();
            }
        });
    });

    describe('active', () => {
        it('returns the currently focused element after clicking a button', async () => {
            await (await calcNumBtn(calc, 3)).click();
            const active = await calc.getActiveElement();
            expect(active).toBeDefined();
        });
    });

    describe('click', () => {
        it('clicking digit buttons produces the expected result in the display', async () => {
            await (await calcNumBtn(calc, 7)).click();
            const text = await (await calcResults(calc)).getText();
            expect(text).toContain('7');
        });

        it('performs addition: 1 + 1 = 2', async () => {
            await (await calcNumBtn(calc, 1)).click();
            await (await calcPlusBtn(calc)).click();
            await (await calcNumBtn(calc, 1)).click();
            await (await calcEqualBtn(calc)).click();
            const text = await (await calcResults(calc)).getText();
            expect(text).toContain('2');
        });
    });

    describe('setValue and clear', () => {
        beforeEach(async () => {
            await clearNotepad(notepad);
        });

        it('sets a value in Notepad text area and getText returns it', async () => {
            const textArea = await getNotepadTextArea(notepad);
            await textArea.setValue('Hello World');
            const text = await textArea.getText();
            expect(text).toContain('Hello World');
        });

        it('clear empties the Notepad text area', async () => {
            const textArea = await getNotepadTextArea(notepad);
            await textArea.setValue('some text');
            await textArea.clearValue();
            const text = await textArea.getText();
            expect(text.trim()).toBe('');
        });
    });
});
