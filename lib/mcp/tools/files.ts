import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerFileTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'push_file',
        {
            description:
                'Write a file to the filesystem of the machine running the driver. ' +
                'Requires the "modify_fs" insecure feature to be enabled on the Appium server.',
            annotations: { destructiveHint: true },
            inputSchema: {
                remotePath: z.string().min(1).describe('Absolute path to write the file to'),
                base64Data: z.string().min(1).describe('File contents, base64-encoded'),
            },
        },
        async ({ remotePath, base64Data }) => {
            try {
                const driver = session.getDriver();
                await driver.pushFile(remotePath, base64Data);
                return { content: [{ type: 'text' as const, text: `File written: ${remotePath}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'pull_file',
        {
            description:
                'Read a file from the filesystem of the machine running the driver, returned as base64. ' +
                'Requires the "modify_fs" insecure feature to be enabled on the Appium server.',
            annotations: { readOnlyHint: true },
            inputSchema: {
                remotePath: z.string().min(1).describe('Absolute path of the file to read'),
            },
        },
        async ({ remotePath }) => {
            try {
                const driver = session.getDriver();
                const base64 = await driver.pullFile(remotePath);
                return { content: [{ type: 'text' as const, text: base64 }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'delete_file',
        {
            description:
                'Delete a file on the machine running the driver. ' +
                'Requires the "modify_fs" insecure feature to be enabled on the Appium server.',
            annotations: { destructiveHint: true },
            inputSchema: {
                path: z.string().min(1).describe('Absolute path of the file to delete'),
            },
        },
        async ({ path }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: deleteFile', [{ path }]);
                return { content: [{ type: 'text' as const, text: `Deleted: ${path}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'delete_folder',
        {
            description:
                'Delete a folder (recursively by default) on the machine running the driver. ' +
                'Requires the "modify_fs" insecure feature to be enabled on the Appium server.',
            annotations: { destructiveHint: true },
            inputSchema: {
                path: z.string().min(1).describe('Absolute path of the folder to delete'),
                recursive: z.boolean().default(true).describe('Delete non-empty folders recursively'),
            },
        },
        async ({ path, recursive }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: deleteFolder', [{ path, recursive }]);
                return { content: [{ type: 'text' as const, text: `Deleted folder: ${path}` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
