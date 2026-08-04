/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { PROTOCOLS, W3C_ELEMENT_KEY, errors } from '@appium/base-driver';
import { Element } from '@appium/types';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { MODIFY_FS_FEATURE } from '../constants';
import { AppiumDesktopDriver } from '../driver';
import { ClickType, Enum, Key } from '../enums';
import { propertyCondition } from '../server/conditions';
import { conditionToDto } from '../server/converter-bridge';
import { convertStringToCondition } from '../powershell/converter';
import type { RectResult } from '../server/protocol';
import { sleep } from '../util';
import { click } from './element';
import { DEFAULT_EXT, ScreenRecorder, UploadOptions, uploadRecordedMedia } from './screen-recorder';
import { KeyEventFlags, VirtualKey } from '../winapi/types';
import {
    getAllWindowsWithDetails,
    getResolutionScalingFactor,
    keyDown,
    keyUp,
    mouseDown,
    mouseMoveAbsolute,
    mouseScroll,
    mouseUp,
    sendKeyboardEvents
} from '../winapi/user32';

const PLATFORM_COMMAND_PREFIX = 'windows:';

const ContentType = Object.freeze({
    PLAINTEXT: 'plaintext',
    IMAGE: 'image',
} as const);

type ContentType = Enum<typeof ContentType>;

type KeyAction = {
    pause?: number,
    text?: string,
    virtualKeyCode?: number,
    down?: boolean,
}

/**
 * Callers commonly pass a raw W3C element (e.g. a WebdriverIO element handle, which
 * the client auto-serializes to `{ [W3C_ELEMENT_KEY]: id }`) directly as an execute
 * arg, or (for `windows: setValue`) two separate positional args `(element, value)`.
 * The executeMethodMap dispatch path instead expects a single plain options object
 * with named fields (e.g. `elementId`), and its param validator
 * (`validateExecuteMethodParams` in `@appium/base-driver`) rejects anything else
 * before our own command code ever runs. This normalizes both calling conventions
 * into that shape. Returns `null` when the args don't match any shape this driver
 * understands.
 */
function coerceExecuteMethodArgs(script: string, args: any[]): any[] | null {
    // `patternSetValue(element, value)` is the only handler taking two separate
    // positional args instead of one options object.
    if (script === 'windows: setValue' && args.length === 2) {
        const [element, value] = args;
        if (element && typeof element === 'object' && W3C_ELEMENT_KEY in element && !('elementId' in element)) {
            return [{ elementId: element[W3C_ELEMENT_KEY], value }];
        }
        return null;
    }

    if (args.length > 1) {
        return null;
    }

    if (args.length === 0) {
        return args;
    }

    const [opts] = args;
    if (opts && typeof opts === 'object' && W3C_ELEMENT_KEY in opts && !('elementId' in opts)) {
        const { [W3C_ELEMENT_KEY]: elementId, ...rest } = opts;
        return [{ elementId, ...rest }];
    }

    return args;
}

/**
 * Implements the WebDriver `execute`/`executeAsync` endpoint: dispatches `windows: *` commands
 * through the `executeMethodMap`, handles a few special-cased scripts (`mobile: getContexts`,
 * `powerShell`, `return window.name`), proxies to Chromedriver when a webview context is
 * active, and delegates to the IE bridge in IE context.
 * @param script - The script/command name, or a raw script string for legacy `execute` calls.
 * @param args - The arguments passed to the script/command.
 * @returns The result of the dispatched command.
 */
export async function execute(this: AppiumDesktopDriver, script: string, args: any[]) {
    if (script.startsWith(PLATFORM_COMMAND_PREFIX)) {
        const ExecuteMethodMapCtor = this.constructor as typeof AppiumDesktopDriver;
        if (!Object.hasOwn(ExecuteMethodMapCtor.executeMethodMap ?? {}, script)) {
            throw new errors.UnknownCommandError(`Unknown command '${script}'.`);
        }

        const executeMethodArgs = coerceExecuteMethodArgs(script, args);
        if (executeMethodArgs === null) {
            throw new errors.InvalidArgumentError(
                `Did not get correct format of arguments for '${script}'. Expected zero or one arguments object.`
            );
        }

        return await this.executeMethod(script, executeMethodArgs);
    }

    if (script.replace(/\s/g, '') === 'mobile:getContexts') {
        if (!this.caps.webviewEnabled) {
            throw new errors.InvalidArgumentError('WebView support is not enabled. To use this command, enable WebView support by setting the "webviewEnabled" capability to true.');
        }
        const { waitForWebviewMs }: { waitForWebviewMs?: number } = args[0] || {};
        const webViewDetails = await this.getWebViewDetails(waitForWebviewMs);
        return [{
            id: 'NATIVE_APP',
        }, ...(webViewDetails.pages ?? []).map((page) => ({ ...page, id: `WEBVIEW_${page.id}` }))];
    }

    if (script === 'powerShell') {
        return await this.executePowerShellScript(args[0]);
    }

    if (this.isIEContext()) {
        return await this.ieSession!.execute(script, args);
    }

    if (this.chromedriver && this.proxyActive()) {
        const endpoint = this.chromedriver.jwproxy.downstreamProtocol === PROTOCOLS.MJSONWP
                ? '/execute'
                : '/execute/sync';
        return await this.chromedriver.jwproxy.command(endpoint, 'POST', { script, args });
    }

    if (script === 'return window.name') {
        const rootId = await this.sendCommand('saveRootElementToTable', {}) as string;
        return await this.sendCommand('getProperty', { elementId: rootId, property: 'Name' }) as string;
    }

    throw new errors.NotImplementedError();
};

