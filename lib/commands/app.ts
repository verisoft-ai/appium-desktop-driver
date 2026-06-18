import { normalize } from 'node:path';
import { Element, Rect } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';
import { propertyCondition, trueCondition } from '../server/conditions';
import type { RectResult } from '../server/protocol';
import { sleep } from '../util';
import { errors, W3C_ELEMENT_KEY } from '@appium/base-driver';
import {
    getAllWindowHandles,
    getVisibleWindowsWithTitles,
    getWindowAllHandlesForProcessIds,
    keyDown,
    keyUp,
    trySetForegroundWindow,
} from '../winapi/user32';
import { Key } from '../enums';

/**
 * Polling interval used when waiting for windows/elements to appear during
 * app launch and window switching.
 *
 * This is deliberately kept low (200ms) because the app launch flow has
 * multiple sequential retry phases that each sleep on failure:
 *
 *   changeRootElement (outer loop)
 *     → attachToApplicationWindow
 *       → waitForNewWindow  (polls for Win32 window handle)
 *       → findElement loop  (polls UIAutomation tree for the element)
 *
 * At 500ms per poll, 10 failed attempts in any one phase cost 5 seconds,
 * and the phases compound. At 200ms the same 10 attempts cost 2 seconds,
 * cutting overall launch latency from 10-15s down to ~3-5s for typical
 * UWP apps like Calculator.
 */
const POLL_INTERVAL_MS = 200;

/**
 * Maximum number of polling attempts per retry phase.
 * Combined with POLL_INTERVAL_MS this gives a ~6s window per phase,
 * which is enough for most apps to register in the UIAutomation tree.
 */
const MAX_POLL_ATTEMPTS = 30;

// setWindow is called often during a session. If a handle doesn't exist,
// we fail fast (~400ms) instead of waiting 6s. Session-attach loops below
// still use MAX_POLL_ATTEMPTS.
const SET_WINDOW_MAX_POLL_ATTEMPTS = 2;

/**
 * Normalizes the `ms:waitForAppLaunch` capability to milliseconds.
 *
 * WinAppDriver's spec says the value is in seconds (max 50), but many users
 * pass milliseconds (e.g. 120000 meaning "120 seconds"). We auto-detect:
 * values > 120 are assumed to already be in milliseconds; values ≤ 120 are
 * treated as seconds and converted to ms.
 */
function normalizeWaitForAppLaunchMs(raw: number | undefined): number {
    if (raw == null || raw <= 0) {return 0;}
    // Values > 120 are almost certainly milliseconds (120 seconds is already very generous;
    // WinAppDriver caps at 50s). Values ≤ 120 are seconds per the original spec.
    return raw > 120 ? raw : raw * 1000;
}

export async function getPageSource(this: AppiumDesktopDriver): Promise<string> {
    return await this.sendCommand('getPageSource', {}) as string;
}

export async function getScreenshot(this: AppiumDesktopDriver): Promise<string> {
    const automationRootId = await this.sendCommand('saveRootElementToTable', {}) as string;

    if (this.caps.app && this.caps.app.toLowerCase() !== 'root') {
        try {
            await this.focusElement({
                [W3C_ELEMENT_KEY]: automationRootId?.trim(),
            } satisfies Element);
        } catch {
            // noop
        }
    }

    return await this.sendCommand('getScreenshot', {}) as string;
}

export async function getWindowRect(this: AppiumDesktopDriver): Promise<Rect> {
    return await this.sendCommand('getRootRect', {}) as RectResult;
}

export async function getWindowHandle(this: AppiumDesktopDriver): Promise<string> {
    const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
    const nativeWindowHandle = await this.sendCommand('getProperty', { elementId: rootId, property: 'NativeWindowHandle' }) as string;
    return `0x${Number(nativeWindowHandle).toString(16).padStart(8, '0')}`;
}

