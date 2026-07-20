import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser } from 'webdriverio';
import { createCalculatorSession, quitSession, resetCalculator } from './helpers/session.js';

const OUTPUT_DIR = resolve(process.cwd(), 'test', 'e2e', 'output');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'annotated-debug.png');

describe('windows: findByVision includeAnnotatedImage', () => {
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

    it('returns a valid annotated PNG, writes it to disk, and clicking the resolved coordinates hits the right element', async () => {
        const result = await calc.executeScript('windows: findByVision', [
            { prompt: 'the number 7 button on the calculator keypad', model: 'gpt-4o', includeAnnotatedImage: true },
        ]) as { x: number; y: number; label: string; annotatedImageBase64?: string };

        expect(typeof result.annotatedImageBase64).toBe('string');
        expect(result.annotatedImageBase64!.length).toBeGreaterThan(0);

        const buffer = Buffer.from(result.annotatedImageBase64!, 'base64');

        // Decode header/dimensions rather than just checking it's a non-empty string —
        // proves the round-trip actually produced a real, well-formed PNG.
        const decoded = PNG.sync.read(buffer);
        expect(decoded.width).toBeGreaterThan(0);
        expect(decoded.height).toBeGreaterThan(0);

        mkdirSync(OUTPUT_DIR, { recursive: true });
        writeFileSync(OUTPUT_PATH, buffer);

        // Proves the resolved mark is the *correct* one, not just any detected contour —
        // clicking it must actually register on the "7" button, not a neighboring key.
        await calc.executeScript('windows: click', [{ x: result.x, y: result.y }]);

        const display = await calc.$('~CalculatorResults');
        expect(await display.getText()).toContain('7');
    });
});