type CacheRequest = {
    treeScope?: string,
    treeFilter?: string,
    automationElementMode?: string,
}

/**
 * Configures the C# server's UIA cache request (tree scope, tree filter, and automation
 * element mode) used for subsequent element lookups.
 * @param cacheRequest - The cache request fields to set; at least one must be provided.
 * @returns Resolves once the cache request has been applied.
 */
export async function pushCacheRequest(this: AppiumDesktopDriver, cacheRequest: CacheRequest): Promise<void> {
    if (Object.keys(cacheRequest).every((key) => cacheRequest[key] === undefined)) {
        throw new errors.InvalidArgumentError('At least one property of the cache request must be set.');
    }

    if (cacheRequest.treeFilter) {
        const condition = convertStringToCondition(cacheRequest.treeFilter);
        await this.sendCommand('setCacheRequestTreeFilter', { condition: conditionToDto(condition) });
    }

    if (cacheRequest.treeScope) {
        await this.sendCommand('setCacheRequestTreeScope', { scope: cacheRequest.treeScope });
    }

    if (cacheRequest.automationElementMode) {
        await this.sendCommand('setCacheRequestAutomationElementMode', { mode: cacheRequest.automationElementMode });
    }
}

/**
 * Triggers the UIA Invoke pattern on an element.
 * @param element - The element to invoke.
 * @returns Resolves once the pattern has been invoked.
 */
export async function patternInvoke(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('invokeElement', { elementId: element[W3C_ELEMENT_KEY] });
}

async function hasKeyboardFocus(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    try {
        const result = await this.sendCommand('getProperty', { elementId, property: 'HasKeyboardFocus' });
        return result === true || String(result).toLowerCase() === 'true';
    } catch {
        return false;
    }
}

async function expandViaAltDown(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    await this.sendCommand('setFocus', { elementId });
    await sleep(50);

    // SetFocus() on a legacy composite control (e.g. WinForms ComboBox's inner Edit)
    // doesn't always route real OS keyboard focus correctly on every UIA build — verify
    // and fall back to a real mouse click, which reliably lands OS focus the same way a
    // user's click would.
    if (!(await hasKeyboardFocus.call(this, elementId))) {
        await click.call(this, elementId);
        await sleep(50);
    }

    // Route through the actions pipeline (not raw winapi keyDown/keyUp) so ALT is
    // tracked in this.keyboardState — if anything throws mid-sequence, releaseActions
    // (session cleanup / actions/release) can still force ALT back up instead of leaving
    // it stuck down.
    try {
        await this.handleKeyAction({ type: 'keyDown', value: Key.ALT });
        await this.handleKeyAction({ type: 'keyDown', value: Key.DOWN });
    } finally {
        await this.handleKeyAction({ type: 'keyUp', value: Key.DOWN });
        await this.handleKeyAction({ type: 'keyUp', value: Key.ALT });
    }
}

// Reads the live ExpandCollapseState (added alongside this fix — see ElementCommands.cs
// GetProperty / UIA.ExpandCollapseStatePropertyId). Returns undefined when the state can't
// be read at all (e.g. Java elements, or a control with no real ExpandCollapsePattern) —
// callers must treat that as "can't verify" rather than "failed".
async function isExpanded(this: AppiumDesktopDriver, elementId: string): Promise<boolean | undefined> {
    try {
        const state = await this.sendCommand('getProperty', { elementId, property: 'ExpandCollapseState' }) as string;
        return state === 'Expanded' || state === 'PartiallyExpanded';
    } catch {
        return undefined;
    }
}

async function waitForExpanded(this: AppiumDesktopDriver, elementId: string): Promise<boolean | undefined> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const expanded = await isExpanded.call(this, elementId);
        if (expanded !== false) {
            return expanded;
        }
        await sleep(100);
    }
    return false;
}

async function waitForCollapsed(this: AppiumDesktopDriver, elementId: string): Promise<boolean | undefined> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const expanded = await isExpanded.call(this, elementId);
        if (expanded !== true) {
            return expanded;
        }
        await sleep(100);
    }
    return true;
}

/**
 * Expands an element via the UIA ExpandCollapse pattern, verifying the resulting
 * `ExpandCollapseState` and falling back to an ALT+Down keyboard action if the pattern call
 * doesn't actually open the control (common for legacy combo boxes).
 * @param element - The element to expand.
 * @returns Resolves once the element has been expanded (or the fallback has been attempted).
 */
export async function patternExpand(this: AppiumDesktopDriver, element: Element): Promise<void> {
    const elementId = element[W3C_ELEMENT_KEY];

    try {
        await this.sendCommand('expandElement', { elementId });
        // `undefined` means the state couldn't be read at all (e.g. Java elements, or a
        // control with no real ExpandCollapsePattern) — trust the reported success since
        // there's no stronger signal available. Only a confirmed `false` means the C#
        // server's LegacyIAccessible fallback (PatternCommands.cs Expand) fired without
        // actually opening the control.
        if (await waitForExpanded.call(this, elementId) !== false) {
            return;
        }
        this.log.info('[patternExpand] expandElement reported success but ExpandCollapseState never became Expanded, falling back to ALT+Down.');
    } catch (err: any) {
        const msg = String(err?.message ?? err);
        this.log.info(`[patternExpand] expandElement failed (${msg}), falling back to ALT+Down.`);
    }

    // Last-resort fallback — ExpandCollapseState isn't trustworthy here (unreadable for
    // JAB, unreliable for legacy controls), so just trust the keyboard action.
    await expandViaAltDown.call(this, elementId);
}

