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

/**
 * `executeMethod` wrapper for {@link patternInvoke}.
 * @param elementId - The id of the element to invoke.
 * @returns Resolves once the Invoke pattern has been triggered.
 */
export async function emInvoke(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternInvoke.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternExpand}.
 * @param elementId - The id of the element to expand.
 * @returns Resolves once the Expand/Collapse pattern's Expand has been triggered.
 */
export async function emExpand(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternExpand.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternCollapse}.
 * @param elementId - The id of the element to collapse.
 * @returns Resolves once the Expand/Collapse pattern's Collapse has been triggered.
 */
export async function emCollapse(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternCollapse.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternIsMultiple}.
 * @param elementId - The id of the element to check.
 * @returns True if the element's Selection pattern allows multiple selection.
 */
export async function emIsMultiple(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    return await patternIsMultiple.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternScrollIntoView}.
 * @param elementId - The id of the element to scroll into view.
 * @returns Resolves once the ScrollItem pattern has been triggered.
 */
export async function emScrollIntoView(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternScrollIntoView.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternGetSelectedItem}.
 * @param elementId - The id of the container element (Selection pattern) to query.
 * @returns The currently selected element.
 */
export async function emSelectedItem(this: AppiumDesktopDriver, elementId: string): Promise<Element> {
    return await patternGetSelectedItem.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternGetAllSelectedItems}.
 * @param elementId - The id of the container element (Selection pattern) to query.
 * @returns All currently selected elements.
 */
export async function emAllSelectedItems(this: AppiumDesktopDriver, elementId: string): Promise<Element[]> {
    return await patternGetAllSelectedItems.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternAddToSelection}.
 * @param elementId - The id of the element to add to the current selection.
 * @returns Resolves once the SelectionItem pattern's AddToSelection has been triggered.
 */
export async function emAddToSelection(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternAddToSelection.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternRemoveFromSelection}.
 * @param elementId - The id of the element to remove from the current selection.
 * @returns Resolves once the SelectionItem pattern's RemoveFromSelection has been triggered.
 */
export async function emRemoveFromSelection(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternRemoveFromSelection.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternSelect}.
 * @param elementId - The id of the element to select.
 * @returns Resolves once the SelectionItem pattern's Select has been triggered.
 */
export async function emSelect(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternSelect.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternToggle}.
 * @param elementId - The id of the element to toggle.
 * @returns Resolves once the Toggle pattern has been triggered.
 */
export async function emToggle(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternToggle.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternGetValue}.
 * @param elementId - The id of the element to read the Value pattern's value from.
 * @returns The element's value.
 */
export async function emGetValue(this: AppiumDesktopDriver, elementId: string): Promise<string> {
    return await patternGetValue.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternMaximize}.
 * @param elementId - The id of the element to maximize.
 * @returns Resolves once the Window pattern's Maximize has been triggered.
 */
export async function emMaximize(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternMaximize.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternMinimize}.
 * @param elementId - The id of the element to minimize.
 * @returns Resolves once the Window pattern's Minimize has been triggered.
 */
export async function emMinimize(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternMinimize.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternRestore}.
 * @param elementId - The id of the element to restore.
 * @returns Resolves once the Window pattern's Restore has been triggered.
 */
export async function emRestore(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternRestore.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link patternClose}.
 * @param elementId - The id of the element to close.
 * @returns Resolves once the Window pattern's Close has been triggered.
 */
export async function emClose(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await patternClose.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link focusElement}.
 * @param elementId - The id of the element to focus.
 * @returns Resolves once focus has been set.
 */
export async function emSetFocus(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    return await focusElement.call(this, toElement(elementId));
}

/**
 * `executeMethod` wrapper for {@link executeGetNativeChildren}.
 * @param elementId - The id of the element whose native MSAA children should be walked.
 * @returns The MSAA accessible tree rooted at the element.
 */
export async function emGetNativeChildren(this: AppiumDesktopDriver, elementId: string) {
    return await executeGetNativeChildren.call(this, toElement(elementId));
}

// --- Element + value ---

/**
 * `executeMethod` wrapper for {@link patternSetValue}.
 * @param elementId - The id of the element to set.
 * @param value - The value to set via the Value pattern.
 * @returns Resolves once the value has been set.
 */
