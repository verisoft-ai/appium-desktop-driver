/**
 * Unit tests for the executeFindByVision command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate, mockFetch } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockFetch: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
    })),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('../../lib/winapi/user32', () => ({
    getResolutionScalingFactor: vi.fn().mockReturnValue(1.0),
}));

vi.mock('../../lib/util', () => ({
    getPngDimensions: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
}));

import { executeFindByVision } from '../../lib/commands/vision';
import { getResolutionScalingFactor } from '../../lib/winapi/user32';

const FAKE_SCREENSHOT = 'fake-base64-png';

function makeMockDriver(overrides: Record<string, unknown> = {}) {
    return {
        getScreenshot: vi.fn().mockResolvedValue(FAKE_SCREENSHOT),
        getWindowRect: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 1920, height: 1080 }),
        windowsGetMonitors: vi.fn().mockResolvedValue([
            { primary: true, bounds: { width: 1920, height: 1080 } },
        ]),
        ...overrides,
    };
}

function makeLLMResponse(x: number, y: number, label: string) {
    return {
        content: [{ type: 'text', text: JSON.stringify({ x, y, label }) }],
    };
}

describe('executeFindByVision', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it('throws when model argument is missing', async () => {
        const driver = makeMockDriver();

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'OK button' } as any)
        ).rejects.toThrow('requires a "model" argument');
    });

    it('throws when ANTHROPIC_API_KEY is not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const driver = makeMockDriver();

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'OK button', model: 'claude-opus-4-6' })
        ).rejects.toThrow('ANTHROPIC_API_KEY');
    });

    it('throws when OPENAI_API_KEY is not set for GPT model', async () => {
        delete process.env.OPENAI_API_KEY;
        const driver = makeMockDriver();

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'OK button', model: 'gpt-4o' })
        ).rejects.toThrow('OPENAI_API_KEY');
    });

    it('throws when GEMINI_API_KEY is not set for Gemini model', async () => {
        delete process.env.GEMINI_API_KEY;
        const driver = makeMockDriver();

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'OK button', model: 'gemini-2.0-flash' })
        ).rejects.toThrow('GEMINI_API_KEY');
    });

    it('returns screen coordinates for app session at 100% DPI', async () => {
        // At 100% DPI: rect.width === ssW, dpiScale = 1.0, isLogical = false
        // scaleX = ssW / rect.width = 1920 / 1920 = 1.0
        // actual_x = offsetX + pixel_x * scaleX = 100 + 500 * 1.0 = 600
        const driver = makeMockDriver({
            getWindowRect: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 1920, height: 1080 }),
        });
        mockCreate.mockResolvedValue(makeLLMResponse(500, 300, 'OK button'));

        const result = await executeFindByVision.call(driver as any, { prompt: 'OK button', model: 'claude-opus-4-6' });

        expect(result.x).toBe(600);
        expect(result.y).toBe(500);
        expect(result.label).toBe('OK button');
    });

    it('returns screen coordinates for root/desktop session', async () => {
        // width > 10000 triggers root path; uses monitor bounds with offset = 0
        // scaleX = actualW / ssW = 1920 / 1920 = 1.0
        // actual_x = 0 + 960 * 1.0 = 960
        const driver = makeMockDriver({
            getWindowRect: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 2147483647, height: 2147483647 }),
            windowsGetMonitors: vi.fn().mockResolvedValue([
                { primary: true, bounds: { width: 1920, height: 1080 } },
            ]),
        });
        mockCreate.mockResolvedValue(makeLLMResponse(960, 540, 'desktop center'));

        const result = await executeFindByVision.call(driver as any, { prompt: 'desktop center', model: 'claude-opus-4-6' });

        expect(result.x).toBe(960);
        expect(result.y).toBe(540);
        expect(result.label).toBe('desktop center');
    });

    it('applies DPI scale correction for logical pixel rects', async () => {
        // At 150% DPI: logical rect is 1280×720, physical ssW is 1920×1080
        // dpiScale=1.5, isLogical = 1.5 > 1.01 && |1280*1.5-1920|/1920 ≈ 0 < 0.15 → true
        // offsetX = Math.round(0 * 1.5) = 0
        // physW = 1280 * 1.5 = 1920, scaleX = 1920/1920 = 1.0
        vi.mocked(getResolutionScalingFactor).mockReturnValue(1.5);
        const driver = makeMockDriver({
            getWindowRect: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1280, height: 720 }),
        });
        mockCreate.mockResolvedValue(makeLLMResponse(400, 300, 'button'));

        const result = await executeFindByVision.call(driver as any, { prompt: 'button', model: 'claude-opus-4-6' });

        expect(result.x).toBe(400);
        expect(result.y).toBe(300);
    });

    it('throws when element is not found (x === -1)', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(-1, -1, 'not found'));

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'nonexistent element', model: 'claude-opus-4-6' })
        ).rejects.toThrow('Element not found');
    });

    it('throws when LLM returns non-JSON text', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue({
            content: [{ type: 'text', text: 'I cannot see any matching element in this screenshot.' }],
        });

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'something', model: 'claude-opus-4-6' })
        ).rejects.toThrow('Unexpected LLM response');
    });

    it('extracts JSON from LLM response that has surrounding text', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue({
            content: [{ type: 'text', text: 'Sure! Here is the result: {"x":200,"y":150,"label":"Submit"}' }],
        });

        const result = await executeFindByVision.call(driver as any, { prompt: 'Submit button', model: 'claude-opus-4-6' });

        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.label).toBe('Submit');
    });

    it('throws when model is not specified', async () => {
        const driver = makeMockDriver();

        await expect(
            executeFindByVision.call(driver as any, { prompt: 'item' } as any)
        ).rejects.toThrow('requires a "model" argument');
    });

    it('uses custom model when provided', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'item'));

        await executeFindByVision.call(driver as any, { prompt: 'item', model: 'claude-haiku-4-5-20251001' });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
        );
    });

    it('passes screenshot as base64 image in LLM request', async () => {
        const driver = makeMockDriver();
        mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'item'));

        await executeFindByVision.call(driver as any, { prompt: 'item', model: 'claude-opus-4-6' });

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: expect.arrayContaining([
                            expect.objectContaining({
                                type: 'image',
                                source: expect.objectContaining({ data: FAKE_SCREENSHOT }),
                            }),
                        ]),
                    }),
                ]),
            })
        );
    });

    it('falls back to non-primary monitor when primary not found', async () => {
        const driver = makeMockDriver({
            getWindowRect: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 2147483647, height: 2147483647 }),
            windowsGetMonitors: vi.fn().mockResolvedValue([
                { primary: false, bounds: { width: 2560, height: 1440 } },
            ]),
        });
        mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'item'));

        const result = await executeFindByVision.call(driver as any, { prompt: 'item', model: 'claude-opus-4-6' });

        // Falls back to first monitor: scaleX = 2560/1920, scaleY = 1440/1080
        expect(result.x).toBe(Math.round(0 + 100 * (2560 / 1920)));
        expect(result.y).toBe(Math.round(0 + 100 * (1440 / 1080)));
    });

    describe('OpenAI provider', () => {
        beforeEach(() => {
            process.env.OPENAI_API_KEY = 'openai-test-key';
        });

        it('calls OpenAI API for gpt-4o model', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: JSON.stringify({ x: 300, y: 400, label: 'button' }) } }],
                }),
            });

            const result = await executeFindByVision.call(driver as any, {
                prompt: 'button',
                model: 'gpt-4o',
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'Authorization': 'Bearer openai-test-key' }),
                })
            );
            expect(result.label).toBe('button');
        });

        it('throws on OpenAI API error response', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: false,
                statusText: 'Unauthorized',
                text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
            });

            await expect(
                executeFindByVision.call(driver as any, { prompt: 'button', model: 'gpt-4o-mini' })
            ).rejects.toThrow('OpenAI API error: Invalid API key');
        });
    });

    describe('Google Gemini provider', () => {
        beforeEach(() => {
            process.env.GEMINI_API_KEY = 'gemini-test-key';
        });

        it('calls Gemini API for gemini- model', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{ content: { parts: [{ text: JSON.stringify({ x: 200, y: 300, label: 'icon' }) }] } }],
                }),
            });

            const result = await executeFindByVision.call(driver as any, {
                prompt: 'icon',
                model: 'gemini-2.0-flash',
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('generativelanguage.googleapis.com'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-key' }),
                })
            );
            expect(result.label).toBe('icon');
        });

        it('throws on Gemini API error response', async () => {
            const driver = makeMockDriver();
            mockFetch.mockResolvedValue({
                ok: false,
                statusText: 'Bad Request',
                text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid' } })),
            });

            await expect(
                executeFindByVision.call(driver as any, { prompt: 'icon', model: 'gemini-1.5-pro' })
            ).rejects.toThrow('Gemini API error: API key not valid');
        });
    });
});