/**
 * Collapses an element via the UIA ExpandCollapse pattern, verifying the resulting
 * `ExpandCollapseState` and falling back to an ALT+Down keyboard action if the pattern call
 * doesn't actually close the control.
 * @param element - The element to collapse.
 * @returns Resolves once the element has been collapsed (or the fallback has been attempted).
 */
export async function patternCollapse(this: AppiumDesktopDriver, element: Element): Promise<void> {
    const elementId = element[W3C_ELEMENT_KEY];

    try {
        await this.sendCommand('collapseElement', { elementId });
        if (await waitForCollapsed.call(this, elementId) !== true) {
            return;
        }
        this.log.info('[patternCollapse] collapseElement reported success but ExpandCollapseState never left Expanded, falling back to ALT+Down.');
    } catch (err: any) {
        const msg = String(err?.message ?? err);
        this.log.info(`[patternCollapse] collapseElement failed (${msg}), falling back to ALT+Down.`);
    }

    // ALT+Down is just the toggle trigger for the dropdown, not a directional key —
    // same key closes it as opened it, so reuse expandViaAltDown here.
    await expandViaAltDown.call(this, elementId);
}

/**
 * Scrolls an element into view via the UIA ScrollItem pattern.
 * @param element - The element to scroll into view.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternScrollIntoView(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('scrollElementIntoView', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Checks whether a container element's Selection pattern allows multiple selection.
 * @param element - The container element to check.
 * @returns True if multiple selection is allowed.
 */
export async function patternIsMultiple(this: AppiumDesktopDriver, element: Element): Promise<boolean> {
    const result = await this.sendCommand('isMultipleSelect', { elementId: element[W3C_ELEMENT_KEY] });
    return result === true || String(result).toLowerCase() === 'true';
}

/**
 * Gets the first currently selected item within a container element's Selection pattern.
 * @param element - The container element to query.
 * @returns The selected element.
 */
export async function patternGetSelectedItem(this: AppiumDesktopDriver, element: Element): Promise<Element> {
    const result = await this.sendCommand('getSelectedElements', { elementId: element[W3C_ELEMENT_KEY] }) as string[];
    const elId = result?.[0];

    if (!elId) {
        throw new errors.NoSuchElementError();
    }

    return { [W3C_ELEMENT_KEY]: elId };
}

/**
 * Gets all currently selected items within a container element's Selection pattern.
 * @param element - The container element to query.
 * @returns All selected elements.
 */
export async function patternGetAllSelectedItems(this: AppiumDesktopDriver, element: Element): Promise<Element[]> {
    const result = await this.sendCommand('getSelectedElements', { elementId: element[W3C_ELEMENT_KEY] }) as string[];
    return (result ?? []).map((elId) => ({ [W3C_ELEMENT_KEY]: elId }));
}

/**
 * Adds an element to the current selection via the UIA SelectionItem pattern.
 * @param element - The element to add to the selection.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternAddToSelection(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('addToSelection', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Removes an element from the current selection via the UIA SelectionItem pattern.
 * @param element - The element to remove from the selection.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternRemoveFromSelection(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('removeFromSelection', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Selects an element via the UIA SelectionItem pattern.
 * @param element - The element to select.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternSelect(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('selectElement', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Toggles an element via the UIA Toggle pattern.
 * @param element - The element to toggle.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternToggle(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('toggleElement', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Sets an element's value via the UIA Value pattern, falling back to the RangeValue pattern
 * (parsing `value` as a number) if the Value pattern isn't supported.
 * @param element - The element to set.
 * @param value - The string (or numeric-string, for RangeValue) value to set.
 * @returns Resolves once the value has been set.
 */
export async function patternSetValue(this: AppiumDesktopDriver, element: Element, value: string): Promise<void> {
    try {
        await this.sendCommand('setElementValue', { elementId: element[W3C_ELEMENT_KEY], value });
    } catch {
        const numValue = Number(value);
        if (isNaN(numValue)) {
            throw new errors.InvalidArgumentError(`Value '${value}' is not a valid number for the RangeValue pattern.`);
        }
        await this.sendCommand('setElementRangeValue', { elementId: element[W3C_ELEMENT_KEY], value: numValue });
    }
}

/**
 * Gets an element's value via the UIA Value pattern.
 * @param element - The element to read from.
 * @returns The element's value.
 */
export async function patternGetValue(this: AppiumDesktopDriver, element: Element): Promise<string> {
    return await this.sendCommand('getElementValue', { elementId: element[W3C_ELEMENT_KEY] }) as string;
}

/**
 * Maximizes an element via the UIA Window pattern.
 * @param element - The window element to maximize.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternMaximize(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('maximizeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Minimizes an element via the UIA Window pattern.
 * @param element - The window element to minimize.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternMinimize(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('minimizeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Restores an element to its normal window state via the UIA Window pattern.
 * @param element - The window element to restore.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternRestore(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('restoreWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * Closes an element via the UIA Window pattern.
 * @param element - The window element to close.
 * @returns Resolves once the pattern has been triggered.
 */