export async function emSetValue(this: AppiumDesktopDriver, elementId: string, value: string): Promise<void> {
    return await patternSetValue.call(this, toElement(elementId), value);
}

// --- Flat optional-field objects ---

/**
 * `executeMethod` wrapper for {@link pushCacheRequest}.
 * @param treeScope - The UIA cache request tree scope.
 * @param treeFilter - The UIA cache request tree filter condition.
 * @param automationElementMode - The UIA automation element mode (`Full` or `None`).
 * @returns Resolves once the cache request has been pushed.
 */
export async function emCacheRequest(
    this: AppiumDesktopDriver,
    treeScope?: string,
    treeFilter?: string,
    automationElementMode?: string,
): Promise<void> {
    return await pushCacheRequest.call(this, { treeScope, treeFilter, automationElementMode });
}

/**
 * `executeMethod` wrapper for {@link windowsGetDeviceTime}.
 * @param format - A .NET custom date/time format string; defaults to ISO 8601.
 * @returns The formatted date/time string.
 */
export async function emGetDeviceTime(this: AppiumDesktopDriver, format?: string): Promise<string> {
    return await windowsGetDeviceTime.call(this, { format });
}

/**
 * `executeMethod` wrapper for {@link windowsSwitchToWindowByTitle}.
 * @param title - The window title to match.
 * @param exact - If true, require an exact match; otherwise match a substring.
 * @returns Resolves once the root element has been switched.
 */
export async function emSwitchToWindowByTitle(
    this: AppiumDesktopDriver,
    title?: string,
    exact?: boolean,
): Promise<void> {
    return await windowsSwitchToWindowByTitle.call(this, { title, exact });
}

/**
 * `executeMethod` wrapper for {@link executeAttachJavaSwing}.
 * @param jdkPath - Optional path to the JDK to use for attaching the Java Access Bridge.
 * @returns Resolves once the Java Swing session has been attached.
 */
export async function emAttachJavaSwing(this: AppiumDesktopDriver, jdkPath?: string): Promise<void> {
    return await executeAttachJavaSwing.call(this, { jdkPath });
}

/**
 * `executeMethod` wrapper for {@link setClipboardFromBase64}.
 * @param b64Content - Base64-encoded clipboard content to set.
 * @param contentType - The clipboard content type (e.g. text vs. file drop list).
 * @returns Confirmation/result string from setting the clipboard.
 */
export async function emSetClipboard(
    this: AppiumDesktopDriver,
    b64Content: string,
    contentType?: string,
): Promise<string> {
    return await setClipboardFromBase64.call(this, { b64Content, contentType: contentType as any });
}

/**
 * `executeMethod` wrapper for {@link deleteFile}.
 * @param path - Path of the file to delete on the machine running the session.
 * @returns Resolves once the file has been deleted.
 */
export async function emDeleteFile(this: AppiumDesktopDriver, path: string): Promise<void> {
    return await deleteFile.call(this, { path });
}

/**
 * `executeMethod` wrapper for {@link deleteFolder}.
 * @param path - Path of the folder to delete on the machine running the session.
 * @param recursive - Whether to delete non-empty folders recursively.
 * @returns Resolves once the folder has been deleted.
 */
export async function emDeleteFolder(this: AppiumDesktopDriver, path: string, recursive?: boolean): Promise<void> {
    return await deleteFolder.call(this, { path, recursive });
}

/**
 * `executeMethod` wrapper for {@link executeKeys}.
 * @param actions - The key action sequence(s) to send.
 * @param forceUnicode - Whether to force Unicode key input instead of virtual-key codes.
 * @returns Resolves once the key actions have been sent.
 */
export async function emKeys(this: AppiumDesktopDriver, actions: any, forceUnicode?: boolean) {
    return await executeKeys.call(this, { actions, forceUnicode: forceUnicode ?? false });
}

/**
 * `executeMethod` wrapper for {@link executeClick}.
 * @param elementId - The id of the element to click, or omitted to click at raw coordinates.
 * @param x - X coordinate to click, when not clicking an element (or as an offset within it).
 * @param y - Y coordinate to click, when not clicking an element (or as an offset within it).
 * @param button - Which mouse button to click.
 * @param modifierKeys - Modifier key(s) held during the click.
 * @param durationMs - Duration of the pointer move before clicking.
 * @param times - Number of times to click (e.g. 2 for a double-click).
 * @param interClickDelayMs - Delay between repeated clicks.
 * @returns Resolves once the click(s) have been performed.
 */
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

