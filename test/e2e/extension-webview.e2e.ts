/**
 * E2E tests for WebView/CDP context switching.
 *
 * Uses Chrome launched with --remote-debugging-port to expose a CDP endpoint.
 * Requires Chrome installed at the default path on the test machine.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { quitSession, closeAllTestApps, createChromeWebviewSession } from './helpers/session.js';

/** Switch to the first WEBVIEW_ context; throws if none found. */
async function switchToFirstWebview(driver: Browser): Promise<string> {
    const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
    const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))?.id;
    if (!webviewId) {throw new Error('No WEBVIEW_ context found');}
    await driver.switchContext(webviewId);
    return webviewId;
}

describe('Chrome WebView context support', () => {
    let driver: Browser;

    beforeEach(async () => {
        closeAllTestApps();
        driver = await createChromeWebviewSession();
        // Give Chrome time to finish loading the page
        await driver.pause(3000);
    });

    afterEach(async () => {
        await quitSession(driver);
    });

    it('getCurrentContext returns NATIVE_APP initially', async () => {
        const ctx = await driver.getContext();
        expect(ctx).toBe('NATIVE_APP');
    });

    it('getContexts includes NATIVE_APP and at least one WEBVIEW_ entry', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string; title?: string; url?: string }>;
        const ids = contexts.map((c) => c.id);

        expect(ids).toContain('NATIVE_APP');
        expect(ids.some((id) => id.startsWith('WEBVIEW_'))).toBe(true);
    });

    it('mobile:getContexts returns title and url metadata for webview pages', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string; title?: string; url?: string }>;
        const webview = contexts.find((c) => c.id.startsWith('WEBVIEW_'));

        expect(webview).toBeDefined();
        expect(typeof webview!.title).toBe('string');
        expect(typeof webview!.url).toBe('string');
        expect(webview!.url).toContain('example.com');
    });

    it('switches to Chrome webview context and executes JavaScript', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);
        expect(await driver.getContext()).toBe(webviewId);

        const title = await driver.execute('return document.title') as string;
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);

        const url = await driver.execute('return window.location.href') as string;
        expect(url).toContain('example.com');
    });

    it('finds element by CSS selector inside Chrome webview', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);

        const h1 = await driver.$('h1');
        expect(await h1.isExisting()).toBe(true);
        const text = await h1.getText();
        expect(text.length).toBeGreaterThan(0);
    });

    it('finds element by XPath inside Chrome webview', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);

        const h1 = await driver.$('//h1');
        expect(await h1.isExisting()).toBe(true);
        const text = await h1.getText();
        expect(text.length).toBeGreaterThan(0);
    });

    it('can interact with elements inside Chrome webview', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);

        const body = await driver.$('body');
        await body.click();
        expect(await body.isDisplayed()).toBe(true);
    });

    it('switches back to NATIVE_APP after entering webview context', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);
        await driver.switchContext('NATIVE_APP');

        expect(await driver.getContext()).toBe('NATIVE_APP');
    });

    it('executes JS mutation inside webview and reads it back', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);

        await driver.execute("document.body.setAttribute('data-test', 'appium-webview2')");
        const attr = await driver.execute("return document.body.getAttribute('data-test')") as string;
        expect(attr).toBe('appium-webview2');
    });

    it('windows: execute commands work in webview context (routed to UIA, not Chromedriver)', async () => {
        await switchToFirstWebview(driver);

        // windows:getDeviceTime is in CHROMEDRIVER_NO_PROXY — must still reach UIA handler
        const time = await driver.execute('windows: getDeviceTime', [{}]) as string;
        expect(typeof time).toBe('string');
        expect(time.length).toBeGreaterThan(0);
    });

    it('powerShell script still works in webview context', async () => {
        await switchToFirstWebview(driver);

        const result = await driver.executeScript('powerShell', [{ script: 'Write-Output "hello"' }]) as string;
        expect(result.trim()).toBe('hello');
    });

    it('explicit webviewDevtoolsPort cap works', async () => {
        await quitSession(driver);
        closeAllTestApps();

        driver = await createChromeWebviewSession({ 'appium:webviewDevtoolsPort': 10950 });
        await driver.pause(3000);

        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        expect(contexts.some((c) => c.id.startsWith('WEBVIEW_'))).toBe(true);
    });

    it('setContext throws for unknown context name', async () => {
        await expect(driver.switchContext('WEBVIEW_doesnotexist')).rejects.toThrow();
    });

    it('switching between two webview sessions tears down previous Chromedriver', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewIds = contexts.filter((c) => c.id.startsWith('WEBVIEW_')).map((c) => c.id);

        if (webviewIds.length >= 2) {
            await driver.switchContext(webviewIds[0]);
            expect(await driver.getContext()).toBe(webviewIds[0]);
            // Switch to second page — previous Chromedriver must be stopped, new one started
            await driver.switchContext(webviewIds[1]);
            expect(await driver.getContext()).toBe(webviewIds[1]);
        } else {
            // Only one page: switch away and back — exercises stop+restart path
            await driver.switchContext(webviewIds[0]);
            await driver.switchContext('NATIVE_APP');
            await driver.switchContext(webviewIds[0]);
            expect(await driver.getContext()).toBe(webviewIds[0]);
        }

        await driver.switchContext('NATIVE_APP');
        expect(await driver.getContext()).toBe('NATIVE_APP');
    });
});

describe('WebView disabled (webviewEnabled: false)', () => {
    let driver: Browser;

    beforeEach(async () => {
        closeAllTestApps();
        driver = await createChromeWebviewSession({ 'appium:webviewEnabled': false });
        await driver.pause(1000);
    });

    afterEach(async () => {
        await quitSession(driver);
    });

    it('getContexts throws with clear error when webviewEnabled is false', async () => {
        await expect(
            driver.execute('mobile: getContexts', [{}])
        ).rejects.toThrow(/webviewEnabled/i);
    });

    it('getContext returns NATIVE_APP even when webviewEnabled is false', async () => {
        const ctx = await driver.getContext();
        expect(ctx).toBe('NATIVE_APP');
    });
});
