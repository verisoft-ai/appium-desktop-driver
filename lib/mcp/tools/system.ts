import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerSystemTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_orientation',
        {
            description: 'Get the current display orientation ("LANDSCAPE" or "PORTRAIT").',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const orientation = await driver.getOrientation();
                return { content: [{ type: 'text' as const, text: String(orientation) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'execute_powershell',
        {
            description:
                'Run a raw PowerShell script or command on the machine running the driver, inside the session\'s persistent PowerShell process. ' +
                'Use for arbitrary automation not covered by another tool (registry edits, service control, file inspection, etc). ' +
                'Runs with the same privileges as the driver process — treat as unrestricted code execution.',
            annotations: { destructiveHint: true },
            inputSchema: {
                script: z.string().min(1).describe('PowerShell script or command to execute'),
            },
        },
        async ({ script }) => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('powerShell', [script]);
                return { content: [{ type: 'text' as const, text: String(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
