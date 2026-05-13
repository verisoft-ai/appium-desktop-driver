import { errors } from '@appium/base-driver';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as path from 'node:path';

/**
 * Resolves the path to the bundled ffmpeg binary from the ffmpeg-static package.
 * Used by startRecordingScreen; no system PATH fallback.
 */
export function getBundledFfmpegPath(): string | null {
    try {
        const mod = require('ffmpeg-static') as string | { default?: string } | undefined;
        const path = typeof mod === 'string' ? mod : mod?.default;
        return typeof path === 'string' && path.length > 0 ? path : null;
    } catch {
        return null;
    }
}

const SupportedEasingFunctions = Object.freeze([
    'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out',
]);

export function assertSupportedEasingFunction(value: string) {
    const cubicBezierRegex = /^cubic-bezier\(\s*(0|1|0?\.\d+|\d+(\.\d+)?)\s*,\s*(-?0|-?1|-?0?\.\d+|-?\d+(\.\d+)?)\s*,\s*(0|1|0?\.\d+|\d+(\.\d+)?)\s*,\s*(-?0|-?1|-?0?\.\d+|-?\d+(\.\d+)?)\s*\)$/;
    if (!SupportedEasingFunctions.includes(value) && !cubicBezierRegex.test(value)) {
        throw new errors.InvalidArgumentError(`Unsupported or invalid easing function '${value}' in appium:smoothPointerMove capability.`
            + `Supported functions are [${SupportedEasingFunctions.join[', ']}, cubic-bezier(x1,y1,x2,y2)].`);
    }
}

export function assertIntegerCap(capName: string, value: number, min: number): void {
    if (!Number.isInteger(value) || value < min) {
        throw new errors.InvalidArgumentError(
            `Invalid capability '${capName}': must be an integer >= ${min} (got ${value}).`
        );
    }
}

export function isUwpAppId(appId: string): boolean {
    return appId.includes('!') && appId.includes('_') && !(appId.includes('/') || appId.includes('\\'));
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}

export function $(literals: TemplateStringsArray, ...substitutions: number[]) {
    substitutions.forEach((index) => {
        if (!Number.isInteger(index) && index < 0) {
            throw new errors.InvalidArgumentError(`Indices must be positive integers starting from 0. Received: ${index}`);
        }
    });

    return new DeferredStringTemplate(literals, substitutions);
}

export class DeferredStringTemplate {
    private literals: TemplateStringsArray;
    private substitutions: number[];

    constructor(literals: TemplateStringsArray, substitutions: number[]) {
        this.literals = literals;
        this.substitutions = substitutions;

        substitutions.forEach((index) => {
            if (!Number.isInteger(index) || index < 0) {
                throw new errors.InvalidArgumentError(`Indices must be positive integers starting from 0. Received: ${index}`);
            }
        });
    }

    format(...args: any[]): string {
        const out: string[] = [];
        for (let i = 0, k = 0; i < this.literals.length; i++, k++) {
            out[k] = this.literals[i];
            out[++k] = args[this.substitutions[i]]?.toString();
        }
        return out.join('');
    }
}

/**
 * Reads PNG image dimensions from a base64-encoded PNG string without any external library.
 * PNG stores width/height as big-endian uint32 at bytes 16–23 of the raw binary
 * (after the 8-byte signature + 4-byte chunk length + 4-byte "IHDR" type).
 */
export function getPngDimensions(base64: string): { width: number; height: number } {
    const buf = Buffer.from(base64, 'base64');
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export const MODULE_NAME = 'appium-desktop-driver';

export async function cdpRequest<T = unknown>(
    { host, port, endpoint, timeout }: { host: string; port: number | null; endpoint: string; timeout: number }
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const options = {
            hostname: host,
            port,
            path: endpoint,
            method: 'GET',
            agent: new http.Agent({ keepAlive: false }),
            timeout,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (err) { reject(err); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.end();
    });
}

export async function findFreePort(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port++) {
        const free = await new Promise<boolean>((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => srv.close(() => resolve(true)));
            srv.listen(port);
        });
        if (free) {
            return port;
        }
    }
    throw new Error(`No free port available in range ${start}-${end}.`);
}

export async function downloadFile(url: string, destDir: string, timeout = 30000): Promise<void> {
    const filename = new URL(url).pathname.split('/').pop() ?? 'download';
    const destPath = path.join(destDir, filename);

    const request = (currentUrl: string, redirectCount = 0): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const protocol = currentUrl.startsWith('https') ? https : http;
            const req = protocol.get(currentUrl, (res: http.IncomingMessage) => {
                const status = res.statusCode ?? 0;

                if ([301, 302, 307, 308].includes(status) && res.headers.location) {
                    if (redirectCount >= 10) {
                        return reject(new Error(`Too many redirects while downloading ${url}`));
                    }
                    const nextUrl = new URL(res.headers.location, currentUrl).toString();
                    return resolve(request(nextUrl, redirectCount + 1));
                }

                if (status !== 200) {
                    return reject(new Error(`Download failed from ${currentUrl}: ${status} ${res.statusMessage}`));
                }

                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    reject(err);
                });
            });

            req.on('error', reject);
            req.setTimeout(timeout, () => {
                req.destroy();
                reject(new Error(`Timeout downloading from ${currentUrl} after ${timeout}ms`));
            });
        });

    return request(url);
}
