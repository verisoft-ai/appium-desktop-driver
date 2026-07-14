import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { closeAllTestApps, createCalculatorSession, createNotepadSession, createRootSession, getNotepadTextArea, quitSession } from './helpers/session.js';

describe('Window and app management commands', () => {
    let calc: Browser;
    let root: Browser;
    let notepad: Browser;

    beforeAll(async () => {
        calc = await createCalculatorSession();
        notepad = await createNotepadSession();
        root = await createRootSession();
    });

    afterAll(async () => {
        await quitSession(calc);
        await quitSession(notepad);
        await quitSession(root);
        closeAllTestApps();
    });

    describe('getWindowHandle', () => {
        it('returns a hex window handle string matching 0x format', async () => {
            const handle = await calc.getWindowHandle();
            expect(handle).toMatch(/^0x[0-9a-fA-F]+$/);
        });

        it('returns the same handle on repeated calls', async () => {
            const first = await calc.getWindowHandle();
            const second = await calc.getWindowHandle();
            expect(first).toBe(second);
        });
    });

    describe('getWindowHandles', () => {
        it('(app session) returns an array of at least one handle', async () => {
            const handles = await calc.getWindowHandles();
            expect(Array.isArray(handles)).toBe(true);
            expect(handles.length).toBeGreaterThanOrEqual(1);
        });

        it('(app session) all returned handles match the 0x hex format', async () => {
            const handles = await calc.getWindowHandles();
            for (const h of handles) {
                expect(h).toMatch(/^0x[0-9a-fA-F]{8}$/);
            }
        });

        it('(root session) returns an array of at least one window handle', async () => {
            const handles = await root.getWindowHandles();
            expect(Array.isArray(handles)).toBe(true);
            expect(handles.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('getWindowRect', () => {
        it('returns a rect with positive width and height', async () => {
            const rect = await calc.getWindowRect();
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
        });

        it('returns numeric x and y coordinates', async () => {
            const rect = await calc.getWindowRect();
            expect(typeof rect.x).toBe('number');
            expect(typeof rect.y).toBe('number');
        });
    });

    describe('setWindow', () => {
        it('switches to a window by handle and getWindowHandle reflects it', async () => {
            const calcHandle = await calc.getWindowHandle();
            await calc.switchToWindow(calcHandle);
            const current = await calc.getWindowHandle();
            expect(current).toBe(calcHandle);
        });

        it('throws NoSuchWindowError for an unknown handle', async () => {
            await expect(calc.switchToWindow('0xDEADBEEF')).rejects.toThrow();
        });

        it('switches between two different windows and elements are accessible in each', async () => {
            const calcHandle = await calc.getWindowHandle();
            const notepadHandle = await notepad.getWindowHandle();

            await root.switchToWindow(calcHandle);
            const calcResults = await root.$('~CalculatorResults');
            await expect(calcResults.isExisting()).resolves.toBe(true);

            await root.switchToWindow(notepadHandle);
            const notepadArea = await getNotepadTextArea(root);
            await expect(notepadArea.isExisting()).resolves.toBe(true);

            await root.switchToWindow(calcHandle);
            const calcResultsAgain = await root.$('~CalculatorResults');
            await expect(calcResultsAgain.isExisting()).resolves.toBe(true);
        });
    });

    describe('switchToWindowByTitle', () => {
        it('switches to a window by partial title (substring match)', async () => {
            await root.executeScript('windows: switchToWindowByTitle', [{ title: 'Calculator' }]);
            const title = await root.getTitle();
            expect(title).toContain('Calculator');
        });

        it('switches to a different window by partial title', async () => {
            await root.executeScript('windows: switchToWindowByTitle', [{ title: 'Notepad' }]);
            const title = await root.getTitle();
            expect(title).toContain('Notepad');
        });

        it('match is case-insensitive', async () => {
            await root.executeScript('windows: switchToWindowByTitle', [{ title: 'calculator' }]);
            const title = await root.getTitle();
            expect(title).toContain('Calculator');
        });

        it('switches back and elements are accessible in each window', async () => {
            await root.executeScript('windows: switchToWindowByTitle', [{ title: 'Calculator' }]);
            const calcResults = await root.$('~CalculatorResults');
            await expect(calcResults.isExisting()).resolves.toBe(true);

            await root.executeScript('windows: switchToWindowByTitle', [{ title: 'Notepad' }]);
            const notepadArea = await getNotepadTextArea(root);
            await expect(notepadArea.isExisting()).resolves.toBe(true);
        });

        it('exact match succeeds when title matches fully (case-insensitive)', async () => {
            const fullTitle = await calc.getTitle();
            await root.executeScript('windows: switchToWindowByTitle', [{ title: fullTitle, exact: true }]);
            const current = await root.getTitle();
            expect(current).toBe(fullTitle);
        });

        it('throws NoSuchWindowError for a title that matches nothing', async () => {
            await expect(
                root.executeScript('windows: switchToWindowByTitle', [{ title: 'xXNonExistentWindowXx' }])
            ).rejects.toThrow();
        });
    });

    describe('windows: getWindows', () => {
        it('returns array of objects with handle, title, className fields', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            expect(Array.isArray(windows)).toBe(true);
            expect(windows.length).toBeGreaterThan(0);
            for (const w of windows) {
                expect(w.handle).toMatch(/^0x[0-9a-fA-F]{8}$/);
                expect(typeof w.title).toBe('string');
                expect(typeof w.className).toBe('string');
            }
        });

        it('Calculator window appears with non-empty title and className', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            const calcWindow = windows.find((w) => w.title.toLowerCase().includes('calculator'));
            expect(calcWindow).toBeDefined();
            expect(calcWindow!.className.length).toBeGreaterThan(0);
        });

        it('Notepad window appears with non-empty title and className', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            const notepadWindow = windows.find((w) => w.title.toLowerCase().includes('notepad'));
            expect(notepadWindow).toBeDefined();
            expect(notepadWindow!.className.length).toBeGreaterThan(0);
        });

        it('switching to Calculator by handle from windows: getWindows gives access to CalculatorResults', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            const calcWindow = windows.find((w) => w.title.toLowerCase().includes('calculator'));
            expect(calcWindow).toBeDefined();
            await root.switchToWindow(calcWindow!.handle);
            const results = await root.$('~CalculatorResults');
            expect(await results.isExisting()).toBe(true);
        });

        it('switching to Notepad by handle from windows: getWindows gives access to text area', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            const notepadWindow = windows.find((w) => w.title.toLowerCase().includes('notepad'));
            expect(notepadWindow).toBeDefined();
            await root.switchToWindow(notepadWindow!.handle);
            const textArea = await getNotepadTextArea(root);
            expect(await textArea.isExisting()).toBe(true);
        });

        it('includes windows with empty title (untitled windows are not filtered out)', async () => {
            const windows = await root.executeScript('windows: getWindows', []) as Array<{ handle: string; title: string; className: string }>;
            // getWindowHandles only returns titled windows — getWindows should return >= that count
            const titledHandles = await root.getWindowHandles();
            expect(windows.length).toBeGreaterThanOrEqual(titledHandles.length);
        });
    });

    describe('getPageSource', () => {
        it('returns a non-empty XML string', async () => {
            const source = await calc.getPageSource();
            expect(typeof source).toBe('string');
            expect(source.length).toBeGreaterThan(0);
        });

        it('XML contains Button elements for the Calculator', async () => {
            const source = await calc.getPageSource();
            expect(source).toContain('Button');
        });

        it('XML contains CalculatorResults AutomationId', async () => {
            const source = await calc.getPageSource();
            expect(source).toContain('CalculatorResults');
        });
    });

    describe('getScreenshot', () => {
        it('returns a non-empty base64 string', async () => {
            const screenshot = await calc.takeScreenshot();
            expect(typeof screenshot).toBe('string');
            expect(screenshot.length).toBeGreaterThan(0);
        });

        it('decoded bytes start with PNG magic bytes', async () => {
            const screenshot = await calc.takeScreenshot();
            const buffer = Buffer.from(screenshot, 'base64');
            // PNG magic: 89 50 4E 47
            expect(buffer[0]).toBe(0x89);
            expect(buffer[1]).toBe(0x50); // P
            expect(buffer[2]).toBe(0x4e); // N
            expect(buffer[3]).toBe(0x47); // G
        });
    });
});
