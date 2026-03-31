import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Browser } from 'webdriverio';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

const responseFormatSchema = z.enum(['coordinates', 'text']).default('coordinates');

interface CoordMapping {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    screenshotW: number;
    screenshotH: number;
}

function getPngDimensions(base64: string): { width: number; height: number } {
    const buf = Buffer.from(base64, 'base64');
    // PNG: 8-byte signature + 4-byte chunk length + 4-byte "IHDR" + 4-byte width + 4-byte height
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
}

async function getCoordMapping(driver: Browser, ssW: number, ssH: number): Promise<CoordMapping | undefined> {
    try {
        const rect = await driver.getWindowRect();
        const dpiScale = (await driver.executeScript('windows: getDpiScale', [])) as number;
        // Root/desktop session: getWindowRect returns Infinity (replaced with 2147483647 by the driver)
        const isRoot = rect.width > 10000;

        if (isRoot) {
            const monitors = await driver.executeScript('windows: getMonitors', []) as any[];
            const primary = monitors.find((m: any) => m.primary) ?? monitors[0];
            if (!primary) { return undefined; }
            const actualW = primary.bounds.width;
            const actualH = primary.bounds.height;
            return { offsetX: 0, offsetY: 0, scaleX: actualW / ssW, scaleY: actualH / ssH, screenshotW: ssW, screenshotH: ssH };
        }

        // App session: detect whether getWindowRect() returned logical coordinates.
        // At 150% DPI: logical rect.width × 1.5 ≈ physical ssW → isLogical = true.
        // At 100% DPI: rect.width ≈ ssW, dpiScale = 1.0 → isLogical = false.
        const isLogical = dpiScale > 1.01 &&
            Math.abs(rect.width * dpiScale - ssW) / ssW < 0.15;

        const offsetX = isLogical ? Math.round(rect.x * dpiScale) : rect.x;
        const offsetY = isLogical ? Math.round(rect.y * dpiScale) : rect.y;
        const scaleX = ssW / (isLogical ? rect.width * dpiScale : rect.width);
        const scaleY = ssH / (isLogical ? rect.height * dpiScale : rect.height);

        return { offsetX, offsetY, scaleX, scaleY, screenshotW: ssW, screenshotH: ssH };
    } catch {
        return undefined;
    }
}

function buildInstruction(
    prompt: string,
    responseFormat: 'coordinates' | 'text',
    mapping?: CoordMapping
): string {
    const base = `Answer the following about this screenshot: "${prompt}"`;

    if (responseFormat === 'coordinates') {
        let coordInstruction = `${base}\nRespond ONLY with JSON: { "x": <number>, "y": <number>, "label": "<string>" }`;
        if (mapping) {
            const { offsetX, offsetY, scaleX, scaleY, screenshotW, screenshotH } = mapping;
            coordInstruction +=
                `\n\nIMPORTANT — coordinate conversion required:` +
                `\nThe screenshot is ${screenshotW}×${screenshotH} pixels but represents a larger screen area due to DPI scaling.` +
                `\nConvert your visual pixel estimate to actual screen coordinates before returning:` +
                `\n  actual_x = ${offsetX} + Math.round(visual_x × ${scaleX.toFixed(4)})` +
                `\n  actual_y = ${offsetY} + Math.round(visual_y × ${scaleY.toFixed(4)})` +
                `\nReturn the already-converted actual screen coordinates in the JSON.`;
        }
        return coordInstruction;
    }

    return `${base}\nRespond with plain text.`;
}

export function registerVisionTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'analyze_screen',
        {
            description:
                'Take a screenshot of the current screen and return it together with an instruction for the calling agent to analyze. ' +
                'The agent sees the image and the prompt in its context and replies with the answer. ' +
                'No additional API key is required — the calling agent performs the visual analysis.',
            inputSchema: {
                prompt: z.string().min(1).describe('Question or instruction about the screenshot'),
                responseFormat: responseFormatSchema.describe(
                    '"coordinates" (default) returns JSON {x,y,label} with converted screen coordinates. ' +
                    'Use "text" only when the element cannot be found or the question is generic about the session.'
                ),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ prompt, responseFormat }) => {
            try {
                const driver = session.getDriver();
                const base64 = await driver.takeScreenshot() as string;
                const { width: ssW, height: ssH } = getPngDimensions(base64);
                const mapping = await getCoordMapping(driver, ssW, ssH);
                const instruction = buildInstruction(prompt, responseFormat, mapping);
                return {
                    content: [
                        { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
                        { type: 'text' as const, text: instruction },
                    ],
                };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
