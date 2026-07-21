import type { Mark } from './types';

const BADGE_RADIUS = 11;
const BADGE_FONT = 'bold 14px sans-serif';
/** Opaque so the badge stays legible against any background color — badge sits past the bbox
 *  corner (see BADGE_CORNER_OFFSET) so it no longer covers content that needs to show through. */
const BADGE_FILL = 'rgba(0,0,0,0.70)';
const BADGE_BORDER = '#ffffff';
const BADGE_TEXT = '#ffffff';
const BBOX_OUTLINE = 'rgb(228, 11, 11)';
/** Pushes the badge center diagonally past the bbox corner so it sits mostly outside the box instead of stamped on top of the corner content. */
const BADGE_CORNER_OFFSET = BADGE_RADIUS * 0.7;
const DIAGONAL = Math.SQRT1_2; // cos(45°) === sin(45°)

/**
 * Draws numbered badges (offset past the bbox corner, low-opacity fill) plus a connecting line
 * and bbox outline for each mark, onto a copy of the given (already downscaled) PNG buffer.
 * Marks are given in original-screenshot pixel space; `scale` maps them into the buffer's pixel
 * space.
 */
export async function annotateMarksOnImage(
    pngBuffer: Buffer,
    marks: Mark[],
    scale: number,
): Promise<Buffer> {
    const { createCanvas, GlobalFonts, loadImage } = await import('@napi-rs/canvas');
    void GlobalFonts; // default system font is sufficient; no custom font registration needed

    const image = await loadImage(pngBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    // Tracks already-placed badge centers so nearby marks nudge outward rather than overlap.
    const placedCenters: Array<{ x: number; y: number }> = [];

    for (const mark of marks) {
        const bx1 = mark.x1 * scale;
        const by1 = mark.y1 * scale;
        const bx2 = mark.x2 * scale;
        const by2 = mark.y2 * scale;

        ctx.strokeStyle = BBOX_OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

        // Anchor past the top-left corner, diagonally up-left, so the badge sits mostly outside
        // the box rather than stamped over the corner content.
        let cx = Math.max(BADGE_RADIUS, bx1 - BADGE_CORNER_OFFSET * DIAGONAL);
        let cy = Math.max(BADGE_RADIUS, by1 - BADGE_CORNER_OFFSET * DIAGONAL);
        for (const placed of placedCenters) {
            const dx = cx - placed.x;
            const dy = cy - placed.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < BADGE_RADIUS * 2) {
                const angle = Math.atan2(dy, dx) || 0;
                cx = placed.x + Math.cos(angle) * BADGE_RADIUS * 2;
                cy = placed.y + Math.sin(angle) * BADGE_RADIUS * 2;
            }
        }
        placedCenters.push({ x: cx, y: cy });

        // Connects the now-detached badge back to the region it tags - without this the
        // corner offset makes it ambiguous which box a floating badge belongs to.
        ctx.strokeStyle = BBOX_OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx1, by1);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = BADGE_FILL;
        ctx.fill();
        ctx.strokeStyle = BADGE_BORDER;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = BADGE_FONT;
        ctx.fillStyle = BADGE_TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(mark.id), cx, cy);
    }

    return canvas.toBuffer('image/png');
}
