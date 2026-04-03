import Anthropic from '@anthropic-ai/sdk';
import { AppiumDesktopDriver } from '../driver';
import { getPngDimensions } from '../util';
import { getResolutionScalingFactor } from '../winapi/user32';

interface CoordMapping {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
}

async function buildCoordMapping(
    driver: AppiumDesktopDriver,
    ssW: number,
    ssH: number
): Promise<CoordMapping> {
    const rect = await driver.getWindowRect();
    const isRoot = rect.width > 10000;

    if (isRoot) {
        const monitors = await driver.windowsGetMonitors() as Array<{
            primary: boolean;
            bounds: { width: number; height: number };
        }>;
        const primary = monitors.find((m) => m.primary) ?? monitors[0];
        const actualW = primary?.bounds?.width ?? ssW;
        const actualH = primary?.bounds?.height ?? ssH;
        return { offsetX: 0, offsetY: 0, scaleX: actualW / ssW, scaleY: actualH / ssH };
    }

    // App session: getWindowRect may return logical pixels at non-100% DPI
    const dpiScale = getResolutionScalingFactor();
    const isLogical = dpiScale > 1.01 && Math.abs(rect.width * dpiScale - ssW) / ssW < 0.15;
    const physW = isLogical ? rect.width * dpiScale : rect.width;
    const physH = isLogical ? rect.height * dpiScale : rect.height;
    return {
        offsetX: isLogical ? Math.round(rect.x * dpiScale) : rect.x,
        offsetY: isLogical ? Math.round(rect.y * dpiScale) : rect.y,
        scaleX: physW / ssW,
        scaleY: physH / ssH,
    };
}

function buildVisionPrompt(prompt: string, ssW: number, ssH: number): string {
    return (
        `Locate the following element in the screenshot: "${prompt}"\n\n` +
        `The image is ${ssW}×${ssH} pixels.\n\n` +
        `Respond ONLY with a JSON object — no other text:\n` +
        `{ "x": <integer>, "y": <integer>, "label": "<brief description of what you found>" }\n\n` +
        `x and y must be the pixel coordinates of the element's CENTER within this image.\n` +
        `x must be between 0 and ${ssW}. y must be between 0 and ${ssH}.\n\n` +
        `If the element cannot be found, respond with:\n` +
        `{ "x": -1, "y": -1, "label": "not found" }`
    );
}

export async function executeFindByVision(
    this: AppiumDesktopDriver,
    args: { prompt: string; model?: string }
): Promise<{ x: number; y: number; label: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error(
            'ANTHROPIC_API_KEY environment variable is required for windows: findByVision'
        );
    }

    // 1. Take screenshot (existing method handles window focus)
    const base64 = await this.getScreenshot();
    const { width: ssW, height: ssH } = getPngDimensions(base64);

    // 2. Ask LLM for image-pixel coordinates only — no DPI/scaling knowledge needed
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model: args.model ?? 'claude-opus-4-6',
        max_tokens: 256,
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/png', data: base64 },
                },
                { type: 'text', text: buildVisionPrompt(args.prompt, ssW, ssH) },
            ],
        }],
    });

    // 3. Parse JSON response
    const raw = response.content.find((b) => b.type === 'text')?.text ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`windows: findByVision — unexpected LLM response: ${raw}`);
    }
    const parsed = JSON.parse(jsonMatch[0]) as { x: number; y: number; label: string };
    if (parsed.x === -1) {
        throw new Error(`windows: findByVision — element not found: "${args.prompt}"`);
    }

    // 4. Convert image-pixel coordinates to actual screen coordinates deterministically
    const mapping = await buildCoordMapping(this, ssW, ssH);
    return {
        x: Math.round(mapping.offsetX + parsed.x * mapping.scaleX),
        y: Math.round(mapping.offsetY + parsed.y * mapping.scaleY),
        label: parsed.label,
    };
}