/**
 * `executeMethod` wrapper for {@link executeHover}.
 * @param startElementId - The id of the element to start hovering from, if any.
 * @param startX - X coordinate to start from, when not starting from an element.
 * @param startY - Y coordinate to start from, when not starting from an element.
 * @param endElementId - The id of the element to hover over, if any.
 * @param endX - X coordinate to end at, when not ending on an element.
 * @param endY - Y coordinate to end at, when not ending on an element.
 * @param modifierKeys - Modifier key(s) held during the hover.
 * @param durationMs - Duration of the pointer move.
 * @returns Resolves once the hover move has completed.
 */
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

/**
 * `executeMethod` wrapper for {@link executeScroll}.
 * @param elementId - The id of the element to scroll at, or omitted to scroll at raw coordinates.
 * @param x - X coordinate to position the cursor at before scrolling.
 * @param y - Y coordinate to position the cursor at before scrolling.
 * @param deltaX - Horizontal scroll amount.
 * @param deltaY - Vertical scroll amount.
 * @param modifierKeys - Modifier key(s) held during the scroll.
 * @returns Resolves once the scroll has been performed.
 */
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

/**
 * `executeMethod` wrapper for {@link executeClickAndDrag}.
 * @param startElementId - The id of the element to start the drag from, if any.
 * @param startX - X coordinate to start the drag from, when not starting from an element.
 * @param startY - Y coordinate to start the drag from, when not starting from an element.
 * @param endElementId - The id of the element to drop onto, if any.
 * @param endX - X coordinate to drop at, when not ending on an element.
 * @param endY - Y coordinate to drop at, when not ending on an element.
 * @param modifierKeys - Modifier key(s) held during the drag.
 * @param durationMs - Duration of the drag movement.
 * @param button - Which mouse button to hold down during the drag.
 * @returns Resolves once the click-and-drag has completed.
 */
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

/**
 * `executeMethod` wrapper for {@link startRecordingScreen}.
 * @param outputPath - Local file path to write the recording to.
 * @param timeLimit - Maximum recording duration, in seconds.
 * @param videoFps - Frames per second to record at.
 * @param videoFilter - Optional FFmpeg video filter string.
 * @param preset - FFmpeg encoder preset (e.g. `ultrafast`).
 * @param captureCursor - Whether to include the mouse cursor in the recording.
 * @param captureClicks - Whether to visually highlight mouse clicks in the recording.
 * @param audioInput - Optional audio input device to record from.
 * @param forceRestart - Whether to stop and discard any in-progress recording before starting.
 * @returns Resolves once recording has started.
 */
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

/**
 * `executeMethod` wrapper for {@link stopRecordingScreen}.
 * @param remotePath - Optional URL to upload the finished recording to.
 * @param user - Basic auth username for the upload request.
 * @param pass - Basic auth password for the upload request.
 * @param method - HTTP method to use for the upload (default `POST`).
 * @param headers - Extra HTTP headers to send with the upload request.
 * @param fileFieldName - Multipart form field name for the video file.
 * @param formFields - Additional multipart form fields to send with the upload.
 * @returns Base64-encoded recording content, or the upload response if `remotePath` was given.
 */
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

/**
 * `executeMethod` wrapper for {@link executeGetDpiScale}.
 * @returns The current display's DPI scaling factor.
 */
export async function emGetDpiScale(this: AppiumDesktopDriver): Promise<number> {
    return executeGetDpiScale.call(this);
}

/**
 * `executeMethod` wrapper for {@link executeFindByVision}.
 * @param prompt - A natural-language description of the element to locate.
 * @param model - The vision model id to use.
 * @param includeAnnotatedImage - Whether to include a base64 annotated screenshot in the result.
 * @returns The located element's screen coordinates, a label, and the reasoning steps taken.
 */
export async function emFindByVision(
    this: AppiumDesktopDriver,
    prompt: string,
    model: string,
    includeAnnotatedImage?: boolean,
) {
    return await executeFindByVision.call(this, { prompt, model, includeAnnotatedImage });
}
