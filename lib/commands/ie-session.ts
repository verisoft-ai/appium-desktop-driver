import * as http from 'node:http';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fs, node, tempDir, zip } from '@appium/support';
import { errors, JWProxy } from '@appium/base-driver';
import type { AppiumLogger } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';
import { findFreePort, downloadFile, MODULE_NAME } from '../util';

const IE_DRIVER_PORT_LOWER = 5555;
const IE_DRIVER_PORT_UPPER = 5655;
const IE_DRIVER_READY_POLL_MS = 500;
const IE_DRIVER_READY_MAX_ATTEMPTS = 10;

// Last Selenium release that ships IEDriverServer_Win32 as a zip asset.
const IE_DRIVER_VERSION = '4.14.0';
const IE_DRIVER_FILENAME = 'IEDriverServer.exe';
const IE_DRIVER_ZIP = `IEDriverServer_Win32_${IE_DRIVER_VERSION}.zip`;
const IE_DRIVER_URL = `https://github.com/SeleniumHQ/selenium/releases/download/selenium-${IE_DRIVER_VERSION}/${IE_DRIVER_ZIP}`;

async function getIEDriverExecutable(log: AppiumLogger): Promise<string> {
    const root = node.getModuleRootSync(MODULE_NAME, __filename);
    if (!root) {
        throw new errors.SessionNotCreatedError(`Cannot find root folder of ${MODULE_NAME}`);
    }

    const finalPath = path.join(root, 'iedriver', IE_DRIVER_VERSION, IE_DRIVER_FILENAME);

    if (await fs.exists(finalPath)) {
        log.debug(`IEDriverServer found in cache: ${finalPath}`);
        return finalPath;
    }

    log.info(`IEDriverServer not found in cache. Downloading ${IE_DRIVER_VERSION}...`);

    const tmpRoot = await tempDir.openDir();
    try {
        await downloadFile(IE_DRIVER_URL, tmpRoot);

        const zipPath = path.join(tmpRoot, IE_DRIVER_ZIP);
        if (!await fs.exists(zipPath)) {
            throw new errors.SessionNotCreatedError(`Downloaded zip not found at ${zipPath}`);
        }

        await zip.extractAllTo(zipPath, tmpRoot);

        const found = await fs.walkDir(
            tmpRoot,
            true,
            (itemPath: string, isDirectory: boolean) =>
                !isDirectory && path.basename(itemPath).toLowerCase() === IE_DRIVER_FILENAME.toLowerCase()
        );

        if (!found) {
            throw new errors.SessionNotCreatedError(`${IE_DRIVER_FILENAME} not found in downloaded archive`);
        }

        await fs.mv(found, finalPath, { mkdirp: true });
        log.info(`IEDriverServer cached at: ${finalPath}`);
    } finally {
        await fs.rimraf(tmpRoot);
    }

    return finalPath;
}

function httpRequest(options: http.RequestOptions, body?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (body) { req.write(body); }
        req.end();
    });
}

