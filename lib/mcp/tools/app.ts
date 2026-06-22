import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerAppTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'get_window_element',
        {
            description: 'Get the element ID of the current session\'s root window element.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: getWindowElement', [{}]);
                const ref = result as Record<string, string>;
                const elementId = ref['element-6066-11e4-a52e-4f735466cecf'] ?? ref.ELEMENT;
                if (!elementId) {
                    throw new Error(`windows: getWindowElement returned unexpected value: ${JSON.stringify(result)}`);
                }
                return { content: [{ type: 'text' as const, text: elementId }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'launch_app',
        {
            description: 'Launch the application configured for this session (re-launch if it was closed).',
            annotations: { destructiveHint: false },
        },
        async () => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: launchApp', [{}]);
                return { content: [{ type: 'text' as const, text: 'app launched' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'close_app',
        {
            description: 'Close the application under test without ending the Appium session. Only call when explicitly asked.',
            annotations: { destructiveHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: closeApp', [{}]);
                return { content: [{ type: 'text' as const, text: 'app closed' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'attach_java_swing',
        {
            description:
                'Inject the Java accessibility agent into the JVM owning the current session window. ' +
                'Use this after creating a session (with app or appTopLevelWindow) when javaSwing was NOT set at session creation time. ' +
                'Once called, element finding will use Java class names and accessible names instead of UIA.',
            annotations: { destructiveHint: false },
            inputSchema: {
                jdkPath: z.string().optional().describe('Path to the JDK installation (e.g. "C:\\\\Program Files\\\\Eclipse Adoptium\\\\jdk-21"). Overrides the jdkPath session capability.'),
            },
        },
        async ({ jdkPath }) => {
            try {
                const driver = session.getDriver();
                await driver.executeScript('windows: attachJavaSwing', [jdkPath !== undefined ? { jdkPath } : {}]);
                return { content: [{ type: 'text' as const, text: 'Java agent injected. Session is now Java Swing-aware.' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_device_time',
        {
            description: 'Get the current date/time on the Windows device.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            try {
                const driver = session.getDriver();
                const result = await driver.executeScript('windows: getDeviceTime', [{}]);
                return { content: [{ type: 'text' as const, text: String(result) }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );
}
