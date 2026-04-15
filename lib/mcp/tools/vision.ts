import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Browser } from 'webdriverio';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';
import { getPngDimensions } from '../../util';
import {
    CoordMapping,
    applyCoordMapping,
    buildVisionPrompt,
    callVisionLLM,
    computeCoordMapping,
    getApiKeyEnvVar,
    getProviderForModel,
    parseVisionCoords,
} from '../../vision-utils';

const DEFAULT_MODEL = 'claude-opus-4-6';

async function buildCoordMapping(driver: Browser, ssW: number, ssH: number): Promise<CoordMapping | undefined> {
    try {
        const rect = await driver.getWindowRect();
        const isRoot = rect.width > 10000;

        if (isRoot) {
            const monitors = await driver.executeScript('windows: getMonitors', []) as any[];
            const primary = monitors.find((m: any) => m.primary) ?? monitors[0];
            if (!primary) { return undefined; }
            return computeCoordMapping(
                true,
                rect.x, rect.y, rect.width, rect.height,
                1, ssW, ssH,
                primary.bounds.width, primary.bounds.height,
            );
        }

        const dpiScale = (await driver.executeScript('windows: getDpiScale', [])) as number;
        return computeCoordMapping(
            false,
            rect.x, rect.y, rect.width, rect.height,
            dpiScale, ssW, ssH,
        );
    } catch {
        return undefined;
    }
}

export function registerVisionTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'find_by_vision',
        {
            description:
                'Take a screenshot and analyze it with a vision model, returning the result directly. ' +
                'For "coordinates" format, locates a UI element and returns {x,y,label} with actual screen ' +
                'coordinates (DPI-corrected) ready to pass to click tools. ' +
                'For "text" format, answers a general question about the screen in plain text. ' +
                'Requires ANTHROPIC_API_KEY (Claude), OPENAI_API_KEY (GPT-4o / o-series), or ' +
                'GEMINI_API_KEY (Gemini) depending on the chosen model.',
            inputSchema: {
                prompt: z.string().min(1).describe('Question or instruction about the screenshot'),
                responseFormat: z.enum(['coordinates', 'text']).default('coordinates').describe(
                    '"coordinates" (default) locates an element and returns JSON {x,y,label} with converted screen coordinates. ' +
                    '"text" answers a general question about the screen in plain text.'
                ),
                model: z.string().optional().describe(`Vision model to use (default: ${DEFAULT_MODEL})`),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ prompt, responseFormat, model }) => {
            try {
                const visionModel = model ?? DEFAULT_MODEL;
                const envVar = getApiKeyEnvVar(getProviderForModel(visionModel));
                const apiKey = process.env[envVar];
                if (!apiKey) {
                    throw new Error(
                        `${envVar} environment variable is required for find_by_vision (model: ${visionModel})`
                    );
                }

                const driver = session.getDriver();
                const base64 = await driver.takeScreenshot() as string;
                const { width: ssW, height: ssH } = getPngDimensions(base64);

                if (responseFormat === 'text') {
                    const textPrompt = `Answer the following about this screenshot: "${prompt}"\nRespond with plain text.`;
                    const text = await callVisionLLM(base64, textPrompt, visionModel, apiKey, 1024);
                    return { content: [{ type: 'text' as const, text }] };
                }

                // coordinates: call vision LLM → parse image-pixel coords → apply mapping server-side
                const raw = await callVisionLLM(base64, buildVisionPrompt(prompt, ssW, ssH), visionModel, apiKey);
                const parsed = parseVisionCoords(raw, prompt);
                const mapping = await buildCoordMapping(driver, ssW, ssH);
                const coords = mapping
                    ? applyCoordMapping(mapping, parsed.x, parsed.y)
                    : { x: parsed.x, y: parsed.y };

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ ...coords, label: parsed.label }),
                    }],
                };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
