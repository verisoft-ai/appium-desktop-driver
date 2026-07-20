import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate, mockFetch, mockBedrockSend } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockFetch: vi.fn(),
    mockBedrockSend: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
    })),
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
        send: mockBedrockSend,
    })),
    ConverseCommand: vi.fn().mockImplementation((input: unknown) => input),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('../../../lib/util', () => ({
    getPngDimensions: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
}));

const ONE_MARK = [{ x1: 495, y1: 295, x2: 505, y2: 305 }];

vi.mock('../../../lib/vision/mark-detect', () => ({
    detectMarks: vi.fn().mockImplementation(async () =>
        ONE_MARK.map((b, i) => ({
            id: i + 1,
            x: Math.round((b.x1 + b.x2) / 2),
            y: Math.round((b.y1 + b.y2) / 2),
            ...b,
        }))
    ),
}));

vi.mock('../../../lib/vision/annotate', () => ({
    annotateMarksOnImage: vi.fn().mockResolvedValue(Buffer.from('fake-annotated-png')),
}));

import { registerVisionTools } from '../../../lib/mcp/tools/vision.js';
import { createMockServer } from '../fixtures/server.js';
import { createMockSession } from '../fixtures/session.js';
import { detectMarks } from '../../../lib/vision/mark-detect.js';

const FAKE_SCREENSHOT = 'fake-base64-screenshot';

function makeLLMResponse(tag: number, label: string) {
    return { content: [{ type: 'text', text: JSON.stringify({ tag, label }) }] };
}

function makeTextLLMResponse(text: string) {
    return { content: [{ type: 'text', text }] };
}

function setMarks(boxes: Array<{ x1: number; y1: number; x2: number; y2: number }>) {
    vi.mocked(detectMarks).mockResolvedValue(
        boxes.map((b, i) => ({
            id: i + 1,
            x: Math.round((b.x1 + b.x2) / 2),
            y: Math.round((b.y1 + b.y2) / 2),
            ...b,
        }))
    );
}

