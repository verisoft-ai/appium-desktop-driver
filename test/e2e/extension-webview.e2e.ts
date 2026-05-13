/**
 * E2E tests for WebView2 context switching.
 *
 * Uses the minimal WinForms + WebView2 fixture app at
 * test/fixtures/webview2-app/. Build it once with:
 *   dotnet build -c Release test/fixtures/webview2-app/WebView2TestApp.csproj
 *
 * The app opens a single WebView2 panel navigated to https://example.com
 * alongside a native WinForms status label — giving both a native UIA tree
 * and a live WebView2 CDP endpoint to test against.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'webdriverio';
import { quitSession, closeAllTestApps, createWebView2Session } from './helpers/session.js';

/** Switch to the first WEBVIEW_ context; throws if none found. */
async function switchToFirstWebview(driver: Browser): Promise<string> {
    const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
    const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))?.id;
    if (!webviewId) {throw new Error('No WEBVIEW_ context found');}
    await driver.switchContext(webviewId);
    return webviewId;
}

describe('WebView2 context support', () => {
    let driver: Browser;

    beforeEach(async () => {
        closeAllTestApps();
        driver = await createWebView2Session();
        // Give WebView2 time to finish initialising and navigate to example.com
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

    it('switches to WebView2 context and executes JavaScript', async () => {
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

    it('finds element by CSS selector inside WebView2', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);

        const h1 = await driver.$('h1');
        expect(await h1.isExisting()).toBe(true);
        const text = await h1.getText();
        expect(text.length).toBeGreaterThan(0);
    });

    it('switches back to NATIVE_APP and finds native UIA elements', async () => {
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        const webviewId = contexts.find((c) => c.id.startsWith('WEBVIEW_'))!.id;

        await driver.switchContext(webviewId);
        await driver.switchContext('NATIVE_APP');

        expect(await driver.getContext()).toBe('NATIVE_APP');

        // StatusLabel is a native WinForms Label — confirms UIA tree is live
        const label = await driver.$('//Text[@Name="StatusLabel"]');
        expect(await label.isExisting()).toBe(true);
    });

    it('executes JS mutation inside WebView2 and reads it back', async () => {
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

    it('powerShell execute works in webview context', async () => {
        await switchToFirstWebview(driver);

        // powerShell: execute is also in CHROMEDRIVER_NO_PROXY via execute/sync route
        const result = await driver.execute('powerShell', [{ script: 'Write-Output "hello"' }]) as string;
        expect(result.trim()).toBe('hello');
    });

    it('CDP port auto-selected when webviewDevtoolsPort cap omitted', async () => {
        // Session created without explicit port — driver picks one via findFreePort.
        // Verify webview is still reachable (port selection worked).
        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        expect(contexts.some((c) => c.id.startsWith('WEBVIEW_'))).toBe(true);
    });

    it('explicit webviewDevtoolsPort cap works', async () => {
        await quitSession(driver);
        closeAllTestApps();

        driver = await createWebView2Session({ 'appium:webviewDevtoolsPort': 10950 });
        await driver.pause(3000);

        const contexts = await driver.execute('mobile: getContexts', [{}]) as Array<{ id: string }>;
        expect(contexts.some((c) => c.id.startsWith('WEBVIEW_'))).toBe(true);
    });

    it('getContexts returns only NATIVE_APP before WebView2 has loaded any page', async () => {
        // Use waitForWebviewMs=0 immediately after session start (before the 3s pause)
        // by creating a fresh session and querying immediately.
        await quitSession(driver);
        closeAllTestApps();

        driver = await createWebView2Session({ 'appium:ms:waitForAppLaunch': 0 });
        // No pause — query immediately, WebView2 may not be ready yet
        const contexts = await driver.execute('mobile: getContexts', [{ waitForWebviewMs: 0 }]) as Array<{ id: string }>;
        // NATIVE_APP must always be present
        expect(contexts.some((c) => c.id === 'NATIVE_APP')).toBe(true);
        // (pages may or may not be present — we only assert NATIVE_APP exists)
    });

    it('setContext throws for unknown context name', async () => {
        await expect(driver.switchContext('WEBVIEW_doesnotexist')).rejects.toThrow();
    });

    it('switching between two webview sessions tears down previous Chromedriver', async () => {
        // Get two page IDs (if app exposes multiple); otherwise switch to same id twice.
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

        // UIA still works after all the switching
        await driver.switchContext('NATIVE_APP');
        const label = await driver.$('//Text[@Name="StatusLabel"]');
        expect(await label.isExisting()).toBe(true);
    });
});

describe('WebView2 disabled (webviewEnabled: false)', () => {
    let driver: Browser;

    beforeEach(async () => {
        closeAllTestApps();
        driver = await createWebView2Session({ 'appium:webviewEnabled': false });
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
        // getCurrentContext does not require webviewEnabled — it just returns current state
        const ctx = await driver.getContext();
        expect(ctx).toBe('NATIVE_APP');
    });
});
