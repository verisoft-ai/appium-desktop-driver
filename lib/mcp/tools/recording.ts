import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerRecordingTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'start_recording_screen',
        {
            description:
                'Start an FFmpeg-based screen recording. If a recording is already running it is stopped and restarted by default. ' +
                'Call stop_recording_screen to end it and retrieve the video.',
            annotations: { destructiveHint: false },
            inputSchema: {
                outputPath: z.string().optional().describe('Path to a .mp4 file to write to. Defaults to a temp file.'),
                timeLimit: z.number().int().min(1).optional().describe('Maximum recording duration in seconds'),
                videoFps: z.number().int().min(1).optional().describe('Frames per second'),
                videoFilter: z.string().optional().describe('Raw FFmpeg -vf filter string'),
                preset: z.string().optional().describe('FFmpeg encoding preset (e.g. "ultrafast", "medium")'),
                captureCursor: z.boolean().optional().describe('Include the mouse cursor in the recording'),
                captureClicks: z.boolean().optional().describe('Highlight mouse clicks in the recording'),
                audioInput: z.string().optional().describe('Audio input device name to record from'),
                forceRestart: z.boolean().default(true).describe('If a recording is already running, stop and restart it'),
            },
        },
        async (args) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: startRecordingScreen', [args]);
                return { content: [{ type: 'text' as const, text: 'recording started' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'stop_recording_screen',
        {
            description:
                'Stop the current screen recording and return the video. ' +
                'Returns the video as base64 by default, or uploads it to a remote destination first if remotePath is provided.',
            annotations: { readOnlyHint: true },
            inputSchema: {
                remotePath: z.string().optional().describe('Upload destination URL/path instead of returning base64 inline'),
                user: z.string().optional().describe('Username for remotePath upload auth'),
                pass: z.string().optional().describe('Password for remotePath upload auth'),
                method: z.string().optional().describe('HTTP method for remotePath upload (default PUT)'),
                headers: z.record(z.string(), z.string()).optional().describe('Extra HTTP headers for remotePath upload'),
                fileFieldName: z.string().optional().describe('Multipart form field name for remotePath upload'),
                formFields: z.record(z.string(), z.string()).optional().describe('Extra multipart form fields for remotePath upload'),
            },
        },
        async (args) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: stopRecordingScreen', [args]);
                return { content: [{ type: 'text' as const, text: String(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
