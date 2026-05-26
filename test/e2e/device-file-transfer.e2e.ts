import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'webdriverio';
import { createCalculatorSession, quitSession } from './helpers/session.js';

// pushFile / pullFile use assertFeatureEnabled(MODIFY_FS_FEATURE).
// The Appium server must be started with --allow-insecure modify_fs.

describe('pushFile / pullFile', () => {
    let driver: Browser;

    beforeAll(async () => {
        driver = await createCalculatorSession();
    });

    afterAll(async () => {
        await quitSession(driver);
    });

    // ─── pushFile ────────────────────────────────────────────────────────────

    describe('pushFile', () => {
        let cleanup: string = '';

        afterEach(() => {
            if (cleanup && existsSync(cleanup)) {
                try { rmSync(cleanup, { recursive: true, force: true }); } catch { /* noop */ }
            }
            cleanup = '';
        });

        it('writes a base64-encoded text file to disk', async () => {
            cleanup = join(tmpdir(), `desktop-push-${Date.now()}.txt`);
            await driver.pushFile(cleanup, Buffer.from('Hello, AppiumDesktop!').toString('base64'));
            expect(existsSync(cleanup)).toBe(true);
        });

        it('round-trips text content via pushFile → pullFile', async () => {
            cleanup = join(tmpdir(), `desktop-roundtrip-${Date.now()}.txt`);
            const content = 'round-trip test content';
            await driver.pushFile(cleanup, Buffer.from(content, 'utf8').toString('base64'));
            const pulled = await driver.pullFile(cleanup);
            expect(Buffer.from(pulled, 'base64').toString('utf8')).toBe(content);
        });

        it('round-trips binary data without corruption', async () => {
            cleanup = join(tmpdir(), `desktop-binary-${Date.now()}.bin`);
            const bytes = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
            await driver.pushFile(cleanup, bytes.toString('base64'));
            const pulled = await driver.pullFile(cleanup);
            expect(Buffer.from(pulled, 'base64')).toEqual(bytes);
        });

        it('creates missing parent directories automatically', async () => {
            const parentDir = join(tmpdir(), `desktop-nested-${Date.now()}`);
            const filePath = join(parentDir, 'sub', 'dir', 'file.txt');
            cleanup = parentDir;
            await driver.pushFile(filePath, Buffer.from('nested').toString('base64'));
            expect(existsSync(filePath)).toBe(true);
        });

        it('overwrites an existing file', async () => {
            cleanup = join(tmpdir(), `desktop-overwrite-${Date.now()}.txt`);
            writeFileSync(cleanup, 'old content', 'utf8');
            await driver.pushFile(cleanup, Buffer.from('new content').toString('base64'));
            const pulled = await driver.pullFile(cleanup);
            expect(Buffer.from(pulled, 'base64').toString('utf8')).toBe('new content');
        });
    });

    // ─── pullFile ────────────────────────────────────────────────────────────

    describe('pullFile', () => {
        let cleanup: string = '';

        afterEach(() => {
            if (cleanup && existsSync(cleanup)) {
                try { rmSync(cleanup); } catch { /* noop */ }
            }
            cleanup = '';
        });

        it('returns the base64-encoded content of an existing file', async () => {
            cleanup = join(tmpdir(), `desktop-pull-${Date.now()}.txt`);
            const content = 'pull this!';
            writeFileSync(cleanup, content, 'utf8');
            const result = await driver.pullFile(cleanup);
            expect(Buffer.from(result, 'base64').toString('utf8')).toBe(content);
        });

        it('result is a valid base64 string', async () => {
            cleanup = join(tmpdir(), `desktop-b64-${Date.now()}.txt`);
            writeFileSync(cleanup, 'base64 check', 'utf8');
            const result = await driver.pullFile(cleanup);
            expect(() => Buffer.from(result, 'base64')).not.toThrow();
        });

        it('throws when the file does not exist', async () => {
            const missing = join(tmpdir(), `desktop-missing-${Date.now()}.txt`);
            await expect(driver.pullFile(missing)).rejects.toThrow();
        });
    });
});