function pollIEDriverReady(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(
            { hostname: 'localhost', port, path: '/status', timeout: 1000 },
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

export async function startIESession(this: AppiumDesktopDriver): Promise<void> {
    const exePath = this.caps.ieDriverServerPath
        ? this.caps.ieDriverServerPath
        : await getIEDriverExecutable(this.log);

    if (!await fs.exists(exePath)) {
        throw new errors.SessionNotCreatedError(`IEDriverServer.exe not found at: ${exePath}`);
    }

    const port = await findFreePort(IE_DRIVER_PORT_LOWER, IE_DRIVER_PORT_UPPER);

    const proc: ChildProcess = spawn(exePath, [`--port=${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n').filter(Boolean)) {
            this.log.debug(`[IEDriver] ${line}`);
        }
    });
    proc.stderr?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n').filter(Boolean)) {
            this.log.debug(`[IEDriver] ${line}`);
        }
    });
    proc.on('exit', (code) => {
        this.log.debug(`[IEDriver] Process exited with code ${code}`);
        this.ieDriverProcess = null;
    });

    this.ieDriverProcess = proc;
    this.ieDriverPort = port;

    // Poll until IEDriverServer is ready
    let ready = false;
    for (let i = 0; i < IE_DRIVER_READY_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, IE_DRIVER_READY_POLL_MS));
        ready = await pollIEDriverReady(port);
        if (ready) { break; }
    }

    if (!ready) {
        throw new errors.SessionNotCreatedError(`IEDriverServer did not become ready on port ${port} after ${IE_DRIVER_READY_MAX_ATTEMPTS * IE_DRIVER_READY_POLL_MS}ms`);
    }

    // Create W3C session on IEDriverServer
    const sessionBody = JSON.stringify({
        capabilities: {
            alwaysMatch: {
                browserName: 'internet explorer',
                'se:ieOptions': {
                    ignoreProtectedModeSettings: true,
                    ignoreZoomSetting: true,
                },
            },
        },
    });

    let sessionResult: { status: number; body: string };
    try {
        sessionResult = await httpRequest({
            hostname: 'localhost',
            port,
            path: '/session',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(sessionBody),
            },
            timeout: 30000,
        }, sessionBody);
    } catch (e) {
        throw new errors.SessionNotCreatedError(`Failed to create IEDriverServer session: ${e}`);
    }

    if (sessionResult.status < 200 || sessionResult.status >= 300) {
        throw new errors.SessionNotCreatedError(
            `IEDriverServer returned HTTP ${sessionResult.status}. ` +
            `Check IE Protected Mode settings (must match across all zones) and zoom level (must be 100%). ` +
            `Response: ${sessionResult.body}`
        );
    }

    let parsed: { value: { sessionId: string } };
    try {
        parsed = JSON.parse(sessionResult.body);
    } catch {
        throw new errors.SessionNotCreatedError(`IEDriverServer returned invalid JSON: ${sessionResult.body}`);
    }

    const sessionId = parsed?.value?.sessionId;
    if (!sessionId) {
        throw new errors.SessionNotCreatedError(`IEDriverServer did not return a sessionId. Response: ${sessionResult.body}`);
    }

    this.ieDriverSessionId = sessionId;
    this.log.info(`IEDriverServer session created: ${sessionId} on port ${port}`);

    const proxy = new JWProxy({ server: 'localhost', port, base: '', sessionId });
    this.ieProxy = proxy;
    this.proxyReqRes = proxy.proxyReqRes.bind(proxy);
    this.proxyCommand = proxy.command.bind(proxy);
    this.jwpProxyActive = true;

    this.log.info('IE mode active — all WebDriver commands proxied through IEDriverServer.');
}

export async function terminateIESession(this: AppiumDesktopDriver): Promise<void> {
    if (!this.ieDriverProcess) {
        return;
    }

    // Attempt graceful session deletion
    if (this.ieDriverSessionId && this.ieDriverPort) {
        try {
            await httpRequest({
                hostname: 'localhost',
                port: this.ieDriverPort,
                path: `/session/${this.ieDriverSessionId}`,
                method: 'DELETE',
                timeout: 3000,
            });
        } catch {
            // best-effort
        }
    }

    // Kill the process and wait for exit
    const proc = this.ieDriverProcess;
    await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 2000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
        proc.kill();
    });

    this.ieDriverProcess = null;
    this.ieDriverPort = null;
    this.ieDriverSessionId = null;
    this.ieProxy = null;
    this.proxyReqRes = null;
    this.proxyCommand = null;
    this.jwpProxyActive = false;

    this.log.debug('IEDriverServer session terminated.');
}

export function isIEMode(this: AppiumDesktopDriver): boolean {
    return !!(this.caps.useInternetExplorer || this.caps.ieDriverServerPath);
}
