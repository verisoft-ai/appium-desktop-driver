import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import { createWinformComboSession, quitSession } from './helpers/session.js';
import { isNumLockOn, setNumLockState } from '../../lib/winapi/user32.js';
import { Key } from '../../lib/enums.js';

// Proves the SendInput KEYEVENTF_EXTENDEDKEY fix (lib/winapi/user32.ts
// isExtendedKeyVk) against a receiver we fully control: the test app's
// WndProc reads WM_KEYDOWN's lParam bit 24 directly (a real legacy
// WinForms/MFC idiom), the same field the driver's Down key used to send as
// 0. This doesn't depend on any third-party control's undocumented
// behavior — Notepad, for contrast, ignores that bit entirely and can't
// distinguish fixed from unfixed code (see git history on actions.e2e.ts).
//
// windows: keys' virtualKeyCode path (executeKeys -> sendKeyboardEvents)
// bypasses isExtendedKeyVk entirely and sends a raw, unflagged VK — used
// here as a deliberately *unfixed* control case, next to app.keys() which
// goes through the real, fixed keyDown/keyUp path.
//
// Empirically (verified with full keyboard-message tracing in the test
// app), an unflagged VK_DOWN with NumLock ON is not redelivered as
// VK_NUMPAD2 on this OS build — it's dropped before any WM_KEYDOWN/WM_CHAR
// reaches the app at all. So the observable signal is "Down never
// registers" (counter stays 0), not "a stray 2 gets typed."
describe('extended-key SendInput flag (WM_KEYDOWN lParam bit 24)', () => {
    let app: Browser;
    let wasNumLockOn: boolean;

    beforeAll(() => {
        wasNumLockOn = isNumLockOn();
    });

    afterAll(() => {
        setNumLockState(wasNumLockOn);
    });

    beforeEach(async () => {
        app = await createWinformComboSession();
        // Click into the app to guarantee real OS keyboard focus before
        // sending raw SendInput-based keys — session creation alone doesn't
        // promise the window has actually taken focus yet.
        await (await app.$('~txtLog')).click();
    });

    afterEach(async () => {
        await quitSession(app);
    });

    it('raw unflagged VK_DOWN + NumLock OFF: registers as a real key', async () => {
        setNumLockState(false);

        await app.executeScript('windows: keys', [{ actions: { virtualKeyCode: 0x28 }, forceUnicode: false }]);
        await app.pause(200);

        const counter = await app.$('~lblRealDownCount');
        expect(await counter.getText()).toBe('Real Down received: 1');
    });

    it('raw unflagged VK_DOWN + NumLock ON: reproduces the bug — Down never registers', async () => {
        setNumLockState(true);
        // GetKeyState only refreshes once the target process's UI thread
        // pumps a message after the toggle. The toggle's own SendInput call
        // can also disturb OS foreground focus, so re-click afterward.
        await app.pause(300);
        await (await app.$('~txtLog')).click();
        await app.pause(100);

        await app.executeScript('windows: keys', [{ actions: { virtualKeyCode: 0x28 }, forceUnicode: false }]);
        await app.pause(200);

        const counter = await app.$('~lblRealDownCount');
        expect(await counter.getText()).toBe('Real Down received: 0');
    });

    it('driver Down key (fixed, extended flag set) + NumLock ON: registers as a real key', async () => {
        setNumLockState(true);
        await app.pause(300);
        await (await app.$('~txtLog')).click();
        await app.pause(100);

        await app.keys([Key.DOWN]);
        await app.pause(200);

        const counter = await app.$('~lblRealDownCount');
        expect(await counter.getText()).toBe('Real Down received: 1');
    });
});
