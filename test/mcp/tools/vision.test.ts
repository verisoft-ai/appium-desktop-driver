import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
    })),
}));

vi.mock('../../../lib/util', () => ({
    getPngDimensions: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
}));

import { registerVisionTools } from '../../../lib/mcp/tools/vision.js';
import { createMockServer } from '../fixtures/server.js';
import { createMockSession } from '../fixtures/session.js';

const FAKE_SCREENSHOT = 'fake-base64-screenshot';

function makeLLMResponse(x: number, y: number, label: string) {
    return { content: [{ type: 'text', text: JSON.stringify({ x, y, label }) }] };
}

function makeTextLLMResponse(text: string) {
    return { content: [{ type: 'text', text }] };
}

describe('find_by_vision tool', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
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
            mockCreate.mockResolvedValue(makeLLMResponse(500, 300, 'OK button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'where is the OK button?',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(1);

            const [textBlock] = result.content;
            expect(textBlock.type).toBe('text');

            const parsed = JSON.parse(textBlock.text);
            // actual_x = offsetX + imgX * scaleX = 100 + 500 * 1.0 = 600
            expect(parsed.x).toBe(600);
            expect(parsed.y).toBe(500);
            expect(parsed.label).toBe('OK button');
        });

        it('applies DPI scale correction for logical pixel rects', async () => {
            // 150% DPI: logical rect 1280×720, screenshot 1920×1080
            // isLogical = true, physW = 1280*1.5 = 1920, scaleX = 1.0, offsetX = 0
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1280, height: 720 });
            mockBrowser.executeScript = vi.fn().mockImplementation((cmd: string) => {
                if (cmd === 'windows: getDpiScale') { return Promise.resolve(1.5); }
                return Promise.resolve(undefined);
            });
            mockCreate.mockResolvedValue(makeLLMResponse(400, 300, 'button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find the close button',
                responseFormat: 'coordinates',
            }) as any;

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.x).toBe(400);
            expect(parsed.y).toBe(300);
        });

        it('returns coordinates for root/desktop session using monitor bounds', async () => {
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
            mockCreate.mockResolvedValue(makeLLMResponse(960, 540, 'desktop center'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'desktop taskbar',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBeUndefined();
            const parsed = JSON.parse(result.content[0].text);
            // Root session: offset=0, scale=1920/1920=1.0
            expect(parsed.x).toBe(960);
            expect(parsed.y).toBe(540);
        });

        it('returns raw image coords when coord mapping fails (graceful degradation)', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockRejectedValue(new Error('no window'));
            mockCreate.mockResolvedValue(makeLLMResponse(200, 150, 'button'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'find something',
                responseFormat: 'coordinates',
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
            mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'Save'));
            registerVisionTools(server, session);

            await server.call('find_by_vision', { prompt: 'find the Save button' });

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

            await server.call('find_by_vision', { prompt: 'describe the screen', responseFormat: 'text' });

            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ max_tokens: 1024 })
            );
        });
    });

    describe('model selection', () => {
        it('uses default model claude-opus-4-6 when none specified', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'item'));
            registerVisionTools(server, session);

            await server.call('find_by_vision', { prompt: 'find item' });

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-6' }));
        });

        it('uses custom model when provided', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(100, 100, 'item'));
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

            const result = await server.call('find_by_vision', { prompt: 'find something' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('find_by_vision');
        });

        it('returns isError when takeScreenshot fails', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockRejectedValue(new Error('screenshot failed'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', { prompt: 'find something' }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('screenshot failed');
        });

        it('returns isError when element is not found', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            mockCreate.mockResolvedValue(makeLLMResponse(-1, -1, 'not found'));
            registerVisionTools(server, session);

            const result = await server.call('find_by_vision', {
                prompt: 'a purple elephant',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Element not found');
        });
    });
});
