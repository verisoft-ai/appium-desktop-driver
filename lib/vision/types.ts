/** A single Set-of-Mark candidate: a numbered tag over a detected UI region. */
export interface Mark {
    /** 1-based tag number shown to the VLM. */
    id: number;
    /** Center, original-screenshot pixel space — the coordinate returned as the click target. */
    x: number;
    y: number;
    /** Bounding box, same space. */
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface MarkDetectionOptions {
    /** Decoded original-resolution PNG. */
    screenshotBuffer: Buffer;
    origW: number;
    origH: number;
    /** Caps the number of marks returned. Default DEFAULT_MAX_MARKS. */
    maxMarks?: number;
}
