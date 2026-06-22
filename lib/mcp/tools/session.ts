import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppiumSession } from '../session.js';
import { formatError } from '../errors.js';

export function registerSessionTools(server: McpServer, session: AppiumSession): void {
    server.registerTool(
        'create_session',
        {
            description:
                'Launch a Windows application and start a new Appium session. ' +
                'Ask the user before calling — confirm they want a new app instance launched.',
            annotations: { destructiveHint: true },
            inputSchema: {
                app: z.string().min(1).optional().describe(
                    'Executable path (e.g. "C:\\\\Windows\\\\notepad.exe") or UWP App ID ' +
                    '(e.g. "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App") or "Root" to attach to the desktop root. ' +
                    'Omit when using appTopLevelWindow to attach to an already-running window.'
                ),
                appArguments: z.string().optional().describe('Command-line arguments to pass to the app'),
                appWorkingDir: z.string().optional().describe('Working directory for the app process'),
                waitForAppLaunch: z.number().int().min(0).optional().describe('Milliseconds to wait after app launch before interacting'),
                shouldCloseApp: z.boolean().optional().default(true).describe('Whether to close the app when delete_session is called'),
                implicitTimeout: z.number().int().min(0).optional().default(1500).describe('Implicit element wait timeout in milliseconds'),
                delayAfterClick: z.number().int().min(0).optional().describe('Milliseconds to wait after each click'),
                delayBeforeClick: z.number().int().min(0).optional().describe('Milliseconds to wait before each click'),
                smoothPointerMove: z.string().optional().describe('Easing function name for smooth pointer movement'),
                webviewEnabled: z.boolean().optional().describe('Enable WebView/CDP support for hybrid apps (Edge/Chrome-based embedded webviews)'),
                webviewDevtoolsPort: z.number().int().min(1).optional().describe('DevTools remote debugging port the embedded webview is listening on'),
                javaSwing: z.boolean().optional().describe('Enable Java agent support for automating Java Swing/AWT applications. Injects a JVM agent that exposes Java class names, accessible names, and roles for element finding.'),
                jdkPath: z.string().optional().describe('Path to the JDK installation used to inject the Java agent (e.g. "C:\\\\Program Files\\\\Eclipse Adoptium\\\\jdk-21"). Required if javaSwing is true and JAVA_HOME is not set.'),
                appTopLevelWindow: z.string().optional().describe('Native window handle (decimal or hex string, e.g. "0x001A0B2C") of an already-running window to attach to instead of launching a new app. Use with javaSwing:true to attach the Java agent to an existing Java Swing/AWT window.'),
                newSessionCommandTimeout: z.number().int().min(0).optional().describe('Seconds of inactivity before Appium auto-closes the session (default: 3600). Maps to Appium newCommandTimeout capability.'),
                useInternetExplorer: z.boolean().optional().describe(
                    'Enable legacy Internet Explorer automation. IEDriverServer is downloaded and cached automatically on first use. ' +
                    'All WebDriver commands are proxied through IEDriverServer instead of UIA.'
                ),
                ieDriverServerPath: z.string().optional().describe(
                    'Absolute path to a local IEDriverServer.exe. Overrides the auto-downloaded binary when useInternetExplorer is true. ' +
                    'Example: "C:\\\\WebDriver\\\\IEDriverServer.exe"'
                ),
            },
        },
        async (params) => {
            try {
                await session.create(params);
                const target = params.app ?? params.appTopLevelWindow ?? 'desktop root';
                return { content: [{ type: 'text' as const, text: `Session created. "${target}" is ready for interaction.` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

server.registerTool(
        'attach_session',
        {
            description:
                'Attach to an existing Appium session by session ID. ' +
                'Ask the user to provide the session ID — it is visible in Appium Inspector ' +
                'or in the Appium server logs next to the session creation event.',
            annotations: { destructiveHint: false },
            inputSchema: {
                sessionId: z.string().min(1).describe('The Appium session ID to attach to (get from Appium Inspector or server logs)'),
            },
        },
        async ({ sessionId }) => {
            try {
                await session.attach(sessionId);
                return { content: [{ type: 'text' as const, text: `Attached to session "${sessionId}". Ready for interaction.` }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'delete_session',
        {
            description:
                'End the current Appium session and close the app. ' +
                'Only call this when the user explicitly asks to stop or end the session. ' +
                'Never call autonomously — always confirm with the user before terminating.',
            annotations: { destructiveHint: true },
        },
        async () => {
            try {
                if (!session.isActive()) {
                    return { content: [{ type: 'text' as const, text: 'No active session to delete.' }] };
                }
                await session.delete();
                return { content: [{ type: 'text' as const, text: 'Session deleted successfully.' }] };
            } catch (err) {
                return { isError: true, content: [{ type: 'text' as const, text: formatError(err) }] };
            }
        }
    );

    server.registerTool(
        'get_session_status',
        {
            description: 'Check whether a session is currently active in this MCP server instance.',
            annotations: { readOnlyHint: true },
        },
        async () => {
            const active = session.isActive();
            return {
                content: [{
                    type: 'text' as const,
                    text: active ? 'Session is active.' : 'No active session.',
                }],
            };
        }
    );
}
