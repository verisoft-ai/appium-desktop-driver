import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';
import {
    APPIUM_SERVER,
    JAVAW_EXE_PATH,
    JAVA_SWING_FORM_CLASSPATH,
    NOTEPAD_APP_PATH,
    launchJavaSwingFormExternally,
    createJavaSwingAttachSession,
    quitSession,
} from './helpers/session.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function killProc(proc: ChildProcess | null): void {
    try { proc?.kill(); } catch { /* already exited */ }
}

// ─── Path A: appTopLevelWindow + javaSwing (session-time attach) ──────────────

describe('Java Swing — appTopLevelWindow + javaSwing attach', () => {
    let driver: Browser;
    let javaProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchJavaSwingFormExternally();
        javaProc = launched.proc;
        driver = await createJavaSwingAttachSession(launched.hwnd);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(javaProc);
    });

    it('getPageSource returns Java element tree', async () => {
        const source = await driver.getPageSource();
        expect(source).toContain('submitButton');
        expect(source).toContain('firstName');
        expect(source).toContain('Button');
    });

    it('finds firstName field by accessibility id', async () => {
        const el = await driver.$('~firstName');
        expect(await el.isExisting()).toBe(true);
    });

    it('finds lastName field by accessibility id', async () => {
        const el = await driver.$('~lastName');
        expect(await el.isExisting()).toBe(true);
    });

    it('finds submitButton by accessibility id', async () => {
        const el = await driver.$('~submitButton');
        expect(await el.isExisting()).toBe(true);
    });

    it('finds elements by XPath', async () => {
        const fields = await driver.$$('//Edit');
        expect(fields.length).toBeGreaterThanOrEqual(3);
    });

    it('sets and reads text field value', async () => {
        const field = await driver.$('~lastName');
        await field.setValue('AttachTest');
        expect(await field.getText()).toBe('AttachTest');
    });

    it('clicks agreeCheckbox and toggles state', async () => {
        const cb = await driver.$('~agreeCheckbox');
        const before = await cb.isSelected();
        await cb.click();
        expect(await cb.isSelected()).not.toBe(before);
    });

    it('isEnabled returns true for submitButton', async () => {
        const btn = await driver.$('~submitButton');
        expect(await btn.isEnabled()).toBe(true);
    });

    it('getRect returns positive dimensions', async () => {
        const btn = await driver.$('~submitButton');
        const size = await btn.getSize();
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
    });
});

// ─── Path B: windows: attachJavaSwing (post-session attach) ──────────────────

describe('Java Swing — windows: attachJavaSwing post-session', () => {
    let driver: Browser;
    let javaProc: ChildProcess;

    beforeAll(async () => {
        const launched = await launchJavaSwingFormExternally();
        javaProc = launched.proc;

        // Create session pointing at the window but WITHOUT javaSwing — plain UIA attach
        driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:appTopLevelWindow': launched.hwnd,
                'appium:shouldCloseApp': false,
            } as WebdriverIO.Capabilities,
        });
        await driver.setTimeout({ implicit: 3000 });

        // Now inject the Java agent post-session
        await driver.executeScript('windows: attachJavaSwing', []);
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(javaProc);
    });

    it('getPageSource contains Java element tree after post-session attach', async () => {
        const source = await driver.getPageSource();
        expect(source).toContain('submitButton');
        expect(source).toContain('firstName');
    });

    it('finds firstName field by accessibility id after attach', async () => {
        const el = await driver.$('~firstName');
        expect(await el.isExisting()).toBe(true);
    });

    it('finds submitButton after attach', async () => {
        const el = await driver.$('~submitButton');
        expect(await el.isExisting()).toBe(true);
    });

    it('can interact with elements after attach', async () => {
        const field = await driver.$('~lastName');
        await field.setValue('PostAttach');
        expect(await field.getText()).toBe('PostAttach');
    });
});

// ─── Path C: existing launch path regression ──────────────────────────────────