export async function getWindowHandles(this: AppiumDesktopDriver): Promise<string[]> {
    const elIds = await this.sendCommand('findElements', {
        scope: 'children',
        condition: trueCondition(),
        contextElementId: null,
    }) as string[];

    const nativeWindowHandles: string[] = [];

    for (const elId of elIds ?? []) {
        const nativeWindowHandle = await this.sendCommand('getProperty', { elementId: elId, property: 'NativeWindowHandle' }) as string;
        nativeWindowHandles.push(`0x${Number(nativeWindowHandle).toString(16).padStart(8, '0')}`);
    }

    return nativeWindowHandles;
}

export async function setWindow(this: AppiumDesktopDriver, nameOrHandle: string): Promise<void> {
    const handle = Number(nameOrHandle);
    for (let i = 1; i <= SET_WINDOW_MAX_POLL_ATTEMPTS; i++) {
        if (!isNaN(handle)) {
            // Use ElementFromHandle directly — bypasses live-root tree search so
            // sequential switchToWindow calls work regardless of prior switches.
            try {
                const elementId = await this.sendCommand('setRootElementFromHandle', { handle }) as string | null;
                if (elementId && elementId.trim() !== '') {
                    trySetForegroundWindow(handle);
                    return;
                }
            } catch {
                // fall through to retry
            }
        } else {
            const name = nameOrHandle;
            const elementId = await this.sendCommand('findElement', {
                scope: 'children',
                condition: propertyCondition('Name', name),
                contextElementId: null,
            }) as string | null;

            if (elementId && elementId.trim() !== '') {
                this.log.info(`Found window with name '${name}'. Setting it as the root element.`);
                await this.sendCommand('setRootElementFromElementId', { elementId });
                return;
            }
        }

        this.log.info(`Failed to locate window with name or handle '${nameOrHandle}'. Sleeping for ${POLL_INTERVAL_MS}ms and retrying... (${i}/${SET_WINDOW_MAX_POLL_ATTEMPTS})`);
        await sleep(POLL_INTERVAL_MS);
    }

    throw new errors.NoSuchWindowError(`No window was found with name or handle '${nameOrHandle}'.`);
}

export async function switchToWindowByTitle(
    this: AppiumDesktopDriver,
    args: { title: string; exact?: boolean },
): Promise<void> {
    const { title, exact = false } = args;
    const titleLower = title.toLowerCase();

    for (let i = 1; i <= SET_WINDOW_MAX_POLL_ATTEMPTS; i++) {
        const windows = getVisibleWindowsWithTitles();
        const match = windows.find(({ title: t }) => {
            const tLower = t.toLowerCase();
            return exact ? tLower === titleLower : tLower.includes(titleLower);
        });

        if (match) {
            this.log.info(`Found window with title '${match.title}'. Setting it as the root element.`);
            const elementId = await this.sendCommand('setRootElementFromHandle', { handle: match.handle }) as string | null;
            if (elementId && elementId.trim() !== '') {
                trySetForegroundWindow(match.handle);
                return;
            }
        }

        this.log.info(`Failed to locate window with title '${title}'. Sleeping for ${POLL_INTERVAL_MS}ms and retrying... (${i}/${SET_WINDOW_MAX_POLL_ATTEMPTS})`);
        await sleep(POLL_INTERVAL_MS);
    }

    throw new errors.NoSuchWindowError(`No window was found with title '${title}'.`);
}

export async function closeApp(this: AppiumDesktopDriver): Promise<void> {
    const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
    if (!rootId) {
        throw new errors.NoSuchWindowError('No active app window is found for this session.');
    }
    await this.sendCommand('closeWindow', { elementId: rootId });
    await this.sendCommand('setRootElementNull', {});
}

export async function launchApp(this: AppiumDesktopDriver): Promise<void> {
    if (!this.caps.app || ['root', 'none'].includes(this.caps.app.toLowerCase())) {
        throw new errors.InvalidArgumentError('No app capability is set for this session.');
    }
    await this.changeRootElement(this.caps.app);
}

