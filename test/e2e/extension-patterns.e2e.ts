import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    createCalculatorSession,
    createNotepadSession,
    createTodoSession,
    createExplorerSession,
    createCharmapSession,
    getNotepadTextArea,
    quitSession,
    resetCalculator,
    clearNotepad,
    createTodoTask,
    deleteTasks,
} from './helpers/session.js';

describe('windows: pattern extension commands', () => {
    let calc: Browser;
    let notepad: Browser;
    let todo: Browser;

    // beforeAll(async () => {
    //     calc = await createCalculatorSession();
    //     notepad = await createNotepadSession();
    // });

    // afterAll(async () => {
    //     await quitSession(calc);
    //     await quitSession(notepad);
    // });

    describe('windows: invoke', () => {

        beforeAll(async () => {
            calc = await createCalculatorSession();
        });

        afterAll(async () => {
            await quitSession(calc);
        });

        afterEach(async () => {
            await resetCalculator(calc);
        });

        it('invokes the One button and result display shows 1', async () => {
            const oneBtn = await calc.$('~num1Button');
            await calc.executeScript('windows: invoke', [oneBtn]);
            const display = await calc.$('~CalculatorResults');

            await calc.waitUntil(
                async () => (await display.getText()).includes('1'),
                { timeoutMsg: 'CalculatorResults did not show 1 after invoking One' }
            );
        });

        it('invokes the Equals button and result display shows the sum', async () => {
            await (calc.$('~num2Button')).click();
            await (calc.$('~plusButton')).click();
            await (calc.$('~num3Button')).click();
            const equalsBtn = await calc.$('~equalButton');
            await calc.executeScript('windows: invoke', [equalsBtn]);

            const display = await calc.$('~CalculatorResults');
            await calc.waitUntil(
                async () => (await display.getText()).includes('5'),
                { timeoutMsg: 'CalculatorResults did not show 5 after invoking Equals' }
            );
        });
    });

    describe('windows: maximize / minimize / restore', () => {
        beforeAll(async () => {
            calc = await createCalculatorSession();
        });

        afterAll(async () => {
            await quitSession(calc);
        });

        afterEach(async function restoreWindow() {
            // Always restore to a known state
            try {
                await resetCalculator(calc);
                const windowEl = await calc.executeScript('windows: getWindowElement', []);
                await calc.executeScript('windows: restore', [windowEl]);
            } catch {
                // noop
            }
        });

        it('maximizes the Calculator window and its rect grows', async () => {
            const windowEl = await calc.executeScript('windows: getWindowElement', []);
            // Ensure a known-normal baseline — if the window is already maximized
            // (e.g. carried over from a prior run), the rect can't grow further.
            await calc.executeScript('windows: restore', [windowEl]);
            const rectBefore = await calc.getWindowRect();

            await calc.executeScript('windows: maximize', [windowEl]);

            await calc.waitUntil(
                async () => {
                    const rect = await calc.getWindowRect();
                    return rect.width > rectBefore.width || rect.height > rectBefore.height;
                },
                { timeoutMsg: 'Calculator window rect did not grow after maximize' }
            );
        });

        it('minimizes then restores the Calculator window', async () => {
            const windowEl = await calc.executeScript('windows: getWindowElement', []);
            await calc.executeScript('windows: minimize', [windowEl]);
            await calc.executeScript('windows: restore', [windowEl]);
            // Window should be accessible again
            const display = await calc.$('~CalculatorResults');
            expect(await display.isExisting()).toBe(true);
        });

        it('restore on an already-normal window is a no-op: rect is unchanged', async () => {
            const windowEl = await calc.executeScript('windows: getWindowElement', []);
            const rectBefore = await calc.getWindowRect();

            await calc.executeScript('windows: restore', [windowEl]);

            const rectAfter = await calc.getWindowRect();
            expect(rectAfter).toEqual(rectBefore);
        });
    });

    describe('windows: setFocus', () => {
        beforeAll(async () => {
            calc = await createCalculatorSession();
        });

        afterAll(async () => {
            await quitSession(calc);
        });

        afterEach(async () => {
            await resetCalculator(calc);
        });

        it('sets focus on the result display element: HasKeyboardFocus becomes true', async () => {
            // Move focus elsewhere first so the check proves setFocus did something
            const clearBtn = await calc.$('~clearButton');
            await clearBtn.click();

            const display = await calc.$('~CalculatorResults');
            await calc.executeScript('windows: setFocus', [display]);

            await calc.waitUntil(
                async () => {
                    const focused = await display.getAttribute('HasKeyboardFocus');
                    return String(focused).toLowerCase() === 'true';
                },
                { timeoutMsg: 'CalculatorResults did not receive keyboard focus after setFocus' }
            );
        });
    });

    describe('windows: scrollIntoView', () => {
        let charmap: Browser;

        beforeAll(async () => {
            charmap = await createCharmapSession();
        });

        afterAll(async () => {
            await quitSession(charmap);
        });

        it('scrolls an off-screen font list item into view: IsOffscreen flips to false', async () => {
            const comboBox = await charmap.$('~105');
            await charmap.executeScript('windows: expand', [comboBox]);
            await charmap.pause(200);

            const items = await charmap.$$('//ListItem').getElements();
            expect(items.length).toBeGreaterThan(20);

            // Pick an item far enough down the list that the combo's viewport
            // doesn't already show it.
            const target = items[items.length - 1];
            const wasOffscreen = await target.getAttribute('IsOffscreen');
            expect(String(wasOffscreen).toLowerCase()).toBe('true');

            await charmap.executeScript('windows: scrollIntoView', [target]);
            await charmap.waitUntil(
                async () => {
                    const isOffscreen = await target.getAttribute('IsOffscreen');
                    return String(isOffscreen).toLowerCase() === 'false';
                },
                { timeoutMsg: 'target list item was still off-screen after scrollIntoView' }
            );
        });
    });

    describe('windows: setValue / getValue (ValuePattern)', () => {
        beforeAll(async () => {
            notepad = await createNotepadSession();
            await clearNotepad(notepad);
        });

        afterAll(async () => {
            await quitSession(notepad);
        });

        it('sets a value using ValuePattern and getValue returns it', async () => {
            const textArea = await getNotepadTextArea(notepad);
            await notepad.executeScript('windows: setValue', [textArea, 'pattern value test']);
            const result = await notepad.executeScript('windows: getValue', [textArea]);
            expect(result).toContain('pattern value test');
        });
    });

    describe('windows: expand / collapse', () => {
        let explorer: Browser;

        beforeAll(async () => {
            explorer = await createExplorerSession();
        });

        afterAll(async () => {
            await quitSession(explorer);
        });

        it('expands This PC and child drives become visible', async () => {
            const thisPC = await explorer.$('//TreeItem[@Name="This PC"]');
            await explorer.executeScript('windows: collapse', [thisPC]);
            await explorer.pause(300);

            await explorer.executeScript('windows: expand', [thisPC]);
            await explorer.pause(300);

            const children = await explorer.$$('//TreeItem[@Name="This PC"]/TreeItem');
            expect(children.length).toBeGreaterThan(0);
        });

        it('collapses This PC and child drives are no longer visible', async () => {
            const thisPC = await explorer.$('//TreeItem[@Name="This PC"]');
            await explorer.executeScript('windows: expand', [thisPC]);
            await explorer.pause(300);

            await explorer.executeScript('windows: collapse', [thisPC]);
            await explorer.pause(300);

            const children = await explorer.$$('//TreeItem[@Name="This PC"]/TreeItem');
            expect(children.length).toBe(0);
        });
    });

    describe('windows: expand / collapse (ComboBox)', () => {
        let charmap: Browser;

        beforeAll(async () => {
            charmap = await createCharmapSession();
        });

        afterAll(async () => {
            await quitSession(charmap);
        });

        it('expands the font ComboBox: ExpandCollapseState becomes Expanded', async () => {
            const comboBox = await charmap.$('~105');
            await charmap.executeScript('windows: expand', [comboBox]);

            await charmap.waitUntil(
                async () => {
                    const state = await comboBox.getAttribute('ExpandCollapseState');
                    return state === 'Expanded' || state === 'PartiallyExpanded';
                },
                { timeoutMsg: 'font ComboBox did not report Expanded state' }
            );
        });

        it('collapses the font ComboBox: ExpandCollapseState becomes Collapsed', async () => {
            const comboBox = await charmap.$('~105');
            await charmap.executeScript('windows: expand', [comboBox]);
            await charmap.waitUntil(
                async () => {
                    const state = await comboBox.getAttribute('ExpandCollapseState');
                    return state === 'Expanded' || state === 'PartiallyExpanded';
                },
                { timeoutMsg: 'font ComboBox did not report Expanded state before collapsing' }
            );

            await charmap.executeScript('windows: collapse', [comboBox]);

            await charmap.waitUntil(
                async () => (await comboBox.getAttribute('ExpandCollapseState')) === 'Collapsed',
                { timeoutMsg: 'font ComboBox did not report Collapsed state' }
            );
        });

        it('selects a font from the expanded ComboBox and its value updates', async () => {
            const comboBox = await charmap.$('~105');
            await charmap.executeScript('windows: expand', [comboBox]);
            await charmap.pause(200);

            const items = await charmap.$$('//ListItem');
            expect(items.length).toBeGreaterThan(0);

            const item = items[0];
            const fontName = await item.getAttribute('Name');

            await expect(
                charmap.executeScript('windows: select', [item])
            ).resolves.not.toThrow();

            await charmap.pause(200);
            const value = await charmap.executeScript('windows: getValue', [comboBox]);
            expect(value).toContain(fontName);
        });
    });

    describe('windows: select / allSelectedItems / isMultiple / toggle', () => {
        beforeAll(async () => {
            todo = await createTodoSession();
            await createTodoTask(todo, 'First task');
            await createTodoTask(todo, 'Second task');
        });

        afterAll(async () => {
            await deleteTasks(todo);
            await quitSession(todo);
        });

        it('toggles a task checkbox in To-Do', async () => {
            const checkbox = await todo.$('~CompleteTodoCheckBox');
            await expect(
                todo.executeScript('windows: toggle', [checkbox])
            ).resolves.not.toThrow();
        });

        it('select selects a task item in the To-Do list', async () => {
            const item = await todo.$('//Custom/Group/List/ListItem[1]');
            await expect(
                todo.executeScript('windows: select', [item])
            ).resolves.not.toThrow();
        });

        it('isMultiple returns a boolean for the To-Do task list container', async () => {
            const list = await todo.$('~TodosListView');
            const result = await todo.executeScript('windows: isMultiple', [list]);
            expect(typeof result).toBe('boolean');
        });

        it('allSelectedItems returns an array for the To-Do task list container', async () => {
            const list = await todo.$('~TodosListView');
            const result = await todo.executeScript('windows: allSelectedItems', [list]);
            expect(Array.isArray(result)).toBe(true);
        });
    });
});
