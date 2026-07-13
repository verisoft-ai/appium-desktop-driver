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

const EXTENSION_COMMANDS = Object.freeze({
    cacheRequest: 'pushCacheRequest',
    invoke: 'patternInvoke',
    expand: 'patternExpand',
    collapse: 'patternCollapse',
    isMultiple: 'patternIsMultiple',
    scrollIntoView: 'patternScrollIntoView',
    selectedItem: 'patternGetSelectedItem',
    allSelectedItems: 'patternGetAllSelectedItems',
    addToSelection: 'patternAddToSelection',
    removeFromSelection: 'patternRemoveFromSelection',
    select: 'patternSelect',
    toggle: 'patternToggle',
    setValue: 'patternSetValue',
    getValue: 'patternGetValue',
    maximize: 'patternMaximize',
    minimize: 'patternMinimize',
    restore: 'patternRestore',
    close: 'patternClose',
    closeApp: 'windowsCloseApp',
    launchApp: 'windowsLaunchApp',
    keys: 'executeKeys',
    click: 'executeClick',
    hover: 'executeHover',
    scroll: 'executeScroll',
    setFocus: 'focusElement',
    getClipboard: 'getClipboardBase64',
    setClipboard: 'setClipboardFromBase64',
    startRecordingScreen: 'startRecordingScreen',
    stopRecordingScreen: 'stopRecordingScreen',
    deleteFile: 'deleteFile',
    deleteFolder: 'deleteFolder',
    clickAndDrag: 'executeClickAndDrag',
    getDeviceTime: 'windowsGetDeviceTime',
    getWindowElement: 'getWindowElement',
    getMonitors: 'windowsGetMonitors',
    getDpiScale: 'executeGetDpiScale',
    findByVision: 'executeFindByVision',
    attachJavaSwing: 'executeAttachJavaSwing',
    switchToWindowByTitle: 'windowsSwitchToWindowByTitle',
    getWindows: 'windowsGetWindows',
    getNativeChildren: 'executeGetNativeChildren',
} as const);

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

