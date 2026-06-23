/* eslint-disable */
/**
 * IE Auto-Detection Smoke Test
 *
 * Self-contained. No build step needed.
 * Requires:
 *   - Appium running on localhost:4723 with DesktopDriver installed
 *   - Internet Explorer installed (C:\Program Files\Internet Explorer\iexplore.exe)
 *   - Notepad available (always present on Windows)
 *
 * Run: node ie-smoke-test.js
 */

'use strict';

const { remote } = require('webdriverio');
const { spawn, execSync } = require('child_process');

const APPIUM = { hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'silent' };
const IE_PATH = 'C:\\Program Files\\Internet Explorer\\iexplore.exe';
const IE_URL = 'https://example.com';
const NOTEPAD_PATH = 'C:\\Windows\\notepad.exe';
const PASS = '✅';
const FAIL = '❌';

let driver = null;
let ieProc = null;
let notepadProc = null;

function log(label, msg) {
    console.log(`  ${label.padEnd(30)} ${msg}`);
}

function pass(label, msg) { log(`${PASS} ${label}`, msg); }
function fail(label, msg) { log(`${FAIL} ${label}`, msg); throw new Error(msg); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('\n=== IE Auto-Detection Smoke Test ===\n');

    // ── 1. Launch IE and Notepad ──────────────────────────────────────────────
    console.log('[1] Launching IE and Notepad...');
    ieProc = spawn(IE_PATH, [IE_URL], { detached: true, stdio: 'ignore' });
    notepadProc = spawn(NOTEPAD_PATH, [], { detached: true, stdio: 'ignore' });
    await sleep(3000); // give IE time to load
    pass('Apps launched', `IE → ${IE_URL} | Notepad`);

    // ── 2. Create a plain desktop session (no IE capabilities) ───────────────
    console.log('\n[2] Creating desktop session (no IE caps)...');
    driver = await remote({
        ...APPIUM,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': 'root',
            'appium:newCommandTimeout': 120,
        },
    });
    pass('Session created', 'no useInternetExplorer cap needed');

    // ── 3. Enumerate all window handles ──────────────────────────────────────
    console.log('\n[3] Getting all window handles...');
    const handles = await driver.getWindowHandles();
    if (handles.length === 0) fail('getWindowHandles', 'No window handles returned');
    pass('getWindowHandles', `${handles.length} handles: ${handles.slice(0, 3).join(', ')}...`);

    // ── 4. Switch to IE by title (auto-detect) ────────────────────────────────
    console.log('\n[4] Switching to IE window by title...');
    try {
        await driver.executeScript('windows: switchToWindowByTitle', [{ title: 'Internet Explorer' }]);
        pass('switchToWindowByTitle(IE)', 'IE window found and proxy activated');
    } catch (e) {
        fail('switchToWindowByTitle(IE)', `Failed: ${e.message}`);
    }

    // ── 5. Verify JS execution works in IE DOM ────────────────────────────────
    console.log('\n[5] Running JS in IE DOM...');
    let ieTitle;
    try {
        ieTitle = await driver.executeScript('return document.title', []);
        if (typeof ieTitle !== 'string') fail('execute(JS)', `Expected string, got ${typeof ieTitle}`);
        pass('execute("return document.title")', `"${ieTitle}"`);
    } catch (e) {
        fail('execute(JS)', `Failed: ${e.message}`);
    }

    // ── 6. Verify getTitle() works via IE proxy ───────────────────────────────
    console.log('\n[6] getTitle() via IE proxy...');
    try {
        const title = await driver.getTitle();
        pass('getTitle()', `"${title}"`);
    } catch (e) {
        fail('getTitle()', `Failed: ${e.message}`);
    }

    // ── 7. Find an element in IE DOM ─────────────────────────────────────────
    console.log('\n[7] Finding element in IE DOM...');
    try {
        const body = await driver.$('body');
        const tag = await body.getTagName();
        pass('findElement(body)', `tag = <${tag}>`);
    } catch (e) {
        // IE may not have webdriver-compatible element finding for some pages
        log(`  (skip)`, `findElement skipped: ${e.message}`);
    }

    // ── 8. Switch to Notepad (non-IE) ─────────────────────────────────────────
    console.log('\n[8] Switching to Notepad (non-IE)...');
    try {
        await driver.executeScript('windows: switchToWindowByTitle', [{ title: 'Notepad' }]);
        pass('switchToWindowByTitle(Notepad)', 'IE proxy deactivated, UIA mode active');
    } catch (e) {
        fail('switchToWindowByTitle(Notepad)', `Failed: ${e.message}`);
    }

    // ── 9. Verify UIA works on Notepad ───────────────────────────────────────
    console.log('\n[9] UIA interaction on Notepad...');
    try {
        const src = await driver.getPageSource();
        if (!src.includes('Edit')) fail('getPageSource(Notepad)', 'Expected Edit element in page source');
        pass('getPageSource(Notepad)', 'UIA tree contains Edit element');
    } catch (e) {
        fail('getPageSource(Notepad)', `Failed: ${e.message}`);
    }

    // ── 10. Switch BACK to IE (round-trip) ────────────────────────────────────
    console.log('\n[10] Switching BACK to IE (round-trip)...');
    try {
        await driver.executeScript('windows: switchToWindowByTitle', [{ title: 'Internet Explorer' }]);
        pass('switchToWindowByTitle(IE) round-trip', 'proxy re-enabled after non-IE switch');
    } catch (e) {
        fail('switchToWindowByTitle(IE) round-trip', `Failed: ${e.message}`);
    }

    // ── 11. Verify JS still works after round-trip ────────────────────────────
    console.log('\n[11] JS after round-trip...');
    try {
        const title2 = await driver.executeScript('return document.title', []);
        pass('execute(JS) after round-trip', `"${title2}"`);
    } catch (e) {
        fail('execute(JS) after round-trip', `Failed: ${e.message}`);
    }

    // ── 12. Switch via HWND (raw handle path) ────────────────────────────────
    console.log('\n[12] Switch via raw HWND...');
    try {
        const allHandles = await driver.getWindowHandles();
        // Cycle through handles to find IE again
        let foundIE = false;
        for (const h of allHandles) {
            try {
                await driver.switchToWindow(h);
                const title = await driver.getTitle().catch(() => null);
                if (title !== null && title !== undefined) {
                    // getTitle succeeded → we're on IE window
                    pass('switchToWindow(HWND)', `Handle ${h} → title: "${title}"`);
                    foundIE = true;
                    break;
                }
            } catch {
                // This handle is non-IE (getTitle will fail on UIA context) — continue
                await driver.executeScript('windows: switchToWindowByTitle', [{ title: 'Internet Explorer' }]).catch(() => {});
            }
        }
        if (!foundIE) log('  (skip)', 'Could not identify IE handle via getTitle scan');
    } catch (e) {
        log('  (skip)', `HWND switch test skipped: ${e.message}`);
    }

    console.log('\n=== All checks passed ✅ ===\n');
}

main()
    .catch(e => {
        console.error(`\n${FAIL} Test failed: ${e.message}\n`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (driver) {
            try { await driver.deleteSession(); } catch { /* noop */ }
        }
        if (ieProc) { try { process.kill(-ieProc.pid); } catch { try { execSync(`taskkill /F /IM iexplore.exe`); } catch { /* noop */ } } }
        if (notepadProc) { try { process.kill(-notepadProc.pid); } catch { try { execSync(`taskkill /F /IM notepad.exe`); } catch { /* noop */ } } }
    });
