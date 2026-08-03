/**
 * Thin bridging layer for the standard Appium `executeMethodMap` descriptor pattern
 * (see `lib/execute-method-map.ts`). `BaseDriver.prototype.executeMethod` flattens the
 * single args object clients send into positional arguments (per the map entry's
 * `params.required`/`params.optional` order), so every wrapper here accepts individual
 * named params and reassembles them into the object shape the existing `windows:`
 * implementations (in `extension.ts` / `native.ts` / `vision.ts`) already expect.
 * Behavior is not duplicated here - each wrapper just bridges args and delegates.
 */
import { W3C_ELEMENT_KEY } from '@appium/base-driver';
import { Element } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';
import { ClickType } from '../enums';
import { executeGetNativeChildren } from './native';
import { executeFindByVision } from './vision';
import {
    patternInvoke,
    patternExpand,
    patternCollapse,
    patternIsMultiple,
    patternScrollIntoView,
    patternGetSelectedItem,
    patternGetAllSelectedItems,
    patternAddToSelection,
    patternRemoveFromSelection,
    patternSelect,
    patternToggle,
    patternSetValue,
    patternGetValue,
    patternMaximize,
    patternMinimize,
    patternRestore,
    patternClose,
    focusElement,
    windowsGetDeviceTime,
    windowsSwitchToWindowByTitle,
    executeAttachJavaSwing,
    setClipboardFromBase64,
    deleteFile,
    deleteFolder,
    executeKeys,
    executeClick,
    executeHover,
    executeScroll,
    executeClickAndDrag,
    startRecordingScreen,
    stopRecordingScreen,
    pushCacheRequest,
    executeGetDpiScale,
} from './extension';

function toElement(elementId: string): Element {
    return { [W3C_ELEMENT_KEY]: elementId } as Element;
}

// --- Element-only wrappers ---

export async function emInvoke(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternInvoke.call(this, toElement(elementId));
}

export async function emExpand(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternExpand.call(this, toElement(elementId));
}

export async function emCollapse(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternCollapse.call(this, toElement(elementId));
}

export async function emIsMultiple(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    return await patternIsMultiple.call(this, toElement(elementId));
}

export async function emScrollIntoView(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternScrollIntoView.call(this, toElement(elementId));
}

export async function emSelectedItem(this: AppiumDesktopDriver, elementId: string): Promise<Element> {
    return await patternGetSelectedItem.call(this, toElement(elementId));
}

export async function emAllSelectedItems(this: AppiumDesktopDriver, elementId: string): Promise<Element[]> {
    return await patternGetAllSelectedItems.call(this, toElement(elementId));
}

export async function emAddToSelection(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternAddToSelection.call(this, toElement(elementId));
}

export async function emRemoveFromSelection(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternRemoveFromSelection.call(this, toElement(elementId));
}

export async function emSelect(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternSelect.call(this, toElement(elementId));
}

export async function emToggle(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternToggle.call(this, toElement(elementId));
}

export async function emGetValue(this: AppiumDesktopDriver, elementId: string): Promise<string> {
    return await patternGetValue.call(this, toElement(elementId));
}

export async function emMaximize(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternMaximize.call(this, toElement(elementId));
}

export async function emMinimize(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternMinimize.call(this, toElement(elementId));
}

export async function emRestore(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternRestore.call(this, toElement(elementId));
}

export async function emClose(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternClose.call(this, toElement(elementId));
}

export async function emSetFocus(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await focusElement.call(this, toElement(elementId));
}

export async function emGetNativeChildren(this: AppiumDesktopDriver, elementId: string) {
    return await executeGetNativeChildren.call(this, toElement(elementId));
}

// --- Element + value ---

export async function emSetValue(this: AppiumDesktopDriver, elementId: string, value: string): Promise<void> {
    return await patternSetValue.call(this, toElement(elementId), value);
}

// --- Flat optional-field objects ---

export async function emCacheRequest(
    this: AppiumDesktopDriver,
    treeScope?: string,
    treeFilter?: string,
    automationElementMode?: string,
): Promise<void> {
    return await pushCacheRequest.call(this, { treeScope, treeFilter, automationElementMode });
}