export async function execute(this: AppiumDesktopDriver, script: string, args: any[]) {
    if (script.startsWith(PLATFORM_COMMAND_PREFIX)) {
        script = script.replace(PLATFORM_COMMAND_PREFIX, '').trim();
        this.log.info(`Executing command '${PLATFORM_COMMAND_PREFIX} ${script}'...`);

        if (!Object.hasOwn(EXTENSION_COMMANDS, script)) {
            throw new errors.UnknownCommandError(`Unknown command '${PLATFORM_COMMAND_PREFIX} ${script}'.`);
        }

        return await this[EXTENSION_COMMANDS[script]](...args);
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

export async function patternInvoke(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('invokeElement', { elementId: element[W3C_ELEMENT_KEY] });
}

async function expandViaAltDown(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    await this.sendCommand('setFocus', { elementId });
    await sleep(50);
    keyDown(Key.ALT);
    keyDown(Key.DOWN);
    keyUp(Key.DOWN);
    keyUp(Key.ALT);
}

// Legacy Win32 controls (e.g. WinForm ComboBox) sometimes expose ExpandCollapsePattern
// to the managed UIA2 client (System.Windows.Automation, what this driver used before the
// C# server migration) but not to the raw UIA3 COM interop the server uses now — same
// underlying uiautomationcore.dll, but the managed client engages the legacy Win32->UIA
// bridge more aggressively. Re-resolve the element by native window handle in a one-shot
// PowerShell process and retry Expand() through the managed API before falling back to
// simulated keyboard input.
async function expandViaManagedUia2(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    const nativeWindowHandle = await this.sendCommand('getProperty', { elementId, property: 'NativeWindowHandle' }) as string;
    const hwnd = Number(nativeWindowHandle);
    if (!hwnd) {
        throw new Error('Element has no NativeWindowHandle.');
    }

    const script = `
        Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
        $el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]${hwnd})
        $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
    `;
    await this.executePowerShellScript(script);
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

async function expandViaUia2ThenAltDown(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    try {
        await expandViaManagedUia2.call(this, elementId);
        if (await waitForExpanded.call(this, elementId) !== false) {
            this.log.info('[patternExpand] managed-UIA2 fallback succeeded.');
            return;
        }
        this.log.info('[patternExpand] managed-UIA2 fallback reported no error but ExpandCollapseState never became Expanded, falling back to ALT+Down.');
    } catch (uia2Err: any) {
        this.log.info(`[patternExpand] managed-UIA2 fallback failed (${String(uia2Err?.message ?? uia2Err)}), falling back to ALT+Down.`);
    }

    await expandViaAltDown.call(this, elementId);
    if (await waitForExpanded.call(this, elementId) === false) {
        throw new Error('windows: expand failed to open the control after native, managed-UIA2, and ALT+Down fallback attempts.');
    }
}

export async function patternExpand(this: AppiumDesktopDriver, element: Element): Promise<void> {
    const elementId = element[W3C_ELEMENT_KEY];

    try {
        await this.sendCommand('expandElement', { elementId });
    } catch (err: any) {
        const msg = String(err?.message ?? err);
        // Covers both JAB elements (JAB_NO_EXPAND_ACTION) and regular UIA elements
        // that expose no expand pattern — same fallback chain for both.
        if (msg.includes('JAB_NO_EXPAND_ACTION') || msg.includes('does not support ExpandCollapsePattern')) {
            this.log.info('[patternExpand] element has no expand pattern, falling back to managed-UIA2/ALT+Down.');
            return expandViaUia2ThenAltDown.call(this, elementId);
        }
        throw err;
    }

    // expandElement reported success, but the C# server's own LegacyIAccessible fallback
    // (PatternCommands.cs Expand) never gates on whether the popup actually opened —
    // verify the real ExpandCollapseState before trusting it. `undefined` means we
    // couldn't read the state at all; trust the reported success since there's no
    // stronger signal available in that case.
    if (await waitForExpanded.call(this, elementId) === false) {
        // Only retry via managed-UIA2 here — Expand() is idempotent and safe to call
        // again even if the control is already open. Do NOT fall through to ALT+Down:
        // it's a toggle on many native combos, so sending it after an unverified (but
        // possibly real) success risks closing a control that already opened correctly.
        this.log.info('[patternExpand] expandElement reported success but ExpandCollapseState never became Expanded, retrying via managed-UIA2.');
        try {
            await expandViaManagedUia2.call(this, elementId);
        } catch (uia2Err: any) {
            this.log.info(`[patternExpand] managed-UIA2 retry failed (${String(uia2Err?.message ?? uia2Err)}), trusting original expandElement success.`);
            return;
        }
        if (await waitForExpanded.call(this, elementId) === false) {
            this.log.info('[patternExpand] managed-UIA2 retry did not confirm ExpandCollapseState either, trusting original expandElement success.');
        }
    }
}

export async function patternCollapse(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('collapseElement', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternScrollIntoView(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('scrollElementIntoView', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternIsMultiple(this: AppiumDesktopDriver, element: Element): Promise<boolean> {
    const result = await this.sendCommand('isMultipleSelect', { elementId: element[W3C_ELEMENT_KEY] });
    return result === true || String(result).toLowerCase() === 'true';
}

export async function patternGetSelectedItem(this: AppiumDesktopDriver, element: Element): Promise<Element> {
    const result = await this.sendCommand('getSelectedElements', { elementId: element[W3C_ELEMENT_KEY] }) as string[];
    const elId = result?.[0];

    if (!elId) {
        throw new errors.NoSuchElementError();
    }

    return { [W3C_ELEMENT_KEY]: elId };
}

export async function patternGetAllSelectedItems(this: AppiumDesktopDriver, element: Element): Promise<Element[]> {
    const result = await this.sendCommand('getSelectedElements', { elementId: element[W3C_ELEMENT_KEY] }) as string[];
    return (result ?? []).map((elId) => ({ [W3C_ELEMENT_KEY]: elId }));
}

export async function patternAddToSelection(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('addToSelection', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternRemoveFromSelection(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('removeFromSelection', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternSelect(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('selectElement', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternToggle(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('toggleElement', { elementId: element[W3C_ELEMENT_KEY] });
}

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

export async function patternGetValue(this: AppiumDesktopDriver, element: Element): Promise<string> {
    return await this.sendCommand('getElementValue', { elementId: element[W3C_ELEMENT_KEY] }) as string;
}

export async function patternMaximize(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('maximizeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternMinimize(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('minimizeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternRestore(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('restoreWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function patternClose(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('closeWindow', { elementId: element[W3C_ELEMENT_KEY] });
}

export async function windowsCloseApp(this: AppiumDesktopDriver): Promise<void> {
    return await this.closeApp();
}

export async function windowsSwitchToWindowByTitle(
    this: AppiumDesktopDriver,
    args?: { title?: string; exact?: boolean },
): Promise<void> {
    if (!args?.title) {
        throw new errors.InvalidArgumentError('switchToWindowByTitle requires a "title" argument.');
    }
    return await this.switchToWindowByTitle({ title: args.title, exact: args.exact });
}

export async function windowsGetWindows(): Promise<Array<{ handle: string; title: string; className: string }>> {
    return getAllWindowsWithDetails();
}

export async function windowsLaunchApp(this: AppiumDesktopDriver): Promise<void> {
    return await this.launchApp();
}

export async function focusElement(this: AppiumDesktopDriver, element: Element): Promise<void> {
    await this.sendCommand('setFocus', { elementId: element[W3C_ELEMENT_KEY] });
}

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

export async function deleteFile(this: AppiumDesktopDriver, args: { path: string }): Promise<void> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!args || typeof args !== 'object' || !args.path) {
        throw new errors.InvalidArgumentError("'path' must be provided.");
    }
    await this.sendCommand('deleteFile', { path: args.path });
}

export async function deleteFolder(this: AppiumDesktopDriver, args: { path: string, recursive?: boolean }): Promise<void> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!args || typeof args !== 'object' || !args.path) {
        throw new errors.InvalidArgumentError("'path' must be provided.");
    }
    await this.sendCommand('deleteFolder', { path: args.path, recursive: args.recursive ?? true });
}

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

export async function windowsGetDeviceTime(this: AppiumDesktopDriver, args?: { format?: string }): Promise<string> {
    return this.getDeviceTime(undefined, args?.format);
}

export async function getWindowElement(this: AppiumDesktopDriver): Promise<Element> {
    const elementId = await this.sendCommand('saveRootElementToTable', {}) as string;
    if (!elementId) {
        throw new errors.NoSuchWindowError('No active app window is found for this session.');
    }
    return { [W3C_ELEMENT_KEY]: elementId };
}

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

export async function pullFile(this: AppiumDesktopDriver, remotePath: string): Promise<string> {
    this.assertFeatureEnabled(MODIFY_FS_FEATURE);
    if (!remotePath) {
        throw new errors.InvalidArgumentError("'remotePath' must be provided.");
    }
    const data = await readFile(remotePath);
    return data.toString('base64');
}

export async function windowsGetMonitors(this: AppiumDesktopDriver): Promise<object[]> {
    return await this.sendCommand('getMonitors', {}) as object[];
}

export function executeGetDpiScale(): number {
    return getResolutionScalingFactor();
}

export async function executeAttachJavaSwing(this: AppiumDesktopDriver, opts: { jdkPath?: string } = {}): Promise<void> {
    // Injects the Java agent into the JVM owning the current root window,
    // then connects. The C# side resolves the PID from the root element's HWND.
    const jdkPath = opts.jdkPath ?? this.caps.jdkPath;
    await this.sendCommand('injectJavaAgent', { jdkPath });
}
