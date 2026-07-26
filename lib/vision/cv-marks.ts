import { logger } from '@appium/support';

const log = logger.getLogger('cv-marks');

export interface CvBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

const MIN_BOX_DIM = 10;
/** A box covering more than this fraction of the image area is treated as a background/container region, not a click target. */
const MAX_BOX_AREA_FRACTION = 0.6;
/** Two boxes where one is >80% contained inside the other collapse to just the outer box (see PLAN.md contour-dedup section). */
const IOMIN_SUPPRESS_THRESHOLD = 0.8;

async function loadCv(): Promise<any> {
    const cvModule = await import('@techstark/opencv-js');
    let cv = (cvModule as any).default ?? cvModule;
    if (cv instanceof Promise) {
        cv = await cv;
    } else if (!cv.Mat && cv.onRuntimeInitialized !== undefined) {
        await new Promise<void>((resolve) => {
            cv.onRuntimeInitialized = resolve;
        });
    }
    return cv;
}

function boxArea(box: CvBox): number {
    return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

function intersectionArea(a: CvBox, b: CvBox): number {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/** Containment-based suppression (IoMin), not IoU: IoU fails when a small box sits fully inside a large one (see PLAN.md). */
function dedupBoxes(boxes: CvBox[]): CvBox[] {
    const sorted = [...boxes].sort((a, b) => boxArea(b) - boxArea(a));
    const kept: CvBox[] = [];
    for (const candidate of sorted) {
        const candidateArea = boxArea(candidate);
        const isContained = kept.some((k) => {
            const inter = intersectionArea(k, candidate);
            const iomin = inter / Math.min(boxArea(k), candidateArea);
            return iomin > IOMIN_SUPPRESS_THRESHOLD;
        });
        if (!isContained) {
            kept.push(candidate);
        }
    }
    return kept;
}

/**
 * Detects candidate interactable regions via pure CV contour detection over the whole screenshot.
 * WASM init / decode / cv.* failures propagate to the caller with their real message - they must
 * not be confused with the legitimate "ran fine, found zero contours" outcome.
 */
export async function detectCvMarks(
    pngBuffer: Buffer,
    origW: number,
    origH: number,
    maxCandidates: number,
): Promise<CvBox[]> {
    const cv = await loadCv();

    // Decode PNG -> RGBA buffer via pngjs (already a dependency) rather than opencv's own image
    // codecs, which are unreliable in the WASM build.
    const { PNG } = await import('pngjs');
    const png = PNG.sync.read(pngBuffer);

    const src = cv.matFromArray(png.height, png.width, cv.CV_8UC4, png.data);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const dilated = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.Canny(gray, edges, 50, 150);

        // Morphological close (wider than tall - text runs horizontally) smears adjacent
        // character edges into cohesive word/label contours before extraction.
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 3));
        cv.dilate(edges, dilated, kernel);
        kernel.delete();

        // RETR_LIST (not RETR_EXTERNAL): button/control borders nest inside their parent
        // panel/window contour, so RETR_EXTERNAL would return only the outermost contour and
        // silently drop every nested control. dedupBoxes() below already collapses genuine
        // containment (outer panel vs. inner button) via IoMin, so nothing regresses here.
        cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        log.debug(`raw contours from findContours: ${contours.size()}`);

        const maxArea = origW * origH * MAX_BOX_AREA_FRACTION;
        const boxes: CvBox[] = [];
        let droppedMinDim = 0;
        let droppedMaxArea = 0;
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const rect = cv.boundingRect(contour);
            contour.delete();

            const w = rect.width;
            const h = rect.height;
            if (w < MIN_BOX_DIM || h < MIN_BOX_DIM) { droppedMinDim++; continue; }
            if (w * h > maxArea) { droppedMaxArea++; continue; }

            boxes.push({ x1: rect.x, y1: rect.y, x2: rect.x + w, y2: rect.y + h });
        }
        log.debug(`after size filters: ${boxes.length} kept, ${droppedMinDim} dropped (< ${MIN_BOX_DIM}px dim), ${droppedMaxArea} dropped (> ${(MAX_BOX_AREA_FRACTION * 100).toFixed(0)}% of ${origW}x${origH} image area = ${Math.round(maxArea)}px²)`);
        if (boxes.length > 0) {
            const areas = boxes.map(boxArea);
            log.debug(`kept box areas: min=${Math.round(Math.min(...areas))}px² max=${Math.round(Math.max(...areas))}px²`);
        }

        const deduped = dedupBoxes(boxes);
        log.debug(`after IoMin dedup: ${deduped.length} kept, ${boxes.length - deduped.length} suppressed as near-duplicates`);

        deduped.sort((a, b) => boxArea(a) - boxArea(b));
        const capped = deduped.slice(0, maxCandidates);
        log.debug(`after maxCandidates cap (${maxCandidates}): ${capped.length} final mark(s)`);
        return capped;
    } finally {
        src.delete();
        gray.delete();
        edges.delete();
        dilated.delete();
        contours.delete();
        hierarchy.delete();
    }
}