export async function emGetDeviceTime(this: AppiumDesktopDriver, format?: string): Promise<string> {
    return await windowsGetDeviceTime.call(this, { format });
}

export async function emSwitchToWindowByTitle(
    this: AppiumDesktopDriver,
    title?: string,
    exact?: boolean,
): Promise<void> {
    return await windowsSwitchToWindowByTitle.call(this, { title, exact });
}

export async function emAttachJavaSwing(this: AppiumDesktopDriver, jdkPath?: string): Promise<void> {
    return await executeAttachJavaSwing.call(this, { jdkPath });
}

export async function emSetClipboard(
    this: AppiumDesktopDriver,
    b64Content: string,
    contentType?: string,
): Promise<string> {
    return await setClipboardFromBase64.call(this, { b64Content, contentType: contentType as any });
}

export async function emDeleteFile(this: AppiumDesktopDriver, path: string): Promise<void> {
    return await deleteFile.call(this, { path });
}

export async function emDeleteFolder(this: AppiumDesktopDriver, path: string, recursive?: boolean): Promise<void> {
    return await deleteFolder.call(this, { path, recursive });
}

export async function emKeys(this: AppiumDesktopDriver, actions: any, forceUnicode?: boolean) {
    return await executeKeys.call(this, { actions, forceUnicode: forceUnicode ?? false });
}

export async function emClick(
    this: AppiumDesktopDriver,
    elementId?: string,
    x?: number,
    y?: number,
    button?: ClickType,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
    times?: number,
    interClickDelayMs?: number,
) {
    return await executeClick.call(this, { elementId, x, y, button, modifierKeys, durationMs, times, interClickDelayMs });
}

export async function emHover(
    this: AppiumDesktopDriver,
    startElementId?: string,
    startX?: number,
    startY?: number,
    endElementId?: string,
    endX?: number,
    endY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
) {
    return await executeHover.call(this, { startElementId, startX, startY, endElementId, endX, endY, modifierKeys, durationMs });
}

export async function emScroll(
    this: AppiumDesktopDriver,
    elementId?: string,
    x?: number,
    y?: number,
    deltaX?: number,
    deltaY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
) {
    return await executeScroll.call(this, { elementId, x, y, deltaX, deltaY, modifierKeys });
}

export async function emClickAndDrag(
    this: AppiumDesktopDriver,
    startElementId?: string,
    startX?: number,
    startY?: number,
    endElementId?: string,
    endX?: number,
    endY?: number,
    modifierKeys?: ('shift' | 'ctrl' | 'alt' | 'win') | ('shift' | 'ctrl' | 'alt' | 'win')[],
    durationMs?: number,
    button?: ClickType,
) {
    return await executeClickAndDrag.call(this, { startElementId, startX, startY, endElementId, endX, endY, modifierKeys, durationMs, button });
}

export async function emStartRecordingScreen(
    this: AppiumDesktopDriver,
    outputPath?: string,
    timeLimit?: number,
    videoFps?: number,
    videoFilter?: string,
    preset?: string,
    captureCursor?: boolean,
    captureClicks?: boolean,
    audioInput?: string,
    forceRestart?: boolean,
): Promise<void> {
    return await startRecordingScreen.call(this, {
        outputPath, timeLimit, videoFps, videoFilter, preset, captureCursor, captureClicks, audioInput, forceRestart,
    });
}

export async function emStopRecordingScreen(
    this: AppiumDesktopDriver,
    remotePath?: string,
    user?: string,
    pass?: string,
    method?: string,
    headers?: Record<string, string>,
    fileFieldName?: string,
    formFields?: Array<[string, string]> | Record<string, string>,
): Promise<string> {
    return await stopRecordingScreen.call(this, { remotePath, user, pass, method, headers, fileFieldName, formFields });
}

export async function emGetDpiScale(this: AppiumDesktopDriver): Promise<number> {
    return executeGetDpiScale.call(this);
}

export async function emFindByVision(
    this: AppiumDesktopDriver,
    prompt: string,
    model: string,
    includeAnnotatedImage?: boolean,
) {
    return await executeFindByVision.call(this, { prompt, model, includeAnnotatedImage });
}