export async function changeRootElement(this: AppiumDesktopDriver, path: string): Promise<void>
export async function changeRootElement(this: AppiumDesktopDriver, nativeWindowHandle: number): Promise<void>
export async function changeRootElement(this: AppiumDesktopDriver, pathOrNativeWindowHandle: string | number): Promise<void> {
    if (typeof pathOrNativeWindowHandle === 'number') {
        const nativeWindowHandle = pathOrNativeWindowHandle;
        const elementId = await this.sendCommand('setRootElementFromHandle', { handle: nativeWindowHandle }) as string | null;

        if (elementId) {
            trySetForegroundWindow(nativeWindowHandle);
            return;
        }

        throw new errors.UnknownError('Failed to locate top level window with that window handle.');
    }

    const path = pathOrNativeWindowHandle;
    const isUwp = path.includes('!') && path.includes('_') && !(path.includes('/') || path.includes('\\'));
    const waitForAppLaunchMs = normalizeWaitForAppLaunchMs(this.caps['ms:waitForAppLaunch']);

    // When ms:waitForAppLaunch is set, use it as an overall deadline for
    // all retry loops. When not set, fall back to fixed iteration counts.
    const deadline = waitForAppLaunchMs ? Date.now() + waitForAppLaunchMs : null;

    if (isUwp) {
        this.log.debug('Detected app path to be in the UWP format.');

        // Snapshot all visible windows before launch so we can detect new ones.
        // Most UWP apps are hosted in ApplicationFrameHost (Strategy 2 below),
        // but standalone WinUI 3 apps spawn their own top-level window outside
        // ApplicationFrameHost. The snapshot lets us detect that new window
        // without misidentifying pre-existing windows from other apps.
        const handlesBeforeLaunch = new Set(getAllWindowHandles());

        await this.sendCommand('startProcess', {
            path: 'explorer.exe',
            arguments: `shell:AppsFolder\\${path}`,
        });

        // Outer retry loop: polls until the app window is found or the
        // deadline / attempt limit is reached. Each iteration is one
        // POLL_INTERVAL_MS tick — no blind sleep up front.
        for (let i = 1; deadline ? Date.now() < deadline : i <= 10; i++) {
            // Strategy 1: new window detection.
            // For standalone WinUI 3 packaged apps that run in their own process
            // and don't use ApplicationFrameHost. CoreWindow handles are skipped
            // (see attachToWindowHandles) — they are inner UWP content windows
            // that don't support WindowPattern or TransformPattern.
            const newHandles = getAllWindowHandles().filter((h) => !handlesBeforeLaunch.has(h));
            if (newHandles.length > 0) {
                this.log.debug(`Found ${newHandles.length} new window(s) since launch: ${newHandles.map((h) => `0x${h.toString(16).padStart(8, '0')}`).join(', ')}`);
                try {
                    if (await this.attachToWindowHandles(newHandles)) {
                        return;
                    }
                } catch (err) {
                    if (err instanceof Error) {
                        this.log.debug(`New-window strategy failed: ${err.message}`);
                    }
                }
            }

            // Strategy 2: ApplicationFrameHost.
            // Covers the majority of UWP apps hosted in ApplicationFrameWindow.
            // Prefer newly appeared AFH windows to avoid attaching to a
            // pre-existing frame that belongs to a different app.
            const processIds = await this.sendCommand('getProcessIds', { processName: 'ApplicationFrameHost' }) as number[];
            if (processIds.length > 0) {
                const afhHandles = getWindowAllHandlesForProcessIds(processIds);
                const newAfhHandles = afhHandles.filter((h) => !handlesBeforeLaunch.has(h));
                const handlesToTry = newAfhHandles.length > 0 ? newAfhHandles : afhHandles;
                this.log.debug(`ApplicationFrameHost strategy: trying ${handlesToTry.length} handle(s).`);
                try {
                    if (await this.attachToWindowHandles(handlesToTry)) {
                        return;
                    }
                } catch (err) {
                    if (err instanceof Error) {
                        this.log.debug(`ApplicationFrameHost strategy failed: ${err.message}`);
                    }
                }
            }

            this.log.info(`Failed to locate window of the app. Sleeping for ${POLL_INTERVAL_MS}ms and retrying... (attempt ${i})`);
            await sleep(POLL_INTERVAL_MS);
        }
    } else {
        this.log.debug('Detected app path to be in the classic format.');
        const normalizedPath = normalize(path);

        // Snapshot all visible windows before launch so we can detect new ones
        // as a fallback for singleton-delegator processes (e.g. explorer.exe)
        // that exit immediately and transfer their window to an existing process.
        const handlesBeforeLaunch = new Set(getAllWindowHandles());

        const launcherPid = await this.sendCommand('startProcess', {
            path: normalizedPath,
            arguments: this.caps.appArguments ?? null,
            workingDir: this.caps.appWorkingDir ?? null,
            waitForAppLaunchMs: waitForAppLaunchMs || null,
        }) as number | null;

        if (!launcherPid) {
            throw new errors.UnknownError('Process did not start (no PID returned).');
        }

        try {
            const result = await this.attachToApplicationWindow(launcherPid, { deadline });
            if (!result.focused && deadline && Date.now() < deadline) {
                this.log.info('Attached to a window that cannot receive focus (likely a splash screen). Waiting for the main window...');
                await this.waitForMainWindow(result.knownPids, deadline);
            }
            return;
        } catch (err) {
            // Launcher exited before a window appeared in its process tree (singleton
            // delegator pattern — e.g. explorer.exe hands off to an existing process).
            // Fall back to the new-window diff strategy used by the UWP path.
            this.log.info(`PID-based window search failed (${err instanceof Error ? err.message : err}). Falling back to new-window detection.`);
        }

        const remainingMs = deadline ? Math.max(0, deadline - Date.now()) : POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS;
        const fallbackDeadline = Date.now() + remainingMs;
        while (Date.now() < fallbackDeadline) {
            const newHandles = getAllWindowHandles().filter((h) => !handlesBeforeLaunch.has(h));
            if (newHandles.length > 0) {
                this.log.debug(`Singleton-delegator fallback: found ${newHandles.length} new window(s): ${newHandles.map((h) => `0x${h.toString(16).padStart(8, '0')}`).join(', ')}`);
                if (await this.attachToWindowHandles(newHandles)) {
                    return;
                }
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }

    throw new errors.UnknownError('Failed to locate window of the app.');
}

export async function back(this: AppiumDesktopDriver): Promise<void> {
    const rootId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!rootId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    keyDown(Key.ALT);
    keyDown(Key.LEFT);
    keyUp(Key.LEFT);
    keyUp(Key.ALT);
}

export async function forward(this: AppiumDesktopDriver): Promise<void> {
    const rootId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!rootId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    keyDown(Key.ALT);
    keyDown(Key.RIGHT);
    keyUp(Key.RIGHT);
    keyUp(Key.ALT);
}

export async function title(this: AppiumDesktopDriver): Promise<string> {
    const rootId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!rootId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    return await this.sendCommand('getProperty', { elementId: rootId, property: 'Name' }) as string;
}

export async function maximizeWindow(this: AppiumDesktopDriver): Promise<Rect> {
    const elementId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!elementId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    await this.sendCommand('maximizeWindow', { elementId });
    return await this.getWindowRect();
}

export async function minimizeWindow(this: AppiumDesktopDriver): Promise<Rect> {
    const elementId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!elementId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    await this.sendCommand('minimizeWindow', { elementId });
    return await this.getWindowRect();
}

export async function setWindowRect(
    this: AppiumDesktopDriver,
    x: number | null,
    y: number | null,
    width: number | null,
    height: number | null
): Promise<Rect> {
    if (width !== null && width < 0) {
        throw new errors.InvalidArgumentError('width must be a non-negative integer.');
    }
    if (height !== null && height < 0) {
        throw new errors.InvalidArgumentError('height must be a non-negative integer.');
    }

    const elementId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!elementId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }

    // TransformPattern.Move/Resize fail when window is maximized or minimized;
    // restore to normal state first so CanMove/CanResize are true.
    await this.sendCommand('restoreWindow', { elementId });
    if (x !== null && y !== null) {
        await this.sendCommand('moveWindow', { elementId, x, y });
    }
    if (width !== null && height !== null) {
        await this.sendCommand('resizeWindow', { elementId, width, height });
    }

    return await this.getWindowRect();
}

/**
 * Polls for a visible Win32 window in the process tree rooted at launcherPid.
 *
 * On each iteration, discovers children of every known PID via
 * getChildProcessIds and accumulates them so they survive if the launcher
 * exits before the next poll. This lets stub-launcher apps (e.g. the
 * notepad.exe that immediately re-execs the real one in a child process) be
 * detected without waiting out the full timeout on a windowless PID.
 *
 * Returns the HWND of the found window together with all discovered PIDs so
 * the caller can use them for subsequent ProcessId-based searches without a
 * separate getProcessIds round-trip.
 */
export async function waitForNewWindow(this: AppiumDesktopDriver, launcherPid: number, timeout: number): Promise<{ handle: number, knownPids: number[] }> {
    const start = Date.now();
    let attempts = 0;
    const knownPids = new Set<number>([launcherPid]);

    while (Date.now() - start < timeout) {
        for (const pid of [...knownPids]) {
            const childPids = await this.sendCommand('getChildProcessIds', { parentPid: pid }) as number[];
            for (const child of childPids) { knownPids.add(child); }
        }

        const handles = getWindowAllHandlesForProcessIds([...knownPids]);
        if (handles.length > 0) {
            return { handle: handles[handles.length - 1], knownPids: [...knownPids] };
        }

        this.log.debug(`Waiting for the process window to appear... (${++attempts}/${Math.floor(timeout / POLL_INTERVAL_MS)})`);
        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error('Timed out waiting for window.');
}

/**
 * Iterates a list of Win32 window handles, finds the first one whose UIA
 * subtree has at least two keyboard-focusable descendants (indicating it is a
 * real, loaded app window rather than a splash or empty frame), sets it as the
 * session root, and brings it to the foreground.
 *
 * Returns true if a window was successfully attached, false if none qualified.
 */
export async function attachToWindowHandles(
    this: AppiumDesktopDriver,
    handles: number[],
): Promise<boolean> {
    let fallbackElementId = '';

    for (const hwnd of handles) {
        let candidateId = '';
        try {
            candidateId = await this.sendCommand('elementFromHandle', { handle: hwnd }) as string ?? '';
        } catch {
            continue;
        }
        if (!candidateId) { continue; }

        // Skip inner UWP content windows (Windows.UI.Core.CoreWindow) — these are
        // hosted inside an outer ApplicationFrameWindow and should not be the session root.
        const className = await this.sendCommand('getProperty', { elementId: candidateId, property: 'ClassName' }) as string;
        if (className === 'Windows.UI.Core.CoreWindow') {
            this.log.debug(`Skipping CoreWindow handle 0x${hwnd.toString(16).padStart(8, '0')}.`);
            continue;
        }

        if (!fallbackElementId) { fallbackElementId = candidateId; }

        const focusables = await this.sendCommand('findElements', {
            scope: 'descendants',
            condition: propertyCondition('IsKeyboardFocusable', true),
            contextElementId: candidateId,
        }) as string[];

        if (focusables && focusables.length >= 2) {
            this.log.info(`Attaching to window 0x${hwnd.toString(16).padStart(8, '0')} (${focusables.length} focusable descendants).`);
            await this.sendCommand('setRootElementFromElementId', { elementId: candidateId });
            const isNotNull = await this.sendCommand('checkRootElementNotNull', {}) as boolean;
            if (isNotNull) {
                const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
                const nwh = Number(await this.sendCommand('getProperty', { elementId: rootId, property: 'NativeWindowHandle' }) as string);
                trySetForegroundWindow(nwh);
            }
            return true;
        }
    }

    // No window passed the focusability threshold (e.g. click-only or
    // custom-drawn apps with no keyboard-focusable elements). Attach to
    // the first valid non-CoreWindow handle found.
    if (fallbackElementId) {
        this.log.info(`No window with focusable descendants found — attaching to fallback element.`);
        await this.sendCommand('setRootElementFromElementId', { elementId: fallbackElementId });
        const isNotNull = await this.sendCommand('checkRootElementNotNull', {}) as boolean;
        if (isNotNull) {
            const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
            const nwh = Number(await this.sendCommand('getProperty', { elementId: rootId, property: 'NativeWindowHandle' }) as string);
            trySetForegroundWindow(nwh);
            return true;
        }
    }

    return false;
}

/**
 * Attaches the driver session to the window spawned by launcherPid.
 *
 * Delegates process-tree discovery to waitForNewWindow, then resolves the
 * Win32 HWND to a UIA element via elementFromHandle (with a short ProcessId
 * fallback for the rare case where UIA registration lags the Win32 window).
 * Returns focused=false when the attached window looks like a splash screen
 * (fewer than 2 keyboard-focusable descendants), signalling the caller to
 * run waitForMainWindow.
 */
export async function attachToApplicationWindow(
    this: AppiumDesktopDriver,
    launcherPid: number,
    options: { deadline?: number | null } = {},
): Promise<{ focused: boolean, knownPids: number[] }> {
    const { deadline = null } = options;
    const waitForAppLaunchMs = normalizeWaitForAppLaunchMs(this.caps['ms:waitForAppLaunch']) || POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS;
    const windowTimeout = deadline
        ? Math.min(waitForAppLaunchMs, Math.max(0, deadline - Date.now()))
        : waitForAppLaunchMs;

    const { handle: nativeWindowHandle, knownPids } = await waitForNewWindow.call(this, launcherPid, windowTimeout);

    let elementId = '';

    // Short retry for UIA registration lag: the Win32 window exists (waitForNewWindow
    // confirmed it), but the UIA COM provider may take a moment to initialise.
    // 5 attempts × 200 ms = 1 s — enough for any real app; avoids the old 6 s burn.
    for (let i = 1; i <= 5; i++) {
        try {
            elementId = await this.sendCommand('elementFromHandle', { handle: nativeWindowHandle }) as string ?? '';
        } catch {
            elementId = '';
        }

        if (!elementId) {
            for (const pid of knownPids) {
                const foundId = await this.sendCommand('findElement', {
                    scope: 'children',
                    condition: propertyCondition('ProcessId', pid),
                    contextElementId: null,
                }) as string ?? '';

                if (foundId) {
                    this.log.info(`Found window by ProcessId ${pid} (handle mismatch: Win32=0x${nativeWindowHandle.toString(16).padStart(8, '0')})`);
                    elementId = foundId;
                    break;
                }
            }
        }

        if (elementId) { break; }

        this.log.debug(`Window 0x${nativeWindowHandle.toString(16).padStart(8, '0')} not yet in UIA tree, retry ${i}/5...`);
        await sleep(POLL_INTERVAL_MS);
    }

    if (!elementId) {
        throw new errors.UnknownError(`Window 0x${nativeWindowHandle.toString(16).padStart(8, '0')} did not appear in the UI Automation tree.`);
    }

    await this.sendCommand('setRootElementFromElementId', { elementId });
    const isNotNull = await this.sendCommand('checkRootElementNotNull', {}) as boolean;
    if (isNotNull) {
        const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
        const nwh = Number(await this.sendCommand('getProperty', { elementId: rootId, property: 'NativeWindowHandle' }) as string);
        let focused = trySetForegroundWindow(nwh);
        if (!focused) {
            try {
                await this.focusElement({ [W3C_ELEMENT_KEY]: elementId } satisfies Element);
                focused = true;
            } catch {
                // Window cannot receive focus (e.g. splash screen)
            }
        }

        // Splash-screen guard: probe for focusable descendants.
        // Splash screens have 0–1; real app windows have several.
        if (focused) {
            try {
                const focusables = await this.sendCommand('findElements', {
                    scope: 'descendants',
                    condition: propertyCondition('IsKeyboardFocusable', true),
                    contextElementId: elementId,
                }) as string[];
                if (!focusables || focusables.length < 2) {
                    this.log.info(`Attached window has only ${focusables?.length ?? 0} focusable descendant(s); treating as a splash screen.`);
                    focused = false;
                }
            } catch {
                // leave focused as-is
            }
        }

        return { focused, knownPids };
    }
    return { focused: false, knownPids };
}

/**
 * Waits for a splash screen to disappear and re-attaches to the app's main window.
 *
 * After `attachToApplicationWindow` attaches to a window that can't receive focus
 * (a splash screen), this function polls until the current root element becomes
 * stale (splash screen closed) or a new, different window handle appears for the
 * same process. It then re-attaches to the new main window.
 */
export async function waitForMainWindow(
    this: AppiumDesktopDriver,
    knownPids: number[],
    deadline: number,
): Promise<void> {
    // Capture the splash screen's window handle so we can detect when a new window appears
    let splashHandle: number | null = null;
    try {
        const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
        splashHandle = Number(await this.sendCommand('getProperty', { elementId: rootId, property: 'NativeWindowHandle' }) as string);
    } catch {
        // If we can't get the handle, we'll just watch for staleness
    }

    this.log.debug(`Splash screen handle: ${splashHandle != null ? `0x${splashHandle.toString(16).padStart(8, '0')}` : 'unknown'}. Polling for main window...`);

    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        await sleep(POLL_INTERVAL_MS);

        // Check if the current root element is still alive
        let rootStale = false;
        try {
            const isNotNull = await this.sendCommand('checkRootElementNotNull', {}) as boolean;
            if (!isNotNull) {
                rootStale = true;
            } else {
                // Try to read a property — if the element is stale, this throws
                const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
                await this.sendCommand('getProperty', { elementId: rootId, property: 'Name' });
            }
        } catch {
            rootStale = true;
        }

        if (rootStale) {
            this.log.info(`Splash screen closed (root element stale after ${attempt} polls). Re-attaching to main window via attachToApplicationWindow...`);
            // Clear the stale root so attachToApplicationWindow starts fresh
            await this.sendCommand('setRootElementNull', {});
            // attachToApplicationWindow has its own polling loop for the UIA tree,
            // so it will wait until the new main window registers.
            const result = await this.attachToApplicationWindow(knownPids[0], { deadline });
            if (result.focused) {
                this.log.info('Successfully attached to the main application window after splash screen.');
            } else {
                this.log.info('Attached to main window (could not focus, but window found).');
            }
            return;
        }

        // Root is still alive — check if the process now has a different (new) window
        if (splashHandle != null) {
            const handles = getWindowAllHandlesForProcessIds(knownPids);
            const newHandle = handles.find((h) => h !== splashHandle);
            if (newHandle) {
                this.log.info(`New window detected (0x${newHandle.toString(16).padStart(8, '0')}) alongside splash screen (attempt ${attempt}). Waiting for splash to close...`);
                // Don't re-attach yet — let the splash finish naturally.
                // Once it closes, the root-stale path above will handle re-attach.
            }
        }

        if (attempt % 10 === 0) {
            this.log.debug(`Still waiting for splash screen to close... (attempt ${attempt})`);
        }
    }

    this.log.warn('Deadline reached while waiting for splash screen to close. Session is attached to the splash screen window.');
}