describe('find_by_vision tool', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
        setMarks(ONE_MARK);
    });

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    describe('response format: coordinates (default)', () => {
        it('returns JSON text with screen coordinates for app session', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 100, y: 200, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0); // getDpiScale
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'OK button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'where is the OK button?',
                responseFormat: 'coordinates',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(1);

            const [textBlock] = result.content;
            expect(textBlock.type).toBe('text');

            const parsed = JSON.parse(textBlock.text);
            // Mark center (500, 300); offset=(100,200), scale=1.0
            expect(parsed.x).toBe(600);
            expect(parsed.y).toBe(500);
            expect(parsed.label).toBe('OK button');
        });

        it('includes an image content block when includeAnnotatedImage is true', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'OK button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'the OK button',
                model: 'claude-opus-4-6',
                includeAnnotatedImage: true,
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(2);
            expect(result.content[1].type).toBe('image');
            expect(result.content[1].data).toBe(Buffer.from('fake-annotated-png').toString('base64'));
        });

        it('does not include an image content block by default', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'OK button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'the OK button',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.content).toHaveLength(1);
        });

        it('applies DPI scale correction for logical pixel rects', async () => {
            // 150% DPI: logical rect 1280×720, screenshot 1920×1080
            setMarks([{ x1: 395, y1: 295, x2: 405, y2: 305 }]);
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1280, height: 720 });
            mockBrowser.executeScript = vi.fn().mockImplementation((cmd: string) => {
                if (cmd === 'windows: getDpiScale') { return Promise.resolve(1.5); }
                return Promise.resolve(undefined);
            });
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find the close button',
                responseFormat: 'coordinates',
                model: 'claude-opus-4-6',
            }) as any;

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.x).toBe(400);
            expect(parsed.y).toBe(300);
        });

        it('returns coordinates for root/desktop session using monitor bounds', async () => {
            setMarks([{ x1: 955, y1: 535, x2: 965, y2: 545 }]);
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({
                x: 0, y: 0, width: 2147483647, height: 2147483647,
            });
            mockBrowser.executeScript = vi.fn().mockImplementation((cmd: string) => {
                if (cmd === 'windows: getMonitors') {
                    return Promise.resolve([{ primary: true, bounds: { width: 1920, height: 1080 } }]);
                }
                return Promise.resolve(1.0);
            });
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'desktop center'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'desktop taskbar',
                responseFormat: 'coordinates',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.x).toBe(960);
            expect(parsed.y).toBe(540);
        });

        it('returns raw image coords when coord mapping fails (graceful degradation)', async () => {
            setMarks([{ x1: 195, y1: 145, x2: 205, y2: 155 }]);
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockRejectedValue(new Error('no window'));
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                responseFormat: 'coordinates',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            // No mapping available — raw image coords returned unchanged
            expect(parsed.x).toBe(200);
            expect(parsed.y).toBe(150);
        });

        it('uses the prompt in the vision LLM request', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'Save'));
            registerVisionTools(server, session);

            await server.call('find_by_vision', { prompt: 'find the Save button', model: 'claude-opus-4-6' });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    messages: expect.arrayContaining([
                        expect.objectContaining({
                            content: expect.arrayContaining([
                                expect.objectContaining({ type: 'text', text: expect.stringContaining('find the Save button') }),
                            ]),
                        }),
                    ]),
                })
            );
        });

        it('throws when no candidate marks are detected', async () => {
            setMarks([]);
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('no candidate UI elements detected');
        });

        it('throws when the model returns an out-of-range tag', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(9, 'hallucinated'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('but only 1 marks exist');
        });
    });

    describe('response format: text', () => {
        it('returns plain text LLM answer without coord mapping', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockCreate.mockResolvedValue(makeTextLLMResponse('Notepad is open.'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'what app is open?',
                responseFormat: 'text',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toBe('Notepad is open.');
        });

        it('uses higher max_tokens for text responses', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockCreate.mockResolvedValue(makeTextLLMResponse('answer'));
            registerVisionTools(server, session);

            await server.call('find_by_vision', { prompt: 'describe the screen', responseFormat: 'text', model: 'claude-opus-4-6' });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ max_tokens: 1024 })
            );
        });
    });

    describe('OpenAI provider', () => {
        beforeEach(() => {
            process.env.OPENAI_API_KEY = 'openai-test-key';
        });

        it('calls OpenAI API for gpt-4o model and returns coordinates', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: JSON.stringify({ tag: 1, label: 'save button' }) } }],
                }),
            });
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'save button',
                model: 'gpt-4o',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.label).toBe('save button');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    headers: expect.objectContaining({ 'Authorization': 'Bearer openai-test-key' }),
                })
            );
        });
    });

    describe('Amazon Bedrock provider', () => {
        beforeEach(() => {
            process.env.AWS_ACCESS_KEY_ID = 'fake-access-key';
            process.env.AWS_SECRET_ACCESS_KEY = 'fake-secret-key';
            process.env.AWS_REGION = 'us-east-1';
        });

        it('calls Bedrock ConverseCommand for amazon.nova model and returns coordinates', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockBedrockSend.mockResolvedValue({
                output: {
                    message: {
                        content: [{ text: JSON.stringify({ tag: 1, label: 'submit button' }) }],
                    },
                },
            });
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'submit button',
                model: 'amazon.nova-pro-v1:0',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.label).toBe('submit button');
            expect(mockBedrockSend).toHaveBeenCalled();
        });

        it('calls Bedrock for cross-region us.amazon.nova model', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockBedrockSend.mockResolvedValue({
                output: {
                    message: {
                        content: [{ text: JSON.stringify({ tag: 1, label: 'cancel' }) }],
                    },
                },
            });
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'cancel button',
                model: 'us.amazon.nova-lite-v1:0',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.label).toBe('cancel');
        });

        it('returns isError when AWS_ACCESS_KEY_ID is not set', async () => {
            delete process.env.AWS_ACCESS_KEY_ID;
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'amazon.nova-pro-v1:0',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('AWS_ACCESS_KEY_ID');
        });

        it('returns isError when AWS_SECRET_ACCESS_KEY is not set', async () => {
            delete process.env.AWS_SECRET_ACCESS_KEY;
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'amazon.nova-pro-v1:0',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('AWS_SECRET_ACCESS_KEY');
        });
    });

    describe('Google Gemini provider', () => {
        beforeEach(() => {
            process.env.GEMINI_API_KEY = 'gemini-test-key';
        });

        it('calls Gemini API for gemini- model and returns coordinates', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{ content: { parts: [{ text: JSON.stringify({ tag: 1, label: 'close' }) }] } }],
                }),
            });
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'close button',
                model: 'gemini-2.0-flash',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.label).toBe('close');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('generativelanguage.googleapis.com'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('model selection', () => {
        it('returns isError when model is not specified', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', { prompt: 'find item' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('model');
        });

        it('uses custom model when provided', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(1, 'item'));
            registerVisionTools(server, session);

            await server.call('find_by_vision', { prompt: 'find item', model: 'claude-haiku-4-5-20251001' });

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }));
        });
    });

    describe('error handling', () => {
        it('returns isError when ANTHROPIC_API_KEY is not set', async () => {
            delete process.env.ANTHROPIC_API_KEY;
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', { prompt: 'find something', model: 'claude-opus-4-6' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('ANTHROPIC_API_KEY');
        });

        it('returns isError when OPENAI_API_KEY is not set for GPT model', async () => {
            delete process.env.OPENAI_API_KEY;
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'gpt-4o',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('OPENAI_API_KEY');
        });

        it('returns isError when GEMINI_API_KEY is not set for Gemini model', async () => {
            delete process.env.GEMINI_API_KEY;
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                model: 'gemini-2.0-flash',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('GEMINI_API_KEY');
        });

        it('returns isError when takeScreenshot fails', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockRejectedValue(new Error('screenshot failed'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', { prompt: 'find something', model: 'claude-opus-4-6' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('screenshot failed');
        });

        it('returns isError when element is not found', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(-1, 'not found'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'a purple elephant',
                responseFormat: 'coordinates',
                model: 'claude-opus-4-6',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Element not found');
        });
    });
});
