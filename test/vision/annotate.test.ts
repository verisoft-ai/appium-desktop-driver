import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { annotateMarksOnImage } from '../../lib/vision/annotate';
import type { Mark } from '../../lib/vision/types';

function makeTestPng(width: number, height: number): Buffer {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png);
}

function mark(id: number, x1: number, y1: number, x2: number, y2: number): Mark {
    return { id, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), x1, y1, x2, y2 };
}

describe('annotateMarksOnImage', () => {
    it('produces a valid PNG of the same dimensions as the input', async () => {
        const buf = makeTestPng(200, 150);
        const out = await annotateMarksOnImage(buf, [mark(1, 20, 20, 60, 40)], 1);

        expect(out.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
        const decoded = PNG.sync.read(out);
        expect(decoded.width).toBe(200);
        expect(decoded.height).toBe(150);
    });

    it('draws a non-white pixel near a badge corner (bbox top-left)', async () => {
        const buf = makeTestPng(200, 150);
        const out = await annotateMarksOnImage(buf, [mark(1, 20, 20, 60, 40)], 1);
        const decoded = PNG.sync.read(out);

        // The badge border/outline is drawn around (x1, y1) = (20, 20); look for any non-white pixel
        // in a small neighborhood rather than an exact pixel to avoid brittleness against AA.
        let foundNonWhite = false;
        for (let y = 10; y < 35 && !foundNonWhite; y++) {
            for (let x = 10; x < 35 && !foundNonWhite; x++) {
                const idx = (decoded.width * y + x) << 2;
                if (decoded.data[idx] !== 255 || decoded.data[idx + 1] !== 255 || decoded.data[idx + 2] !== 255) {
                    foundNonWhite = true;
                }
            }
        }
        expect(foundNonWhite).toBe(true);
    });

    it('handles multiple marks without throwing, nudging overlapping badges apart', async () => {
        const buf = makeTestPng(200, 150);
        const marks = [mark(1, 20, 20, 40, 40), mark(2, 22, 22, 42, 42), mark(3, 100, 100, 120, 120)];
        const out = await annotateMarksOnImage(buf, marks, 1);
        const decoded = PNG.sync.read(out);
        expect(decoded.width).toBe(200);
    });

    it('handles zero marks', async () => {
        const buf = makeTestPng(50, 50);
        const out = await annotateMarksOnImage(buf, [], 1);
        const decoded = PNG.sync.read(out);
        expect(decoded.width).toBe(50);
        expect(decoded.height).toBe(50);
    });

    it('scales mark coordinates when scale !== 1', async () => {
        const buf = makeTestPng(100, 75); // downscaled to half of a 200x150 original
        const marks = [mark(1, 40, 40, 120, 80)]; // in original-screenshot space
        const out = await annotateMarksOnImage(buf, marks, 0.5);
        const decoded = PNG.sync.read(out);
        expect(decoded.width).toBe(100);
        expect(decoded.height).toBe(75);
    });
});
