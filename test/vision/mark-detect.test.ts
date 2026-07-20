import { describe, it, expect, vi } from 'vitest';
import type { CvBox } from '../../lib/vision/cv-marks';

const { mockDetectCvMarks } = vi.hoisted(() => ({
    mockDetectCvMarks: vi.fn(),
}));

vi.mock('../../lib/vision/cv-marks', () => ({
    detectCvMarks: mockDetectCvMarks,
}));

import { detectMarks, toMarks, sortBoxesReadingOrder, DEFAULT_MAX_MARKS } from '../../lib/vision/mark-detect';

function box(x1: number, y1: number, x2: number, y2: number): CvBox {
    return { x1, y1, x2, y2 };
}

describe('sortBoxesReadingOrder', () => {
    it('sorts top-to-bottom, then left-to-right', () => {
        const boxes = [box(100, 50, 120, 70), box(10, 50, 30, 70), box(10, 10, 30, 30)];
        const sorted = sortBoxesReadingOrder(boxes);
        expect(sorted).toEqual([box(10, 10, 30, 30), box(10, 50, 30, 70), box(100, 50, 120, 70)]);
    });
});

describe('toMarks', () => {
    it('renumbers 1..N in reading order and computes centers', () => {
        const boxes = [box(100, 100, 120, 120), box(0, 0, 20, 20)];
        const marks = toMarks(boxes, 50);
        expect(marks).toEqual([
            { id: 1, x: 10, y: 10, x1: 0, y1: 0, x2: 20, y2: 20 },
            { id: 2, x: 110, y: 110, x1: 100, y1: 100, x2: 120, y2: 120 },
        ]);
    });

    it('caps to maxMarks', () => {
        const boxes = Array.from({ length: 10 }, (_, i) => box(i * 10, 0, i * 10 + 5, 5));
        const marks = toMarks(boxes, 3);
        expect(marks).toHaveLength(3);
        expect(marks.map((m) => m.id)).toEqual([1, 2, 3]);
    });
});

describe('detectMarks', () => {
    it('uses DEFAULT_MAX_MARKS when maxMarks is not specified', async () => {
        mockDetectCvMarks.mockResolvedValue([box(0, 0, 20, 20)]);
        await detectMarks({ screenshotBuffer: Buffer.from([]), origW: 100, origH: 100 });
        expect(mockDetectCvMarks).toHaveBeenCalledWith(expect.anything(), 100, 100, DEFAULT_MAX_MARKS);
    });

    it('returns an empty array when no boxes are detected', async () => {
        mockDetectCvMarks.mockResolvedValue([]);
        const marks = await detectMarks({ screenshotBuffer: Buffer.from([]), origW: 100, origH: 100 });
        expect(marks).toEqual([]);
    });

    it('propagates a real detectCvMarks failure rather than swallowing it', async () => {
        mockDetectCvMarks.mockRejectedValue(new Error('WASM init failed'));
        await expect(
            detectMarks({ screenshotBuffer: Buffer.from([]), origW: 100, origH: 100 })
        ).rejects.toThrow('WASM init failed');
    });

    it('passes maxMarks through to detectCvMarks and toMarks', async () => {
        mockDetectCvMarks.mockResolvedValue([box(0, 0, 10, 10), box(20, 0, 30, 10)]);
        const marks = await detectMarks({ screenshotBuffer: Buffer.from([]), origW: 100, origH: 100, maxMarks: 1 });
        expect(mockDetectCvMarks).toHaveBeenCalledWith(expect.anything(), 100, 100, 1);
        expect(marks).toHaveLength(1);
    });
});
