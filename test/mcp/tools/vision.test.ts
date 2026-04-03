import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerVisionTools } from '../../../lib/mcp/tools/vision.js';
import { createMockServer } from '../fixtures/server.js';
import { createMockSession } from '../fixtures/session.js';

vi.mock('../../../lib/util/png.js', () => ({
    getPngDimensions: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
}));

const FAKE_SCREENSHOT = 'fake-base64-screenshot';

describe('analyze_screen tool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('response format: coordinates (default)', () => {
        it('returns image content and coordinate instruction for app session', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0); // getDpiScale
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'where is the OK button?',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(2);

            const [imageBlock, textBlock] = result.content;
            expect(imageBlock.type).toBe('image');
            expect(imageBlock.data).toBe(FAKE_SCREENSHOT);
            expect(imageBlock.mimeType).toBe('image/png');

            expect(textBlock.type).toBe('text');
            expect(textBlock.text).toContain('where is the OK button?');
            expect(textBlock.text).toContain('"x"');
            expect(textBlock.text).toContain('"y"');
        });

        it('includes coordinate conversion formula when DPI scaling is detected', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            // 150% DPI: logical rect 1280×720, screenshot 1920×1080
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1280, height: 720 });
            mockBrowser.executeScript = vi.fn().mockImplementation((cmd: string) => {
                if (cmd === 'windows: getDpiScale') { return Promise.resolve(1.5); }
                return Promise.resolve(undefined);
            });
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'find the close button',
                responseFormat: 'coordinates',
            }) as any;

            const textBlock = result.content[1];
            // When DPI scaling is detected, the instruction includes the conversion math
            expect(textBlock.text).toContain('coordinate conversion required');
        });

        it('returns coordinate instruction without mapping for root/desktop session', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            // width > 10000 = root session
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({
                x: 0, y: 0, width: 2147483647, height: 2147483647,
            });
            mockBrowser.executeScript = vi.fn().mockImplementation((cmd: string) => {
                if (cmd === 'windows: getMonitors') {
                    return Promise.resolve([{ primary: true, bounds: { width: 1920, height: 1080 } }]);
                }
                return Promise.resolve(1.0);
            });
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'desktop taskbar',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBeUndefined();
            const [imageBlock, textBlock] = result.content;
            expect(imageBlock.type).toBe('image');
            expect(textBlock.type).toBe('text');
            expect(textBlock.text).toContain('desktop taskbar');
        });
    });

    describe('response format: text', () => {
        it('returns image content and plain text instruction', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'what app is open?',
                responseFormat: 'text',
            }) as any;

            expect(result.isError).toBeUndefined();
            const [imageBlock, textBlock] = result.content;
            expect(imageBlock.type).toBe('image');
            expect(textBlock.text).toContain('what app is open?');
            expect(textBlock.text).toContain('plain text');
            expect(textBlock.text).not.toContain('"x"');
        });
    });

    describe('prompt embedding', () => {
        it('includes the prompt text in the instruction', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            mockBrowser.getWindowRect = vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
            mockBrowser.executeScript = vi.fn().mockResolvedValue(1.0);
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'find the Save button',
                responseFormat: 'coordinates',
            }) as any;

            expect(result.isError).toBeUndefined();
            expect(result.content[1].text).toContain('find the Save button');
        });
    });

    describe('error handling', () => {
        it('returns isError when takeScreenshot fails', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockRejectedValue(new Error('screenshot failed'));
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'find something',
            }) as any;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('screenshot failed');
        });

        it('still returns a result when coord mapping fails (graceful degradation)', async () => {
            const server = createMockServer();
            const { session, mockBrowser } = createMockSession();
            mockBrowser.takeScreenshot = vi.fn().mockResolvedValue(FAKE_SCREENSHOT);
            // getWindowRect throws — getCoordMapping returns undefined
            mockBrowser.getWindowRect = vi.fn().mockRejectedValue(new Error('no window'));
            registerVisionTools(server, session);

            const result = await server.call('analyze_screen', {
                prompt: 'find something',
                responseFormat: 'coordinates',
            }) as any;

            // Should not be an error — coord mapping failure is caught internally
            expect(result.isError).toBeUndefined();
            expect(result.content).toHaveLength(2);
            // Without mapping, no conversion formula is included
            expect(result.content[1].text).not.toContain('coordinate conversion required');
        });
    });
});
