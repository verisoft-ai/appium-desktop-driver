import { detectCvMarks, CvBox } from './cv-marks';
import type { Mark, MarkDetectionOptions } from './types';

export const DEFAULT_MAX_MARKS = 50;

function toMark(box: CvBox, id: number): Mark {
    return {
        id,
        x: Math.round((box.x1 + box.x2) / 2),
        y: Math.round((box.y1 + box.y2) / 2),
        x1: box.x1,
        y1: box.y1,
        x2: box.x2,
        y2: box.y2,
    };
}

/** Stable top-to-bottom, left-to-right order so tag numbers are visually predictable. */
export function sortBoxesReadingOrder(boxes: CvBox[]): CvBox[] {
    return [...boxes].sort((a, b) => {
        if (a.y1 !== b.y1) { return a.y1 - b.y1; }
        return a.x1 - b.x1;
    });
}

/** Caps, sorts, and renumbers raw CV boxes into the final Mark[] handed to annotation + the VLM. */
export function toMarks(boxes: CvBox[], maxMarks: number): Mark[] {
    return sortBoxesReadingOrder(boxes)
        .slice(0, maxMarks)
        .map((box, i) => toMark(box, i + 1));
}

/**
 * Detects candidate UI regions and turns them into numbered Marks. CV failures propagate as-is -
 * the caller (locateElementByVision) distinguishes them from the legitimate zero-marks outcome.
 */
export async function detectMarks(opts: MarkDetectionOptions): Promise<Mark[]> {
    const maxMarks = opts.maxMarks ?? DEFAULT_MAX_MARKS;
    const boxes = await detectCvMarks(opts.screenshotBuffer, opts.origW, opts.origH, maxMarks);
    return toMarks(boxes, maxMarks);
}
