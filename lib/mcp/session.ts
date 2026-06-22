import * as http from 'node:http';
import { remote, attach } from 'webdriverio';
import type { Browser } from 'webdriverio';
import type { McpConfig } from './config.js';

function checkAppiumReachable(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(
            { hostname: host, port, path: '/status', timeout: 3000 },
            (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)?.value?.ready === true); }
                    catch { resolve(false); }
                });
            }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

/** Session parameters provided by the agent via the create_session tool. */
export interface SessionParams {
    app?: string;
    appArguments?: string;
    appWorkingDir?: string;
    waitForAppLaunch?: number;
    shouldCloseApp?: boolean;
    implicitTimeout?: number;
    delayAfterClick?: number;
    delayBeforeClick?: number;
    smoothPointerMove?: string;
    webviewEnabled?: boolean;
    webviewDevtoolsPort?: number;
    javaSwing?: boolean;
    jdkPath?: string;
    appTopLevelWindow?: string;
    newSessionCommandTimeout?: number;
    useInternetExplorer?: boolean;
    ieDriverServerPath?: string;
}

export class AppiumSession {
    private driver: Browser | null = null;

    constructor(private readonly appiumConfig: McpConfig) {}

    async create(params: SessionParams): Promise<void> {
        if (this.driver) {
            throw new Error('A session is already active. Call delete_session first.');
        }

        const { appiumHost: host, appiumPort: port } = this.appiumConfig;
        if (!await checkAppiumReachable(host, port)) {
            throw new Error(`Appium not running on ${host}:${port}. Start it first with: appium --port ${port}`);
        }

        process.stderr.write(`[MCP] Creating Appium session for: ${params.app ?? params.appTopLevelWindow ?? 'desktop root'}\n`);

        const caps: Record<string, unknown> = {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
        };

        if (params.app !== undefined) {caps['appium:app'] = params.app;}

        if (params.appArguments !== undefined) {caps['appium:appArguments'] = params.appArguments;}
        if (params.appWorkingDir !== undefined) {caps['appium:appWorkingDir'] = params.appWorkingDir;}
        if (params.waitForAppLaunch !== undefined) {caps['appium:waitForAppLaunch'] = params.waitForAppLaunch;}
        if (params.shouldCloseApp !== undefined) {caps['appium:shouldCloseApp'] = params.shouldCloseApp;}
        if (params.delayAfterClick !== undefined) {caps['appium:delayAfterClick'] = params.delayAfterClick;}
        if (params.delayBeforeClick !== undefined) {caps['appium:delayBeforeClick'] = params.delayBeforeClick;}
        if (params.smoothPointerMove !== undefined) {caps['appium:smoothPointerMove'] = params.smoothPointerMove;}
        if (params.webviewEnabled !== undefined) {caps['appium:webviewEnabled'] = params.webviewEnabled;}
        if (params.webviewDevtoolsPort !== undefined) {caps['appium:webviewDevtoolsPort'] = params.webviewDevtoolsPort;}
        if (params.javaSwing !== undefined) {caps['appium:javaSwing'] = params.javaSwing;}
        if (params.jdkPath !== undefined) {caps['appium:jdkPath'] = params.jdkPath;}
        if (params.appTopLevelWindow !== undefined) {caps['appium:appTopLevelWindow'] = params.appTopLevelWindow;}
        if (params.useInternetExplorer !== undefined) {caps['appium:useInternetExplorer'] = params.useInternetExplorer;}
        if (params.ieDriverServerPath !== undefined) {caps['appium:ieDriverServerPath'] = params.ieDriverServerPath;}
        caps['appium:newCommandTimeout'] = params.newSessionCommandTimeout ?? 3600;

        this.driver = await remote({
            hostname: this.appiumConfig.appiumHost,
            port: this.appiumConfig.appiumPort,
            path: '/',
            logLevel: 'silent',
            capabilities: caps as WebdriverIO.Capabilities,
        });

        await this.driver.setTimeout({ implicit: params.implicitTimeout });
        process.stderr.write('[MCP] Session created successfully\n');
    }

    async attach(sessionId: string): Promise<void> {
        if (this.driver) {
            throw new Error('A session is already active. Call delete_session first.');
        }

        const { appiumHost: hostname, appiumPort: port } = this.appiumConfig;
        if (!await checkAppiumReachable(hostname, port)) {
            throw new Error(`Appium not running on ${hostname}:${port}`);
        }

        process.stderr.write(`[MCP] Attaching to existing session: ${sessionId}\n`);
        this.driver = await attach({ sessionId, hostname, port, path: '/', logLevel: 'silent' });
        process.stderr.write('[MCP] Attached successfully\n');
    }

    async delete(): Promise<void> {
        if (!this.driver) {return;}
        try {
            await this.driver.deleteSession();
            process.stderr.write('[MCP] Session deleted\n');
        } catch (err) {
            process.stderr.write(`[MCP] Warning: session delete failed: ${err}\n`);
        } finally {
            this.driver = null;
        }
    }

    isActive(): boolean {
        return this.driver !== null;
    }

    getDriver(): Browser {
        if (!this.driver) {throw new Error('No active session. Call create_session first.');}
        return this.driver;
    }
}