export async function patternClose(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('closeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * `windows: closeApp` execute-method handler; delegates to {@link closeApp}.
 * @returns Resolves once the app window has been closed.
 */
export async function windowsCloseApp(this: AppiumDesktopDriver): Promise<void> {
    return await this.closeApp();
}

/**
 * `windows: switchToWindowByTitle` execute-method handler; delegates to
 * {@link switchToWindowByTitle}.
 * @param args.title - The window title to match (required).
 * @param args.exact - If true, require an exact match; otherwise match a substring.
 * @returns Resolves once the root element has been switched.
 */
export async function windowsSwitchToWindowByTitle(
    this: AppiumDesktopDriver,
    args?: { title?: string; exact?: boolean },
): Promise<void> {
    if (!args?.title) {
        throw new errors.InvalidArgumentError('switchToWindowByTitle requires a "title" argument.');
    }
    return await this.switchToWindowByTitle({ title: args.title, exact: args.exact });
}

/**
 * `windows: getWindows` execute-method handler; lists all visible top-level windows.
 * @returns Each window's native handle, title, and class name.
 */
export async function windowsGetWindows(): Promise<Array<{ handle: string; title: string; className: string }>> {
    return getAllWindowsWithDetails();
}

/**
 * `windows: launchApp` execute-method handler; delegates to {@link launchApp}.
 * @returns Resolves once the app's window has become the session root.
 */
export async function windowsLaunchApp(this: AppiumDesktopDriver): Promise<void> {
    return await this.launchApp();
}

/**
 * Sets OS keyboard focus to an element.
 * @param element - The element to focus.
 * @returns Resolves once focus has been set.
 */
export async function focusElement(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('setFocus', { elementId: element[W3C_ELEMENT_KEY] });
}

/**
 * `windows: getClipboard` execute-method handler; reads the system clipboard.
 * @param contentType - The clipboard content type to read (`plaintext` or `image`), as a
 * bare value or wrapped in an options object; defaults to `plaintext`.
 * @returns The base64-encoded clipboard content.
 */
export async function getClipboardBase64(this: AppiumDesktopDriver, contentType?: ContentType | { contentType?: ContentType }): Promise<string> {
    if (!contentType || (contentType && typeof contentType === 'object')) {
        contentType = contentType?.contentType ?? ContentType.PLAINTEXT;
    }

    switch (contentType.toLowerCase()) {
        case ContentType.PLAINTEXT:
            return await this.sendCommand('getClipboardText', {}) as string;
        case ContentType.IMAGE:
            return await this.sendCommand('getClipboardImage', {}) as string;
        default:
            throw new errors.InvalidArgumentError(`Unsupported content type '${contentType}'.`);
    }
}

/**
 * `windows: setClipboard` execute-method handler; writes to the system clipboard.
 * @param args.contentType - The clipboard content type to write (`plaintext` or `image`);
 * defaults to `plaintext`.
 * @param args.b64Content - Base64-encoded content to write to the clipboard.
 * @returns An empty string on success.
 */
export async function setClipboardFromBase64(this: AppiumDesktopDriver, args: { contentType?: ContentType, b64Content: string }): Promise<string> {
    if (!args || typeof args !== 'object' || !args.b64Content) {
        throw new errors.InvalidArgumentError(`'b64Content' must be provided.`);
    }

    const contentType = args.contentType ?? ContentType.PLAINTEXT;

    switch (contentType.toLowerCase()) {
        case ContentType.PLAINTEXT:
            await this.sendCommand('setClipboardText', { b64Content: args.b64Content });
            return '';
        case ContentType.IMAGE:
            await this.sendCommand('setClipboardImage', { b64Content: args.b64Content });
            return '';
        default:
            throw new errors.InvalidArgumentError(`Unsupported content type '${contentType}'.`);
    }
}

/**
 * Runs a PowerShell script on the machine hosting the session, via the C# server.
 * @param script - The script to run, as a raw string or wrapped in `{ script }`/`{ command }`.
 * @returns The script's output.
 */
export async function executePowerShellScript(this: AppiumDesktopDriver, script: string | { script: string, command: undefined } | { script: undefined, command: string }): Promise<string> {
    if (script && typeof script === 'object') {
        if (script.script) {
            script = script.script;
        } else if (script.command) {
            script = script.command;
        } else {
            throw new errors.InvalidArgumentError('Either script or command must be provided.');
        }
    }

    return await this.sendCommand('executePowerShellScript', {
        script,
        workingDir: this.caps.appWorkingDir ?? null,
        isolated: this.caps.isolatedScriptExecution ?? false,
    }) as string;
}

/**
 * `windows: keys` execute-method handler: sends a sequence of key actions (pauses, text, or
 * raw virtual-key codes) via native input simulation.
 * @param keyActions.actions - One or more key actions to execute in order.
 * @param keyActions.forceUnicode - Whether to force Unicode key input for text actions.
 * @returns Resolves once all key actions have been sent.
 */
export async function executeKeys(this: AppiumDesktopDriver, keyActions: { actions: KeyAction | KeyAction[], forceUnicode: boolean }) {
    if (!Array.isArray(keyActions.actions)) {
        keyActions.actions = [keyActions.actions];
    }

    keyActions.forceUnicode ??= false;

    for (const action of keyActions.actions) {
        if (Number(!!action.pause) + Number(!!action.text) + Number(!!action.virtualKeyCode) !== 1) {
            throw new errors.InvalidArgumentError('Either pause, text or virtualKeyCode should be set.');
        }

        if (action.pause) {
            await sleep(action.pause);
            continue;
        }

        if (action.virtualKeyCode) {
            if (action.down === undefined) {
                sendKeyboardEvents([{
                    wVk: action.virtualKeyCode as VirtualKey,
                    wScan: 0,
                    dwFlags: 0,
                    time: 0,
                    dwExtraInfo: 0,
                }, {
                    wVk: action.virtualKeyCode as VirtualKey,
                    wScan: 0,
                    dwFlags: KeyEventFlags.KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                }]);
            } else {
                sendKeyboardEvents([{
                    wVk: action.virtualKeyCode as VirtualKey,
                    wScan: 0,
                    dwFlags: action.down ? 0 : KeyEventFlags.KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                }]);
            }
            continue;
        }

        for (const key of action.text ?? []) {
            if (action.down !== undefined) {
                if (action.down) {
                    keyDown(key, keyActions.forceUnicode);
                } else {
                    keyUp(key, keyActions.forceUnicode);
                }
            } else {
                keyDown(key, keyActions.forceUnicode);
                keyUp(key, keyActions.forceUnicode);
            }
        }
    }
}

async function getElementPos(driver: AppiumDesktopDriver, elementId: string, offsetX?: number, offsetY?: number): Promise<[number, number]> {
    const exists = await driver.sendCommand('lookupElement', { elementId }) as boolean;
    if (!exists) {
        const elId = await driver.sendCommand('findElement', {
            scope: 'subtree',
            condition: propertyCondition('RuntimeId', elementId.split('.').map(Number)),
            contextElementId: null,
        }) as string | null;

        if (!elId || elId.trim() === '') {
            throw new errors.NoSuchElementError();
        }
        elementId = elId;
    }

    const rect = await driver.sendCommand('getRect', { elementId }) as RectResult;
    return [
        rect.x + (offsetX ?? Math.trunc(rect.width / 2)),
        rect.y + (offsetY ?? Math.trunc(rect.height / 2)),
    ];
}

/**
 * `windows: click` execute-method handler: moves the native cursor to an element or raw
 * coordinates and issues one or more real mouse clicks, optionally holding modifier keys.
 * @param clickArgs.elementId - The id of the element to click, or omitted to click raw coordinates.
 * @param clickArgs.x - X coordinate to click, when not clicking an element.
 * @param clickArgs.y - Y coordinate to click, when not clicking an element.
 * @param clickArgs.button - Which mouse button to click.
 * @param clickArgs.modifierKeys - Modifier key(s) held during the click.
 * @param clickArgs.durationMs - How long to hold the button down.
 * @param clickArgs.times - Number of times to click.
 * @param clickArgs.interClickDelayMs - Delay between repeated clicks.
 * @returns Resolves once the click(s) have been performed.
 */
export async function executeClick(this: AppiumDesktopDriver, clickArgs: {
    elementId?: string,
    x?: number,
    y?: number,
    button?: ClickType,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
    times?: number,
    interClickDelayMs?: number
}) {
    const {
        elementId,
        x, y,
        button = ClickType.LEFT,
        modifierKeys = [],
        durationMs = 0,
        times = 1,
        interClickDelayMs = 100,
    } = clickArgs;

    if ((x != null) !== (y != null)) {
        throw new errors.InvalidArgumentError('Both x and y must be provided if either is set.');
    }

    let pos: [number, number];
    if (elementId) {
        pos = await getElementPos(this, elementId, x, y);
    } else {
        pos = [x!, y!];
    }

    const clickTypeToButtonMapping: { [key in ClickType]: number } = {
        [ClickType.LEFT]: 0,
        [ClickType.MIDDLE]: 1,
        [ClickType.RIGHT]: 2,
        [ClickType.BACK]: 3,
        [ClickType.FORWARD]: 4
    };
    const mouseButton: number = clickTypeToButtonMapping[button];

    const processesModifierKeys = Array.isArray(modifierKeys) ? modifierKeys : [modifierKeys];
    await mouseMoveAbsolute(pos[0], pos[1], 0);
    for (let i = 0; i < times; i++) {
        if (i !== 0) {
            await sleep(interClickDelayMs);
        }

        if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyDown(Key.CONTROL);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyDown(Key.ALT);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyDown(Key.SHIFT);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyDown(Key.META);}

        mouseDown(mouseButton);
        if (durationMs > 0) {
            await sleep(durationMs);
        }
        mouseUp(mouseButton);

        if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyUp(Key.CONTROL);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyUp(Key.ALT);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyUp(Key.SHIFT);}
        if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyUp(Key.META);}
    }

    if (this.caps.delayAfterClick) {
        await sleep(this.caps.delayAfterClick ?? 0);
    }
}

