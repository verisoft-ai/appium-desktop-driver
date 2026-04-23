import Anthropic from '@anthropic-ai/sdk';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'amazon';

/** Infers the LLM provider from the model identifier. */
const SUPPORTED_MODELS = [
    'claude-*         (e.g. claude-sonnet-4-6)',
    'gpt-*            (e.g. gpt-4o)',
    'o1, o3, o4, o1-mini, o3-pro, …',
    'gemini-*         (e.g. gemini-1.5-pro)',
    'amazon.nova-*    (e.g. amazon.nova-pro-v1:0)',
    'us.amazon.nova-* (cross-region inference, e.g. us.amazon.nova-pro-v1:0)',
    'eu.amazon.nova-* (cross-region inference)',
    'ap.amazon.nova-* (cross-region inference)',
];

export function getProviderForModel(model: string): LLMProvider {
    const lower = model.toLowerCase();
    if (lower.startsWith('gpt-') || /^o\d/.test(lower)) {
        return 'openai';
    }
    if (lower.startsWith('gemini-')) {
        return 'google';
    }
    if (lower.startsWith('claude-')) {
        return 'anthropic';
    }
    if (/^(us\.|eu\.|ap\.)?amazon\./.test(lower)) {
        return 'amazon';
    }
    throw new Error(
        `Unsupported model: "${model}". ` +
        `Supported model prefixes are:\n  ${SUPPORTED_MODELS.join('\n  ')}`,
    );
}

/** Returns the environment variable name that holds the API key for the given provider. */
export function getApiKeyEnvVar(provider: LLMProvider): string {
    switch (provider) {
        case 'openai': return 'OPENAI_API_KEY';
        case 'google': return 'GEMINI_API_KEY';
        case 'amazon': return 'AWS_ACCESS_KEY_ID';
        default: return 'ANTHROPIC_API_KEY';
    }
}

export interface CoordMapping {
    offsetX: number;
    offsetY: number;
    /** physicalWidth / screenshotWidth — multiply screenshot px to get screen px */
    scaleX: number;
    /** physicalHeight / screenshotHeight */
    scaleY: number;
}

/**
 * Pure computation of the mapping from screenshot pixel coordinates to actual
 * screen coordinates. All driver-specific calls are resolved by the caller.
 */
export function computeCoordMapping(
    isRoot: boolean,
    rectX: number,
    rectY: number,
    rectW: number,
    rectH: number,
    dpiScale: number,
    ssW: number,
    ssH: number,
    monitorW?: number,
    monitorH?: number,
): CoordMapping {
    if (isRoot) {
        return {
            offsetX: 0,
            offsetY: 0,
            scaleX: (monitorW ?? ssW) / ssW,
            scaleY: (monitorH ?? ssH) / ssH,
        };
    }

    // At non-100% DPI, getWindowRect() may return logical (unscaled) coordinates.
    // Detect this: logical_width × dpiScale ≈ screenshot_width.
    const isLogical = dpiScale > 1.01 && Math.abs(rectW * dpiScale - ssW) / ssW < 0.15;
    const physW = isLogical ? rectW * dpiScale : rectW;
    const physH = isLogical ? rectH * dpiScale : rectH;
    return {
        offsetX: isLogical ? Math.round(rectX * dpiScale) : rectX,
        offsetY: isLogical ? Math.round(rectY * dpiScale) : rectY,
        scaleX: physW / ssW,
        scaleY: physH / ssH,
    };
}

/** Converts screenshot pixel coordinates to actual screen coordinates. */
export function applyCoordMapping(
    mapping: CoordMapping,
    imgX: number,
    imgY: number,
): { x: number; y: number } {
    return {
        x: Math.round(mapping.offsetX + imgX * mapping.scaleX),
        y: Math.round(mapping.offsetY + imgY * mapping.scaleY),
    };
}

/** Builds the LLM prompt for locating a UI element by description. */
export function buildVisionPrompt(prompt: string, ssW: number, ssH: number): string {
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

/** Parses a vision LLM coordinate response. Throws on malformed JSON or not-found. */
export function parseVisionCoords(
    raw: string,
    prompt: string,
): { x: number; y: number; label: string } {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`Unexpected LLM response: ${raw}`);
    }
    const parsed = JSON.parse(jsonMatch[0]) as { x: number; y: number; label: string };
    if (parsed.x === -1) {
        throw new Error(`Element not found: "${prompt}"`);
    }
    return parsed;
}

async function callAnthropicVision(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens: number,
): Promise<string> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/png', data: base64 },
                },
                { type: 'text', text: textPrompt },
            ],
        }],
    });
    return response.content.find((b) => b.type === 'text')?.text ?? '';
}

async function callOpenAIVision(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens: number,
): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                    { type: 'text', text: textPrompt },
                ],
            }],
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        let message: string;
        try {
            message = (JSON.parse(body) as { error?: { message: string } }).error?.message ?? body;
        } catch {
            message = body || res.statusText;
        }
        throw new Error(`OpenAI API error: ${message}`);
    }
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error(`Unexpected response from OpenAI model "${model}": no text content in choices[0].message.content`);
    }
    return content;
}

async function callGoogleVision(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens: number,
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inline_data: { mime_type: 'image/png', data: base64 } },
                    { text: textPrompt },
                ],
            }],
            generationConfig: { maxOutputTokens: maxTokens },
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        let message: string;
        try {
            message = (JSON.parse(body) as { error?: { message: string } }).error?.message ?? body;
        } catch {
            message = body || res.statusText;
        }
        throw new Error(`Gemini API error: ${message}`);
    }
    const data = await res.json() as {
        candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
        throw new Error(`Unexpected response from Gemini model "${model}": no text in candidates[0].content.parts[0].text`);
    }
    return text;
}

async function callAmazonBedrockVision(
    base64: string,
    textPrompt: string,
    model: string,
    maxTokens: number,
): Promise<string> {
    const client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    });
    const command = new ConverseCommand({
        modelId: model,
        messages: [{
            role: 'user',
            content: [
                {
                    image: {
                        format: 'png',
                        source: { bytes: Buffer.from(base64, 'base64') },
                    },
                },
                { text: textPrompt },
            ],
        }],
        inferenceConfig: { maxTokens },
    });
    const response = await client.send(command);
    const text = response.output?.message?.content?.find((b) => 'text' in b && typeof b.text === 'string') as { text: string } | undefined;
    if (!text) {
        throw new Error(`Unexpected response from Amazon Bedrock model "${model}": no text content in output`);
    }
    return text.text;
}

/**
 * Sends a base64 screenshot + text prompt to a vision model and returns the raw
 * text response. Dispatches to Anthropic, OpenAI, Google Gemini, or Amazon Bedrock
 * based on the model name prefix. The caller is responsible for building the prompt
 * and parsing the result.
 */
export async function callVisionLLM(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens = 256,
): Promise<string> {
    const provider = getProviderForModel(model);
    switch (provider) {
        case 'openai': return callOpenAIVision(base64, textPrompt, model, apiKey, maxTokens);
        case 'google': return callGoogleVision(base64, textPrompt, model, apiKey, maxTokens);
        case 'amazon': return callAmazonBedrockVision(base64, textPrompt, model, maxTokens);
        default: return callAnthropicVision(base64, textPrompt, model, apiKey, maxTokens);
    }
}
