import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

const responseFormatSchema = z.enum(['auto', 'coordinates', 'text', 'json']).default('auto');

function buildInstruction(prompt: string, responseFormat: 'auto' | 'coordinates' | 'text' | 'json', jsonSchema?: string): string {
    const base = `Answer the following about this screenshot: "${prompt}"`;

    switch (responseFormat) {
        case 'coordinates':
            return `${base}\nRespond ONLY with JSON: { "x": <number>, "y": <number>, "label": "<string>" }`;
        case 'text':
            return `${base}\nRespond with plain text.`;
        case 'json':
            return `${base}\nRespond ONLY with a valid JSON object matching this shape: ${jsonSchema ?? 'object'}`;
        case 'auto':
        default: {
            const locationKeywords = /\b(where|location|find|position|coordinates|locate)\b/i;
            if (locationKeywords.test(prompt)) {
                return `${base}\nRespond ONLY with JSON: { "x": <number>, "y": <number>, "label": "<string>" }`;
            }
            return `${base}\nRespond with plain text.`;
        }
    }
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
                    '"auto" detects location queries and returns JSON {x,y,label}, otherwise plain text. ' +
                    '"coordinates" always returns JSON {x,y,label}. ' +
                    '"text" always returns plain text. ' +
                    '"json" returns a JSON object matching the shape in jsonSchema.'
                ),
                jsonSchema: z.string().optional().describe('Describe the JSON shape to return (only used when responseFormat is "json")'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ prompt, responseFormat, jsonSchema }) => {
            try {
                const driver = session.getDriver();
                const base64 = await driver.takeScreenshot() as string;
                const instruction = buildInstruction(prompt, responseFormat, jsonSchema);
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