/**
 * `windows: hover` execute-method handler: moves the native cursor from a start position to
 * an end position, optionally holding modifier keys for the duration.
 * @param hoverArgs.startElementId - The id of the element to start from, if any.
 * @param hoverArgs.startX - X coordinate to start from, when not starting from an element.
 * @param hoverArgs.startY - Y coordinate to start from, when not starting from an element.
 * @param hoverArgs.endElementId - The id of the element to hover over, if any.
 * @param hoverArgs.endX - X coordinate to end at, when not ending on an element.
 * @param hoverArgs.endY - Y coordinate to end at, when not ending on an element.
 * @param hoverArgs.modifierKeys - Modifier key(s) held during the hover.
 * @param hoverArgs.durationMs - Duration of the cursor move to the end position.
 * @returns Resolves once the hover move has completed.
 */
export async function executeHover(this: AppiumDesktopDriver, hoverArgs: {
    startElementId?: string,
    startX?: number,
    startY?: number,
    endElementId?: string,
    endX?: number,
    endY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
}) {
    const {
        startElementId,
        startX, startY,
        endElementId,
        endX, endY,
        modifierKeys = [],
        durationMs = 500,
    } = hoverArgs;

    if ((startX != null) !== (startY != null)) {
        throw new errors.InvalidArgumentError('Both startX and startY must be provided if either is set.');
    }

    if ((endX != null) !== (endY != null)) {
        throw new errors.InvalidArgumentError('Both endX and endY must be provided if either is set.');
    }

    const processesModifierKeys = Array.isArray(modifierKeys) ? modifierKeys : [modifierKeys];
    let startPos: [number, number];
    if (startElementId) {
        startPos = await getElementPos(this, startElementId, startX, startY);
    } else {
        startPos = [startX!, startY!];
    }

    let endPos: [number, number];
    if (endElementId) {
        endPos = await getElementPos(this, endElementId, endX, endY);
    } else {
        endPos = [endX!, endY!];
    }

    await mouseMoveAbsolute(startPos[0], startPos[1], 0);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyDown(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyDown(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyDown(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyDown(Key.META);}

    await mouseMoveAbsolute(endPos[0], endPos[1], durationMs, this.caps.smoothPointerMove);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyUp(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyUp(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyUp(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyUp(Key.META);}
}

/**
 * `windows: scroll` execute-method handler: positions the native cursor at an element or raw
 * coordinates and issues a mouse wheel scroll, optionally holding modifier keys.
 * @param scrollArgs.elementId - The id of the element to scroll at, or omitted to use raw coordinates.
 * @param scrollArgs.x - X coordinate to position the cursor at, when not using an element.
 * @param scrollArgs.y - Y coordinate to position the cursor at, when not using an element.
 * @param scrollArgs.deltaX - Horizontal scroll amount.
 * @param scrollArgs.deltaY - Vertical scroll amount.
 * @param scrollArgs.modifierKeys - Modifier key(s) held during the scroll.
 * @returns Resolves once the scroll has been performed.
 */
export async function executeScroll(this: AppiumDesktopDriver, scrollArgs: {
    elementId?: string,
    x?: number,
    y?: number,
    deltaX?: number,
    deltaY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
}) {
    const {
        elementId,
        x, y,
        deltaX, deltaY,
        modifierKeys = [],
    } = scrollArgs;

    if (!!elementId && ((x !== null && x !== undefined) || (y !== null && y !== undefined))) {
        throw new errors.InvalidArgumentError('Either elementId or x and y must be provided.');
    }

    if ((x !== null && x !== undefined) !== (y !== null && y !== undefined)) {
        throw new errors.InvalidArgumentError('Both x and y must be provided.');
    }

    const processesModifierKeys = Array.isArray(modifierKeys) ? modifierKeys : [modifierKeys];
    let pos: [number, number];
    if (elementId) {
        pos = await getElementPos(this, elementId);
    } else {
        pos = [x!, y!];
    }

    await mouseMoveAbsolute(pos[0], pos[1], 0);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyDown(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyDown(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyDown(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyDown(Key.META);}

    mouseScroll(deltaX ?? 0, deltaY ?? 0);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyUp(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyUp(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyUp(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyUp(Key.META);}
}

/**
 * `windows: startRecordingScreen` execute-method handler: starts an FFmpeg-based screen
 * recording, stopping/discarding any prior recording first if one is active.
 * @param args.outputPath - Local file path to write the recording to; must end in
 * `.{@link DEFAULT_EXT}` if provided.
 * @param args.timeLimit - Maximum recording duration, in seconds.
 * @param args.videoFps - Frames per second to record at.
 * @param args.videoFilter - Optional FFmpeg video filter string.
 * @param args.preset - FFmpeg encoder preset.
 * @param args.captureCursor - Whether to include the mouse cursor in the recording.
 * @param args.captureClicks - Whether to visually highlight mouse clicks in the recording.
 * @param args.audioInput - Optional audio input device to record from.
 * @param args.forceRestart - Whether to stop and discard an in-progress recording before starting.
 * @returns Resolves once recording has started.
 */
export async function startRecordingScreen(this: AppiumDesktopDriver, args?: {
    outputPath?: string,
    timeLimit?: number,
    videoFps?: number,
    videoFilter?: string,
    preset?: string,
    captureCursor?: boolean,
    captureClicks?: boolean,
    audioInput?: string,
    forceRestart?: boolean,
}): Promise<void> {
    const {
        outputPath,
        timeLimit,
        videoFps: fps,
        videoFilter,
        preset,
        captureCursor,
        captureClicks,
        audioInput,
        forceRestart = true,
    } = args ?? {};

    if (this._screenRecorder?.isRunning()) {
        this.log.debug('The screen recording is already running');
        if (!forceRestart) {
            this.log.debug('Doing nothing');
            return;
        }
        this.log.debug('Forcing the active screen recording to stop');
        await this._screenRecorder.stop(true);
    } else if (this._screenRecorder) {
        this.log.debug('Clearing the recent screen recording');
        await this._screenRecorder.stop(true);
    }
    this._screenRecorder = null;

    if (outputPath) {
        const ext = extname(outputPath).toLowerCase();
        if (ext !== `.${DEFAULT_EXT}`) {
            throw new errors.InvalidArgumentError(
                `outputPath must be a path to a .${DEFAULT_EXT} file, got: '${outputPath}'`,
            );
        }
    }
    const videoPath = outputPath ?? join(tmpdir(), `appiumdesktop-recording-${Date.now()}.${DEFAULT_EXT}`);
    this._screenRecorder = new ScreenRecorder(videoPath, this, {
        fps: fps !== undefined ? parseInt(String(fps), 10) : undefined,
        timeLimit: timeLimit !== undefined ? parseInt(String(timeLimit), 10) : undefined,
        preset,
        captureCursor,
        captureClicks,
        videoFilter,
        audioInput,
    });
    try {
        await this._screenRecorder.start();
    } catch (e) {
        this._screenRecorder = null;
        throw e;
    }
}

/**
 * `windows: stopRecordingScreen` execute-method handler: stops the active screen recording
 * and returns (or uploads) the resulting video.
 * @param args - Optional remote-upload options; if `remotePath` is set, the video is
 * uploaded there instead of returned inline.
 * @returns Base64-encoded video content, an upload response, or an empty string if no
 * recording was in progress.
 */
export async function stopRecordingScreen(this: AppiumDesktopDriver, args?: UploadOptions): Promise<string> {
    if (!this._screenRecorder) {
        this.log.debug('No screen recording has been started. Doing nothing');
        return '';
    }

    this.log.debug('Retrieving the resulting video data');
    const videoPath = await this._screenRecorder.stop();
    if (!videoPath) {
        this.log.debug('No video data is found. Returning an empty string');
        return '';
    }

    const { remotePath, ...uploadOpts } = args ?? {};
    return await uploadRecordedMedia(videoPath, remotePath, uploadOpts);
}

/**
 * `windows: deleteFile` execute-method handler; deletes a file on the machine running the
 * session. Requires the `MODIFY_FS_FEATURE` insecure feature to be enabled.
 * @param args.path - Path of the file to delete.
 * @returns Resolves once the file has been deleted.
 */
export async function deleteFile(this: AppiumDesktopDriver, args: { path: string }): Promise<void> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!args || typeof args !== 'object' || !args.path) {
        throw new errors.InvalidArgumentError("'path' must be provided.");
    }
    await this.sendCommand('deleteFile', { path: args.path });
}

/**
 * `windows: deleteFolder` execute-method handler; deletes a folder on the machine running the
 * session. Requires the `MODIFY_FS_FEATURE` insecure feature to be enabled.
 * @param args.path - Path of the folder to delete.
 * @param args.recursive - Whether to delete non-empty folders recursively (default true).
 * @returns Resolves once the folder has been deleted.
 */
export async function deleteFolder(this: AppiumDesktopDriver, args: { path: string, recursive?: boolean }): Promise<void> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!args || typeof args !== 'object' || !args.path) {
        throw new errors.InvalidArgumentError("'path' must be provided.");
    }
    await this.sendCommand('deleteFolder', { path: args.path, recursive: args.recursive ?? true });
}

/**
 * `windows: clickAndDrag` execute-method handler: presses the mouse button at a start
 * position, drags to an end position, then releases, optionally holding modifier keys.
 * @param dragArgs.startElementId - The id of the element to start the drag from, if any.
 * @param dragArgs.startX - X coordinate to start from, when not starting from an element.
 * @param dragArgs.startY - Y coordinate to start from, when not starting from an element.
 * @param dragArgs.endElementId - The id of the element to drop onto, if any.
 * @param dragArgs.endX - X coordinate to drop at, when not ending on an element.
 * @param dragArgs.endY - Y coordinate to drop at, when not ending on an element.
 * @param dragArgs.modifierKeys - Modifier key(s) held during the drag.
 * @param dragArgs.durationMs - Duration of the drag movement.
 * @param dragArgs.button - Which mouse button to hold down during the drag.
 * @returns Resolves once the click-and-drag has completed.
 */
export async function executeClickAndDrag(this: AppiumDesktopDriver, dragArgs: {
    startElementId?: string,
    startX?: number,
    startY?: number,
    endElementId?: string,
    endX?: number,
    endY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
    button?: ClickType,
}) {
    const {
        startElementId,
        startX, startY,
        endElementId,
        endX, endY,
        modifierKeys = [],
        durationMs = 500,
        button = ClickType.LEFT,
    } = dragArgs ?? {};

    if ((startX != null) !== (startY != null)) {
        throw new errors.InvalidArgumentError('Both startX and startY must be provided if either is set.');
    }

    if ((endX != null) !== (endY != null)) {
        throw new errors.InvalidArgumentError('Both endX and endY must be provided if either is set.');
    }

    const processesModifierKeys = Array.isArray(modifierKeys) ? modifierKeys : [modifierKeys];
    const clickTypeToButtonMapping: { [key in ClickType]: number } = {
        [ClickType.LEFT]: 0,
        [ClickType.MIDDLE]: 1,
        [ClickType.RIGHT]: 2,
        [ClickType.BACK]: 3,
        [ClickType.FORWARD]: 4,
    };
    const mouseButton = clickTypeToButtonMapping[button];

    let startPos: [number, number];
    if (startElementId) {
        startPos = await getElementPos(this, startElementId, startX, startY);
    } else {
        if (startX == null || startY == null) {
            throw new errors.InvalidArgumentError('Either startElementId or startX and startY must be provided.');
        }
        startPos = [startX, startY];
    }

    let endPos: [number, number];
    if (endElementId) {
        endPos = await getElementPos(this, endElementId, endX, endY);
    } else {
        if (endX == null || endY == null) {
            throw new errors.InvalidArgumentError('Either endElementId or endX and endY must be provided.');
        }
        endPos = [endX, endY];
    }

    await mouseMoveAbsolute(startPos[0], startPos[1], 0);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyDown(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyDown(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyDown(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyDown(Key.META);}

    mouseDown(mouseButton);
    await mouseMoveAbsolute(endPos[0], endPos[1], durationMs, this.caps.smoothPointerMove);
    mouseUp(mouseButton);

    if (processesModifierKeys.some((key) => key.toLowerCase() === 'ctrl')) {keyUp(Key.CONTROL);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'alt')) {keyUp(Key.ALT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'shift')) {keyUp(Key.SHIFT);}
    if (processesModifierKeys.some((key) => key.toLowerCase() === 'win')) {keyUp(Key.META);}
}

/**
 * `windows: getDeviceTime` execute-method handler; delegates to {@link getDeviceTime}.
 * @param args.format - A .NET custom date/time format string; defaults to ISO 8601.
 * @returns The formatted date/time string.
 */
export async function windowsGetDeviceTime(this: AppiumDesktopDriver, args?: { format?: string }): Promise<string> {
    return this.getDeviceTime(undefined, args?.format);
}

/**
 * `windows: getWindowElement` execute-method handler; gets a WebDriver element reference for
 * the session's root window.
 * @returns The root window as an element reference.
 */
export async function getWindowElement(this: AppiumDesktopDriver): Promise<Element> {
    const elementId = await this.sendCommand('saveRootElementToTable', {}) as string;
    if (!elementId) {
        throw new errors.NoSuchWindowError('No active app window is found for this session.');
    }
    return { [W3C_ELEMENT_KEY]: elementId };
}

/**
 * Writes a file to the machine running the session. Requires the `MODIFY_FS_FEATURE`
 * insecure feature to be enabled.
 * @param remotePath - Destination path; parent directories are created as needed.
 * @param base64Data - Base64-encoded file content to write.
 * @returns Resolves once the file has been written.
 */
export async function pushFile(this: AppiumDesktopDriver, remotePath: string, base64Data: string): Promise<void> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!remotePath) {
        throw new errors.InvalidArgumentError("'remotePath' must be provided.");
    }
    if (!base64Data) {
        throw new errors.InvalidArgumentError("'base64Data' must be provided.");
    }
    const data = Buffer.from(base64Data, 'base64');
    await mkdir(dirname(remotePath), { recursive: true });
    await writeFile(remotePath, data);
}

/**
 * Reads a file from the machine running the session. Requires the `MODIFY_FS_FEATURE`
 * insecure feature to be enabled.
 * @param remotePath - Path of the file to read.
 * @returns The file content, base64-encoded.
 */
export async function pullFile(this: AppiumDesktopDriver, remotePath: string): Promise<string> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!remotePath) {
        throw new errors.InvalidArgumentError("'remotePath' must be provided.");
    }
    const data = await readFile(remotePath);
    return data.toString('base64');
}

/**
 * `windows: getMonitors` execute-method handler; lists the display monitors attached to the
 * machine running the session.
 * @returns The list of monitors and their properties, as reported by the C# server.
 */
export async function windowsGetMonitors(this: AppiumDesktopDriver): Promise<object[]> {
    return await this.sendCommand('getMonitors', {}) as object[];
}

/**
 * `windows: getDpiScale` execute-method handler; reads the primary display's DPI scaling factor.
 * @returns The scaling factor (e.g. `1.5` for 150% scaling).
 */
export function executeGetDpiScale(): number {
    return getResolutionScalingFactor();
}

/**
 * `windows: attachJavaSwing` execute-method handler: injects the Java Access Bridge agent
 * into the JVM owning the session's current root window (resolved by the C# server from the
 * root element's HWND) and connects to it.
 * @param opts.jdkPath - Path to the JDK to use for the injection; defaults to the `jdkPath`
 * capability.
 * @returns Resolves once the Java agent has been injected and connected.
 */
export async function executeAttachJavaSwing(this: AppiumDesktopDriver, opts: { jdkPath?: string } = {}): Promise<void> {
    // Injects the Java agent into the JVM owning the current root window,
    // then connects. The C# side resolves the PID from the root element's HWND.
    const jdkPath = opts.jdkPath ?? this.caps.jdkPath;
    await this.sendCommand('injectJavaAgent', { jdkPath });
}
