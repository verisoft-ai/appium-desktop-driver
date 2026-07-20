import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PNG } from 'pngjs';

interface FakeRect { x: number; y: number; width: number; height: number; }

let contourRects: FakeRect[] = [];

function makeFakeCv() {
    return {
        CV_8UC4: 96,
        COLOR_RGBA2GRAY: 11,
        MORPH_RECT: 0,
        RETR_LIST: 1,
        CHAIN_APPROX_SIMPLE: 2,
        Mat: class { delete() { /* noop */ } },
        MatVector: class {
            size() { return contourRects.length; }
            get(i: number) { return { rect: contourRects[i], delete() { /* noop */ } }; }
            delete() { /* noop */ }
        },
        Size: class { constructor(public w: number, public h: number) {} },
        matFromArray: vi.fn().mockReturnValue({ delete() { /* noop */ } }),
        cvtColor: vi.fn(),
        Canny: vi.fn(),
        dilate: vi.fn(),
        getStructuringElement: vi.fn().mockReturnValue({ delete() { /* noop */ } }),
        findContours: vi.fn(),
        boundingRect: vi.fn().mockImplementation((contour: { rect: FakeRect }) => contour.rect),
    };
}

vi.mock('@techstark/opencv-js', () => ({
    default: Promise.resolve(makeFakeCv()),
}));

import { detectCvMarks } from '../../lib/vision/cv-marks';

function makeTestPng(width: number, height: number): Buffer {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png);
}

describe('detectCvMarks', () => {
    beforeEach(() => {
        contourRects = [];
    });

    it('filters out boxes smaller than the minimum dimension', async () => {
        contourRects = [{ x: 0, y: 0, width: 5, height: 5 }, { x: 20, y: 20, width: 30, height: 30 }];
        const buf = makeTestPng(200, 200);
        const boxes = await detectCvMarks(buf, 200, 200, 50);
        expect(boxes).toEqual([{ x1: 20, y1: 20, x2: 50, y2: 50 }]);
    });

    it('filters out boxes covering most of the image (background/container regions)', async () => {
        contourRects = [
            { x: 0, y: 0, width: 190, height: 190 }, // covers >60% of a 200x200 image
            { x: 10, y: 10, width: 20, height: 20 },
        ];
        const buf = makeTestPng(200, 200);
        const boxes = await detectCvMarks(buf, 200, 200, 50);
        expect(boxes).toEqual([{ x1: 10, y1: 10, x2: 30, y2: 30 }]);
    });

    it('caps the number of returned boxes to maxCandidates, smallest first', async () => {
        contourRects = Array.from({ length: 5 }, (_, i) => ({ x: i * 20, y: 0, width: 12 + i * 2, height: 12 + i * 2 }));
        const buf = makeTestPng(300, 300);
        const boxes = await detectCvMarks(buf, 300, 300, 2);
        expect(boxes).toHaveLength(2);
        // sorted by area ascending: smallest boxes first
        const areas = boxes.map((b) => (b.x2 - b.x1) * (b.y2 - b.y1));
        expect(areas[0]).toBeLessThanOrEqual(areas[1]);
    });

    it('suppresses a box nearly fully contained in a larger box (IoMin dedup)', async () => {
        contourRects = [
            { x: 0, y: 0, width: 150, height: 40 }, // outer "button"
            { x: 10, y: 10, width: 12, height: 15 }, // inner "glyph", >80% contained
        ];
        const buf = makeTestPng(300, 300);
        const boxes = await detectCvMarks(buf, 300, 300, 50);
        expect(boxes).toEqual([{ x1: 0, y1: 0, x2: 150, y2: 40 }]);
    });

    it('keeps two separate non-overlapping boxes', async () => {
        contourRects = [
            { x: 0, y: 0, width: 20, height: 20 },
            { x: 100, y: 100, width: 20, height: 20 },
        ];
        const buf = makeTestPng(300, 300);
        const boxes = await detectCvMarks(buf, 300, 300, 50);
        expect(boxes).toHaveLength(2);
    });

    it('throws (does not silently degrade) when the decode step fails', async () => {
        await expect(detectCvMarks(Buffer.from('not a png'), 100, 100, 50)).rejects.toThrow();
    });
});
