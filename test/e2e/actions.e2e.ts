import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import {
    createCalculatorSession,
    createNotepadSession,
    getNotepadTextArea,
    quitSession,
    resetCalculator,
    clearNotepad,
} from './helpers/session.js';

describe('W3C Actions API', () => {
    let calc: Browser;
    let notepad: Browser;

    beforeAll(async () => {
        calc = await createCalculatorSession();
    });

    afterAll(async () => {
        await quitSession(calc);
    });

    beforeEach(async () => {
        await resetCalculator(calc);
    });

    describe('key actions (keyDown / keyUp / pause)', () => {
        it('types a digit into Calculator via keyDown/keyUp sequence', async () => {
            await calc.action('key')
                .down('6')
                .up('6')
                .perform();
            const display = await calc.$('~CalculatorResults');
            expect(await display.getText()).toContain('6');
        });

        it('holds Shift then types a letter in Notepad to produce uppercase', async () => {
            notepad = await createNotepadSession();
            await clearNotepad(notepad);
            const textArea = await getNotepadTextArea(notepad);
            await textArea.click();
            await notepad.action('key')
                .down('\uE008') // Shift key
                .down('b')
                .up('b')
                .up('\uE008')
                .perform();
            const text = await textArea.getText();
            expect(text).toContain('B');
            await notepad.keys(['\uE003']); // delete 'B' so Notepad closes without a save prompt
            await quitSession(notepad);
        });

        it('pause action in key sequence does not throw', async () => {
            await expect(
                calc.action('key')
                    .down('1')
                    .pause(100)
                    .up('1')
                    .perform()
            ).resolves.not.toThrow();
        });

        it('null key (\\uE000) releases all held modifiers without error', async () => {
            await expect(
                calc.action('key')
                    .down('\uE008') // Shift
                    .down('\uE000') // Null — releases all
                    .perform()
            ).resolves.not.toThrow();
        });
    });

    describe('pointer actions (mouse)', () => {
        it('moves to a button center and clicks via pointer sequence', async () => {
            const btn = await calc.$('~num4Button');
            const loc = await btn.getLocation();
            const size = await btn.getSize();
            const cx = Math.round(loc.x + size.width / 2);
            const cy = Math.round(loc.y + size.height / 2);

            await calc.action('pointer')
                .move({ x: cx, y: cy })
                .down()
                .up()
                .perform();

            const display = await calc.$('~CalculatorResults');
            expect(await display.getText()).toContain('4');
        });

        it('performs a double-click via two down/up cycles', async () => {
            const btn = await calc.$('~num5Button');
            await calc.action('pointer')
                .move({ origin: btn })
                .down()
                .up()
                .down()
                .up()
                .perform();

            const display = await calc.$('~CalculatorResults');
            expect(await display.getText()).toContain('55');

        });

        it('right-click using button: 2 in pointer down', async () => {
            const btn = await calc.$('~num1Button');
            await expect(
                calc.action('pointer')
                    .move({ origin: btn })
                    .down({ button: 2 })
                    .up({ button: 2 })
                    .perform()
            ).resolves.not.toThrow();
        });

        it('drags from one button to another via pointerDown, pointerMove, pointerUp', async () => {
            const startBtn = await calc.$('~num1Button');
            const endBtn = await calc.$('~num2Button');
            await expect(
                calc.action('pointer')
                    .move({ origin: startBtn })
                    .down()
                    .move({ origin: endBtn, duration: 300 })
                    .up()
                    .perform()
            ).resolves.not.toThrow();
        });
    });

    describe('tick-based ordering across multiple input sources', () => {
        let notepad: Browser;

        beforeAll(async () => {
            notepad = await createNotepadSession();
        });

        afterAll(async () => {
            await quitSession(notepad);
        });

        beforeEach(async () => {
            await clearNotepad(notepad);
            const textArea = await getNotepadTextArea(notepad);
            await textArea.click();
        });

        it('Shift+Click selects text: Shift (key) is held across the pointer click tick', async () => {
            const textArea = await getNotepadTextArea(notepad);
            await textArea.setValue('hello');
            await notepad.keys(['\uE011']); // Home

            // key:     [down(Shift), pause,  up(Shift)]
            // pointer: [move,        down,   up       ]
            //                        ^-- tick 1: Shift still held when mouse goes down
            await notepad.actions([
                notepad.action('key').down('\uE008').pause(0).up('\uE008'),
                notepad.action('pointer').move({ origin: textArea, x: 200, y: 0 }).down().up(),
            ]);

            // Shift held during click selects "hello"; typing X replaces it
            await notepad.keys(['X']);
            expect((await textArea.getText()).trim()).toBe('X');
        });

        it('key + pointer: respect tick order', async () => {
            const textArea = await getNotepadTextArea(notepad);
            await textArea.setValue('hello');
            await notepad.keys(['\uE011']); // Home

            // key:     [down(Shift), pause,  up(Shift)]
            // pointer: [move,        down,   up       ]
            //                        ^-- tick 1: Shift still held when mouse goes down
            await notepad.actions([
                notepad.action('key').down('\uE008').pause(0).up('\uE008'),
                notepad.action('pointer').move({ origin: textArea, x: 200, y: 0 }).down().up(),
            ]);

            await notepad.keys(['X']);
            expect((await textArea.getText()).trim()).toBe('X');
        });

        it('wheel scroll moves the viewport: top and bottom are reachable by scrolling', async () => {
            const textArea = await getNotepadTextArea(notepad);
            const text = Array.from({ length: 40 }, (_, i) =>
                `Line_${String(i + 1).padStart(2, '0')}`
            ).join('\n');
            await textArea.setValue(text);

            const loc = await textArea.getLocation();
            const size = await textArea.getSize();
            const cx = Math.round(loc.x + size.width / 2);
            const cy = Math.round(loc.y + size.height / 2);

            // Step 2: scroll to the top; duration gives the viewport time to settle
            await notepad.actions([
                notepad.action('wheel').scroll({ x: cx, y: cy, deltaX: 0, deltaY: 1000, duration: 1000 }),
            ]);

            // Step 3: click the first visible line and mark it
            await notepad.action('pointer')
                .move({ x: cx, y: loc.y + 10 })
                .down().up()
                .perform();
            await notepad.keys(['\uE011']); // Home — go to start of line
            await notepad.keys(['T', 'O', 'P']);

            // Step 4: scroll to the bottom
            await notepad.actions([
                notepad.action('wheel').scroll({ x: cx, y: cy, deltaX: 0, deltaY: -1000, duration: 1000 }),
            ]);

            // Step 5: click the last visible line and mark it
            await notepad.action('pointer')
                .move({ x: cx, y: loc.y + size.height - 10 })
                .down().up()
                .perform();
            await notepad.keys(['\uE011']); // Home
            await notepad.keys(['B', 'O', 'T']);

            const result = await textArea.getText();
            const topPos = result.indexOf('TOP');
            const bottomPos = result.indexOf('BOT');

            // TOP marker must be near the start of the document
            expect(topPos).toBeLessThan(result.indexOf('Line_05'));
            // BOTTOM marker must be near the end of the document
            expect(bottomPos).toBeGreaterThan(result.indexOf('Line_35'));
        });
    });
});
