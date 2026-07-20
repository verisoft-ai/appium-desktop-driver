import Anthropic from '@anthropic-ai/sdk';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { logger } from '@appium/support';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPngDimensions } from './util';

const log = logger.getLogger('vision-llm');

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

async function callAnthropicVision(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens: number,
): Promise<string> {
    const client = new Anthropic({ apiKey });
    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
        response = await client.messages.create({
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
    } catch (err) {
        throw new Error(`Network/API error contacting Anthropic vision API: ${(err as Error).message}`);
    }
    return response.content.find((b) => b.type === 'text')?.text ?? '';
}

async function callOpenAIVision(
    base64: string,
    textPrompt: string,
    model: string,
    apiKey: string,
    maxTokens: number,
): Promise<string> {
    let res: Response;
    try {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    } catch (err) {
        throw new Error(`Network error contacting OpenAI vision API: ${(err as Error).message}`);
    }
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
    let res: Response;
    try {
        res = await fetch(url, {
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
    } catch (err) {
        throw new Error(`Network error contacting Gemini vision API: ${(err as Error).message}`);
    }
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
    let response: ConverseCommandOutput;
    try {
        response = await client.send(command);
    } catch (err) {
        throw new Error(`Network/API error contacting Amazon Bedrock: ${(err as Error).message}`);
    }
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
    log.debug(`sending prompt to ${model} (${provider}):\n${textPrompt}`);

    let raw: string;
    switch (provider) {
        case 'openai': raw = await callOpenAIVision(base64, textPrompt, model, apiKey, maxTokens); break;
        case 'google': raw = await callGoogleVision(base64, textPrompt, model, apiKey, maxTokens); break;
        case 'amazon': raw = await callAmazonBedrockVision(base64, textPrompt, model, maxTokens); break;
        default: raw = await callAnthropicVision(base64, textPrompt, model, apiKey, maxTokens); break;
    }

    log.debug(`raw response from ${model}:\n${raw}`);
    return raw;
}

/** One diagnostic step in the findByVision pipeline, reported so failures are debuggable. */
export interface VisionStep {
    name: string;
    status: 'ok' | 'error';
    detail: string;
}

/** Thrown when the vision pipeline fails; carries the full step trail and, when available, the raw model response. */
export class VisionError extends Error {
    readonly steps: VisionStep[];
    readonly rawResponse?: string;

    constructor(message: string, steps: VisionStep[], rawResponse?: string) {
        super(message);
        this.name = 'VisionError';
        this.steps = steps;
        this.rawResponse = rawResponse;
    }
}

/** Formats a VisionError (or any error) into a human-readable message including the step trail and raw model response. */
export function formatVisionError(err: unknown): string {
    if (err instanceof VisionError) {
        const trail = err.steps
            .map((s) => `  [${s.status === 'ok' ? 'ok' : 'FAIL'}] ${s.name}: ${s.detail}`)
            .join('\n');
        let msg = `${err.message}\n\nSteps:\n${trail}`;
        if (err.rawResponse) {
            msg += `\n\nRaw model response:\n${err.rawResponse}`;
        }
        return msg;
    }
    return err instanceof Error ? err.message : String(err);
}

/**
 * Vision models frequently receive a screenshot that's larger than the resolution they
 * actually reason over internally (providers silently downscale large images before
 * inference). When that happens the model's reported coordinates are relative to its
 * internal resized view, not the WxH we told it — producing a systematic offset.
 * We downscale to a known-safe size ourselves so the space we tell the model about
 * matches what it actually sees.
 */
const VISION_MAX_EDGE = 1536;

/** Resizes a PNG (nearest-neighbor) so its longest edge is at most VISION_MAX_EDGE. No-op if already small enough. */
export function downscaleForVision(pngBuffer: Buffer): { base64: string; buffer: Buffer; width: number; height: number; scale: number } {
    const png = PNG.sync.read(pngBuffer);
    const { width, height } = png;
    const longestEdge = Math.max(width, height);

    if (longestEdge <= VISION_MAX_EDGE) {
        return { base64: pngBuffer.toString('base64'), buffer: pngBuffer, width, height, scale: 1 };
    }

    const scale = VISION_MAX_EDGE / longestEdge;
    const newWidth = Math.max(1, Math.round(width * scale));
    const newHeight = Math.max(1, Math.round(height * scale));
    const resized = new PNG({ width: newWidth, height: newHeight });

    for (let y = 0; y < newHeight; y++) {
        const srcY = Math.min(height - 1, Math.floor(y / scale));
        for (let x = 0; x < newWidth; x++) {
            const srcX = Math.min(width - 1, Math.floor(x / scale));
            const srcIdx = (width * srcY + srcX) << 2;
            const dstIdx = (newWidth * y + x) << 2;
            resized.data[dstIdx] = png.data[srcIdx];
            resized.data[dstIdx + 1] = png.data[srcIdx + 1];
            resized.data[dstIdx + 2] = png.data[srcIdx + 2];
            resized.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
    }

    const buffer = PNG.sync.write(resized);
    return { base64: buffer.toString('base64'), buffer, width: newWidth, height: newHeight, scale };
}

/** Draws a 3px red rectangle outline for a bounding box onto a copy of the PNG. Debug-only visualization aid. */
function drawBBoxOutline(pngBuffer: Buffer, box: { x1: number; y1: number; x2: number; y2: number }): Buffer {
    const png = PNG.sync.read(pngBuffer);
    const x1 = Math.max(0, Math.min(png.width - 1, Math.round(box.x1)));
    const y1 = Math.max(0, Math.min(png.height - 1, Math.round(box.y1)));
    const x2 = Math.max(0, Math.min(png.width - 1, Math.round(box.x2)));
    const y2 = Math.max(0, Math.min(png.height - 1, Math.round(box.y2)));
    const thickness = 3;

    const setPixel = (x: number, y: number) => {
        if (x < 0 || x >= png.width || y < 0 || y >= png.height) { return; }
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 255;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
    };

    for (let t = 0; t < thickness; t++) {
        for (let x = x1; x <= x2; x++) {
            setPixel(x, y1 + t);
            setPixel(x, y2 - t);
        }
        for (let y = y1; y <= y2; y++) {
            setPixel(x1 + t, y);
            setPixel(x2 - t, y);
        }
    }

    return PNG.sync.write(png);
}

/**
 * TEMPORARY DEBUG AID — remove once findByVision accuracy is confirmed solid.
 * When APPIUM_VISION_DEBUG_DIR is set, dumps each stage's image to disk (with the reported
 * bounding box drawn on it, in real machine pixel coordinates) so a bad result can be visually
 * inspected: is the crop math wrong, or did the model itself just point at the wrong spot?
 */
async function dumpVisionDebugImage(debugDir: string, runId: string, name: string, pngBuffer: Buffer): Promise<void> {
    await mkdir(debugDir, { recursive: true });
    await writeFile(path.join(debugDir, `${runId}-${name}.png`), pngBuffer);
}

export interface LocateByVisionOptions {
    prompt: string;
    model: string;
    apiKey: string;
    /** Full base64 PNG screenshot, at whatever resolution the driver captured it. */
    screenshotBase64: string;
    /** Resolves the screenshot-pixel -> screen-pixel mapping. Return undefined if unavailable (falls back to raw image coords). */
    buildMapping: (ssWidth: number, ssHeight: number) => Promise<CoordMapping | undefined>;
    /** When true, the result includes the downscaled+annotated screenshot actually sent to the VLM. Default false. */
    includeAnnotatedImage?: boolean;
}

export interface LocateByVisionResult {
    x: number;
    y: number;
    label: string;
    steps: VisionStep[];
    /** Base64 PNG of the downscaled, numbered-badge screenshot the VLM was shown. Present only when opts.includeAnnotatedImage is true. */
    annotatedImageBase64?: string;
}

/**
 * Orchestrates the Set-of-Mark findByVision pipeline: detect candidate regions locally via pure
 * CV contour detection -> downscale -> draw numbered badges -> single VLM call to pick a tag ->
 * resolve the tag to its pre-computed pixel center -> map to screen coordinates. Every stage is
 * recorded as a VisionStep (success or failure) so a bad result is diagnosable.
 */
export async function locateElementByVision(opts: LocateByVisionOptions): Promise<LocateByVisionResult> {
    const steps: VisionStep[] = [];
    const record = (name: string, status: 'ok' | 'error', detail: string) => steps.push({ name, status, detail });

    // TEMPORARY DEBUG AID — set APPIUM_VISION_DEBUG_DIR to dump every stage's image to disk.
    const debugDir = process.env.APPIUM_VISION_DEBUG_DIR;
    const runId = String(Date.now());
    const dumpDebug = async (name: string, makeBuffer: () => Buffer) => {
        if (!debugDir) { return; }
        try {
            await dumpVisionDebugImage(debugDir, runId, name, makeBuffer());
        } catch (err) {
            record('debug-dump', 'error', `Failed to write debug image "${name}": ${(err as Error).message}`);
        }
    };

    const originalBuffer = Buffer.from(opts.screenshotBase64, 'base64');
    const { width: origW, height: origH } = getPngDimensions(opts.screenshotBase64);
    record('screenshot', 'ok', `Captured screenshot at ${origW}x${origH}`);
    await dumpDebug('01-original', () => originalBuffer);

    // Detection runs against the full-resolution buffer for contour accuracy.
    const { detectMarks } = await import('./vision/mark-detect.js');
    let marks: Awaited<ReturnType<typeof detectMarks>>;
    try {
        marks = await detectMarks({ screenshotBuffer: originalBuffer, origW, origH });
    } catch (err) {
        // A real CV/WASM failure, not "ran fine, found nothing" - surface the actual cause
        // instead of masking it behind the generic zero-marks message below.
        const message = `CV mark detection failed: ${(err as Error).message}`;
        record('detect-marks', 'error', message);
        throw new VisionError(message, steps);
    }
    if (marks.length === 0) {
        const message = 'no candidate UI elements detected';
        record('detect-marks', 'error', message);
        throw new VisionError(message, steps);
    }
    record('detect-marks', 'ok', `Detected ${marks.length} candidate region(s) via CV contour detection`);

    // Downscale BEFORE annotating: badges must be drawn on the already-small buffer so their
    // numbers stay legible (drawing at full-res first and downscaling after would crush them).
    let ds: { base64: string; buffer: Buffer; width: number; height: number; scale: number };
    try {
        ds = downscaleForVision(originalBuffer);
        record('downscale', 'ok', ds.scale < 1
            ? `Resized ${origW}x${origH} -> ${ds.width}x${ds.height} (scale ${ds.scale.toFixed(3)}) before annotating and sending to the vision model`
            : `No downscale needed, ${origW}x${origH} is already within the ${VISION_MAX_EDGE}px limit`);
    } catch (err) {
        record('downscale', 'error', `Could not decode/resize screenshot, annotating original resolution instead: ${(err as Error).message}`);
        ds = { base64: opts.screenshotBase64, buffer: originalBuffer, width: origW, height: origH, scale: 1 };
    }
    await dumpDebug('02-downscaled', () => ds.buffer);

    const { annotateMarksOnImage } = await import('./vision/annotate.js');
    let annotatedBuffer: Buffer;
    try {
        annotatedBuffer = await annotateMarksOnImage(ds.buffer, marks, ds.scale);
        record('annotate', 'ok', `Drew ${marks.length} numbered badge(s) onto the ${ds.width}x${ds.height} search image`);
        await dumpDebug('03-annotated', () => annotatedBuffer);
    } catch (err) {
        record('annotate', 'error', (err as Error).message);
        throw new VisionError((err as Error).message, steps);
    }

    const { buildSomPrompt, parseSomTagResponse } = await import('./vision/som-prompt.js');
    let raw: string;
    try {
        raw = await callVisionLLM(annotatedBuffer.toString('base64'), buildSomPrompt(opts.prompt, marks.length), opts.model, opts.apiKey);
        record('locate', 'ok', `Received a response from ${opts.model}`);
    } catch (err) {
        record('locate', 'error', (err as Error).message);
        throw new VisionError((err as Error).message, steps);
    }

    let tagResponse: { tag: number; label: string };
    try {
        tagResponse = parseSomTagResponse(raw, opts.prompt, marks.length);
        record('parse-response', 'ok', `Model selected tag ${tagResponse.tag} - "${tagResponse.label}"`);
    } catch (err) {
        record('parse-response', 'error', (err as Error).message);
        throw new VisionError((err as Error).message, steps, raw);
    }

    // Tag resolution: the mark's (x, y) is already original-screenshot-space, no downscale-inverse math needed.
    const mark = marks.find((m) => m.id === tagResponse.tag);
    if (!mark) {
        const message = `LLM returned tag ${tagResponse.tag} but only ${marks.length} marks exist`;
        record('resolve-tag', 'error', message);
        throw new VisionError(message, steps, raw);
    }
    record('resolve-tag', 'ok', `Tag ${mark.id} -> (${mark.x}, ${mark.y}) in original screenshot pixels`);

    let mapping: CoordMapping | undefined;
    try {
        mapping = await opts.buildMapping(origW, origH);
        record('coord-mapping', mapping ? 'ok' : 'error',
            mapping
                ? `offset=(${mapping.offsetX}, ${mapping.offsetY}) scale=(${mapping.scaleX.toFixed(3)}, ${mapping.scaleY.toFixed(3)})`
                : 'No window/monitor mapping available - returning raw image coordinates');
    } catch (err) {
        record('coord-mapping', 'error', `Failed to compute screen mapping, returning raw image coordinates: ${(err as Error).message}`);
    }

    const finalCoords = mapping
        ? applyCoordMapping(mapping, mark.x, mark.y)
        : { x: Math.round(mark.x), y: Math.round(mark.y) };
    record('final', 'ok', `Screen coordinates (${finalCoords.x}, ${finalCoords.y})`);
    await dumpDebug('04-final-point', () => drawBBoxOutline(originalBuffer, {
        x1: mark.x - 10, y1: mark.y - 10, x2: mark.x + 10, y2: mark.y + 10,
    }));

    return {
        ...finalCoords,
        label: tagResponse.label,
        steps,
        ...(opts.includeAnnotatedImage ? { annotatedImageBase64: annotatedBuffer.toString('base64') } : {}),
    };
}