describe('Java Swing — existing -javaagent launch path (regression)', () => {
    let driver: Browser;

    beforeAll(async () => {
        // Original flow: Appium launches the JVM and injects -javaagent at startup
        driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:app': JAVAW_EXE_PATH,
                'appium:appArguments': `-cp ${JAVA_SWING_FORM_CLASSPATH} TestForm`,
                'appium:javaSwing': true,
            } as WebdriverIO.Capabilities,
        });
        await driver.setTimeout({ implicit: 3000 });
    }, 30_000);

    afterAll(async () => {
        await quitSession(driver);
    });

    it('getPageSource returns Java element tree via launch path', async () => {
        const source = await driver.getPageSource();
        expect(source).toContain('submitButton');
        expect(source).toContain('firstName');
    });

    it('finds firstName field via launch path', async () => {
        const el = await driver.$('~firstName');
        expect(await el.isExisting()).toBe(true);
    });

    it('can interact via launch path', async () => {
        const field = await driver.$('~email');
        await field.setValue('regression@test.com');
        expect(await field.getText()).toBe('regression@test.com');
    });
});

// ─── Path D: root session → launch external → switchToWindow → attachJavaSwing ─

describe('Java Swing — root session, launch external, switchToWindow, then attachJavaSwing', () => {
    let driver: Browser;
    let javaProc: ChildProcess;

    beforeAll(async () => {
        // 1. Session starts at desktop root — no specific app or window
        driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:app': 'Root',
                'appium:shouldCloseApp': false,
            } as WebdriverIO.Capabilities,
        });
        await driver.setTimeout({ implicit: 5000 });

        // 2. Launch the Java app externally (simulates the user's workflow)
        const launched = await launchJavaSwingFormExternally();
        javaProc = launched.proc;

        // 3. Switch session context to the Java window
        const hexHwnd = `0x${parseInt(launched.hwnd, 10).toString(16).padStart(8, '0')}`;
        await driver.switchToWindow(hexHwnd);

        // 4. Inject Java agent post-session (the path the coworker used)
        await driver.executeScript('windows: attachJavaSwing', []);
    }, 45_000);

    afterAll(async () => {
        await quitSession(driver);
        killProc(javaProc);
    });

    it('getPageSource contains Java element tree after root→switch→attach', async () => {
        const source = await driver.getPageSource();
        expect(source).toContain('submitButton');
        expect(source).toContain('firstName');
    });

    it('finds lastName field by accessibility id', async () => {
        const el = await driver.$('~lastName');
        expect(await el.isExisting()).toBe(true);
    });

    it('fills in lastName and reads it back', async () => {
        const field = await driver.$('~lastName');
        await field.setValue('RootAttachTest');
        expect(await field.getText()).toBe('RootAttachTest');
    });
});

// ─── Path F: error cases ─────────────────────────────────────────────────────

describe('Java Swing — error cases', () => {
    it('javaSwing:true with no appTopLevelWindow and no app throws', async () => {
        await expect(
            remote({
                ...APPIUM_SERVER,
                capabilities: {
                    platformName: 'Windows',
                    'appium:automationName': 'DesktopDriver',
                    'appium:app': 'root',
                    'appium:javaSwing': true,
                } as WebdriverIO.Capabilities,
            })
        ).rejects.toThrow();
    });

    it('attachJavaSwing on a non-Java window includes diagnostics in the error', async () => {
        // Use Notepad — a native Win32 app with no JVM
        const driver = await remote({
            ...APPIUM_SERVER,
            capabilities: {
                platformName: 'Windows',
                'appium:automationName': 'DesktopDriver',
                'appium:app': NOTEPAD_APP_PATH,
            } as WebdriverIO.Capabilities,
        });

        try {
            await expect(
                driver.executeScript('windows: attachJavaSwing', [])
            ).rejects.toSatisfy((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                // Diagnostic block must be present
                expect(msg).toContain('attachJavaSwing diagnostics');
                // Must include window/process info
                expect(msg).toMatch(/hwnd\s*:/i);
                expect(msg).toMatch(/pid\s*:/i);
                expect(msg).toMatch(/process\s*:/i);
                // Must include JVM env vars section
                expect(msg).toContain('JAVA_HOME');
                expect(msg).toContain('JAVA_TOOL_OPTIONS');
                return true;
            });
        } finally {
            await quitSession(driver);
        }
    });
});
