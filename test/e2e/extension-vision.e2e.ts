import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import { createCalculatorSession, quitSession, resetCalculator } from './helpers/session.js';


describe('windows: findByVision command)', () => {
    let calc: Browser;

    beforeAll(async () => {
        calc = await createCalculatorSession();
    });

    afterAll(async () => {
        await quitSession(calc);
    });

    beforeEach(async () => {
        await resetCalculator(calc);
    });

    it('clicking the returned coordinates actually registers the click', async () => {
        // Ask vision to locate the "7" button, then click its coordinates and verify
        // the calculator display updates — this proves the coordinate math is correct.
        const { x, y } = await calc.executeScript('windows: findByVision', [
            { prompt: 'the number 7 button on the calculator keypad' },
        ]) as { x: number; y: number; label: string };

        await calc.executeScript('windows: click', [{ x, y }]);

        const display = await calc.$('~CalculatorResults');
        expect(await display.getText()).toContain('7');
    });

    it('returns {x, y, label} with screen coordinates for a visible element', async () => {
        const result = await calc.executeScript('windows: findByVision', [
            { prompt: 'the number 5 button on the calculator keypad' },
        ]) as { x: number; y: number; label: string };

        expect(typeof result.x).toBe('number');
        expect(typeof result.y).toBe('number');
        expect(typeof result.label).toBe('string');
        expect(result.x).toBeGreaterThan(0);
        expect(result.y).toBeGreaterThan(0);
        expect(result.label.length).toBeGreaterThan(0);
    });

    it('returns coordinates within screen bounds', async () => {
        const result = await calc.executeScript('windows: findByVision', [
            { prompt: 'the equals button' },
        ]) as { x: number; y: number; label: string };

        // Coordinates must be plausible screen pixel values (not negative, not absurdly large)
        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
        expect(result.x).toBeLessThan(10000);
        expect(result.y).toBeLessThan(10000);
    });

    it('throws when the requested element is not visible', async () => {
        await expect(
            calc.executeScript('windows: findByVision', [
                { prompt: 'a purple elephant in the calculator window' },
            ])
        ).rejects.toThrow();
    });

    it('accepts a custom model parameter without throwing', async () => {
        const result = await calc.executeScript('windows: findByVision', [
            {
                prompt: 'the clear button (C)',
                model: 'claude-haiku-4-5-20251001',
            },
        ]) as { x: number; y: number; label: string };

        expect(result.x).toBeGreaterThan(0);
        expect(result.y).toBeGreaterThan(0);
    });
});
