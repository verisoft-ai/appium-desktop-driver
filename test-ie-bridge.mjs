#!/usr/bin/env node
/**
 * IE Bridge smoke test
 *
 * Prerequisites:
 *   - Appium running on localhost:4723 with appium-desktop-driver installed
 *   - Internet Explorer 11 installed
 *
 * Usage:
 *   node test-ie-bridge.js
 */

import { remote } from 'webdriverio';

const TEST_URL = 'https://example.com';
const IE_EXE   = 'C:\\Program Files\\Internet Explorer\\iexplore.exe';

const driver = await remote({
    hostname: 'localhost',
    port:     4723,
    capabilities: {
        platformName:            'Windows',
        'appium:automationName': 'DesktopDriver',
        'appium:app':            IE_EXE,
        'appium:appArguments':   TEST_URL,
    },
});

try {
    console.log('[1] Waiting 3 s for page load…');
    await driver.pause(3000);

    console.log('[2] Getting title');
    const title = await driver.getTitle();
    console.log(`    title = "${title}"`);
    assert(title.length > 0, 'title is empty');

    console.log('[3] Getting URL');
    const url = await driver.getUrl();
    console.log(`    url = "${url}"`);
    assert(url.startsWith('http'), 'url does not start with http');

    console.log('[4] Finding <h1>');
    const h1 = await driver.$('h1');
    const text = await h1.getText();
    console.log(`    h1 text = "${text}"`);
    assert(text.length > 0, 'h1 text is empty');

    console.log('[5] Navigating to https://example.org');
    await driver.url('https://example.org');
    await driver.pause(2000);
    const title2 = await driver.getTitle();
    console.log(`    title after navigate = "${title2}"`);
    assert(title2.length > 0, 'title2 is empty');

    console.log('\n✓ All assertions passed — IE bridge is working.');
} finally {
    await driver.deleteSession();
}

function assert(cond, msg) {
    if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
