/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Element, Rect } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';
import { propertyCondition, andCondition, orCondition } from '../server/conditions';
import { errors, W3C_ELEMENT_KEY } from '@appium/base-driver';
import { mouseDown, mouseMoveAbsolute, mouseUp, getCursorPos } from '../winapi/user32';
import { Key } from '../enums';
import { sleep } from '../util';
import type { RectResult } from '../server/protocol';

/**
 * Reads a UI Automation property value from an element.
 * @param propertyName - The UIA property name (e.g. `Name`, `IsEnabled`, `ControlType`).
 * @param elementId - The id of the element to read from.
 * @returns The property value as a string.
 */
export async function getProperty(this: AppiumDesktopDriver, propertyName: string, elementId: string): Promise<string> {
    return await this.sendCommand('getProperty', { elementId, property: propertyName }) as string;
}

/**
 * Legacy WebDriver attribute getter, retained for compatibility; delegates to {@link getProperty}
 * outside of IE context.
 * @param propertyName - The attribute/property name to read.
 * @param elementId - The id of the element to read from.
 * @returns The attribute value.
 */
export async function getAttribute(this: AppiumDesktopDriver, propertyName: string, elementId: string) {
    if (this.isIEContext()) {
        return this.ieSession!.getAttribute(elementId, propertyName);
    }
    this.log.warn('Warning: Use getProperty instead of getAttribute for retrieving element properties.');
    return await this.getProperty(propertyName, elementId);
}

/**
 * Finds the currently focused UI element.
 * @returns A WebDriver element reference for the focused element.
 */
export async function active(this: AppiumDesktopDriver): Promise<Element> {
    const elementId = await this.sendCommand('findElementFocused', {}) as string;
    return { [W3C_ELEMENT_KEY]: elementId };
}

/**
 * Gets an element's tag name (its UIA control type).
 * @param elementId - The id of the element to inspect.
 * @returns The element's tag/control-type name.
 */
export async function getName(this: AppiumDesktopDriver, elementId: string): Promise<string> {
    if (this.isIEContext()) {
        return (await this.ieSession!.getAttribute(elementId, 'tagName')) ?? '';
    }
    return await this.sendCommand('getTagName', { elementId }) as string;
}

/**
 * Reads an element's visible text via its UIA TextPattern.
 * @param elementId - The id of the element to read text from.
 * @returns The element's text, with embedded-object placeholder characters stripped.
 */
export async function getText(this: AppiumDesktopDriver, elementId: string): Promise<string> {
    if (this.isIEContext()) {
        return this.ieSession!.getText(elementId);
    }
    const text = await this.sendCommand('getText', { elementId }) as string;
    // U+FFFC (Object Replacement Character) appears in UIA TextPattern results for embedded objects/placeholders
    return text.replace(/\uFFFC/g, '');
}

/**
 * Clears an element's value by setting it to an empty string.
 * @param elementId - The id of the element to clear.
 * @returns Resolves once the element has been cleared.
 */
export async function clear(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    if (this.isIEContext()) {
        await this.ieSession!.clear(elementId);
        return;
    }
    await this.sendCommand('setElementValue', { elementId, value: '' });
}

/**
 * Sends text/keys to an element, focusing it first and translating WebDriver modifier-key
 * sequences (shift/ctrl/meta/alt) and special keys into key-down/key-up events interleaved
 * with plain text sent via `sendKeys`. Java agent elements bypass focus/sendKeys and are set
 * directly via `setElementValue`.
 * @param value - The text to send, either as a string or an array of characters/key values.
 * @param elementId - The id of the element to send the value to.
 * @returns Resolves once all characters and key actions have been sent.
 */
export async function setValue(this: AppiumDesktopDriver, value: string | string[], elementId: string): Promise<void> {
    if (this.isIEContext()) {
        const text = Array.isArray(value) ? value.join('') : value;
        await this.ieSession!.setValue(elementId, text);
        return;
    }
    // Java agent elements: sendKeys goes to the OS-focused field regardless of elementId.
    // Use setElementValue which targets the element directly via AccessibleEditableText.
    if (elementId.startsWith('java:')) {
        const text = Array.isArray(value) ? value.join('') : value;
        await this.sendCommand('setElementValue', { elementId, value: text });
        return;
    }
    await this.sendCommand('setFocus', { elementId });
    const metaKeyStates = {
        shift: false,
        ctrl: false,
        meta: false,
        alt: false,
    };

    if (!Array.isArray(value)) {
        value = value.split('');
    }

    let keysToSend: string[] = [];

    const sendKeysAndResetArray = async () => {
        if (keysToSend.length > 0) {
            await this.sendCommand('sendKeys', { text: keysToSend.join('') });
            keysToSend = [];
        }
    };

    for (const char of value) {
        switch (char) {
            case Key.SHIFT:
            case Key.R_SHIFT:
                await sendKeysAndResetArray();
                if (metaKeyStates.shift) {
                    metaKeyStates.shift = false;
                    await this.handleKeyActionSequence({
                        type: 'key',
                        id: 'default keyboard',
                        actions: [{ type: 'keyUp', value: char }]
                    });
                    break;
                }

                metaKeyStates.shift = true;
                await this.handleKeyActionSequence({
                    type: 'key',
                    id: 'default keyboard',
                    actions: [{ type: 'keyDown', value: char }]
                });
                break;
            case Key.CONTROL:
            case Key.R_CONTROL:
                await sendKeysAndResetArray();
                if (metaKeyStates.ctrl) {
                    metaKeyStates.ctrl = false;
                    await this.handleKeyActionSequence({
                        type: 'key',
                        id: 'default keyboard',
                        actions: [{ type: 'keyUp', value: char }]
                    });
                    break;
                }

                metaKeyStates.ctrl = true;
                await this.handleKeyActionSequence({
                    type: 'key',
                    id: 'default keyboard',
                    actions: [{ type: 'keyDown', value: char }]
                });
                break;
            case Key.META:
            case Key.R_META:
                await sendKeysAndResetArray();
                if (metaKeyStates.meta) {
                    metaKeyStates.meta = false;
                    await this.handleKeyActionSequence({
                        type: 'key',
                        id: 'default keyboard',
                        actions: [{ type: 'keyUp', value: char }]
                    });
                    break;
                }

                metaKeyStates.meta = true;
                await this.handleKeyActionSequence({
                    type: 'key',
                    id: 'default keyboard',
                    actions: [{ type: 'keyDown', value: char }]
                });
                break;
            case Key.ALT:
            case Key.R_ALT:
                await sendKeysAndResetArray();
                if (metaKeyStates.alt) {
                    metaKeyStates.alt = false;
                    await this.handleKeyActionSequence({
                        type: 'key',
                        id: 'default keyboard',
                        actions: [{ type: 'keyUp', value: char }]
                    });
                    break;
                }

                metaKeyStates.alt = true;
                await this.handleKeyActionSequence({
                    type: 'key',
                    id: 'default keyboard',
                    actions: [{ type: 'keyDown', value: char }]
                });
                break;
            default:
                if (char.charCodeAt(0) >= 0xE000) {
                    await sendKeysAndResetArray();
                    await this.handleKeyActionSequence({
                        type: 'key',
                        id: 'default keyboard',
                        actions: [{ type: 'keyDown', value: char }, { type: 'keyUp', value: char }]
                    });
                } else {
                    keysToSend.push(char.replace(/[+^%~()]/, '{$&}'));
                }
        }
    }

    await sendKeysAndResetArray();
}

/**
 * Gets an element's bounding rectangle, translated from screen coordinates into
 * coordinates relative to the session's root window.
 * @param elementId - The id of the element to measure.
 * @returns The element's rect (x, y, width, height) relative to the root window.
 */
export async function getElementRect(this: AppiumDesktopDriver, elementId: string): Promise<Rect> {
    if (this.isIEContext()) {
        throw new errors.NotYetImplementedError();
    }
    const rect = await this.sendCommand('getRect', { elementId }) as RectResult;
    const rootRect = await this.sendCommand('getRootRect', {}) as RectResult;
    rect.x -= rootRect.x;
    rect.y -= rootRect.y;
    rect.x = Math.min(0x7FFFFFFF, rect.x);
    rect.y = Math.min(0x7FFFFFFF, rect.y);
    return rect;
}

/**
 * Checks whether an element is currently displayed on screen.
 * @param elementId - The id of the element to check.
 * @returns True if the element is on screen (not marked `IsOffscreen`).
 */
export async function elementDisplayed(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    if (this.isIEContext()) {
        return this.ieSession!.isDisplayed(elementId);
    }
    const result = await this.sendCommand('getProperty', { elementId, property: 'IsOffscreen' });
    // UIA3 getProperty returns a JS boolean for bool-typed properties; the old
    // PowerShell/UIA1 path returned the stringified "True"/"False". Handle both.
    const isOffscreen = typeof result === 'boolean' ? result : String(result).toLowerCase() === 'true';
    return !isOffscreen;
}

// TODO: find better way to handle whether to use select or toggle
/**
 * Checks whether an element is selected, preferring the UIA SelectionItem pattern and
 * falling back to the Toggle pattern's on/off state.
 * @param elementId - The id of the element to check.
 * @returns True if the element is selected or toggled on.
 */
export async function elementSelected(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    if (this.isIEContext()) {
        return this.ieSession!.isSelected(elementId);
    }
    try {
        const result = await this.sendCommand('isElementSelected', { elementId }) as boolean;
        return result === true || String(result) === 'True';
    } catch {
        const result = await this.sendCommand('getToggleState', { elementId }) as string;
        return result === 'On';
    }
}

/**
 * Checks whether an element is enabled.
 * @param elementId - The id of the element to check.
 * @returns True if the element's `IsEnabled` property is true.
 */
export async function elementEnabled(this: AppiumDesktopDriver, elementId: string): Promise<boolean> {
    if (this.isIEContext()) {
        return this.ieSession!.isEnabled(elementId);
    }
    const result = await this.sendCommand('getProperty', { elementId, property: 'IsEnabled' });
    return typeof result === 'boolean' ? result : String(result).toLowerCase() === 'true';
}

/**
 * Clicks an element by moving the native cursor to its clickable point and issuing a real
 * mouse down/up. Focuses a focusable Pane/Window ancestor first unless the target is a menu
 * item (focusing an ancestor would close the open popup), and re-checks the clickable point
 * for WPF popups that are still animating into place.
 * @param elementId - The id of the element to click.
 * @returns Resolves once the click has been dispatched and the post-click settle delay elapses.
 */
export async function click(this: AppiumDesktopDriver, elementId: string): Promise<void> {
    if (this.isIEContext()) {
        await this.ieSession!.click(elementId);
        return;
    }
    const easingFunction = this.caps.smoothPointerMove;

    // Detect menu items up-front — focusing an ancestor Pane/Window closes
    // the open popup, so subsequent ClickablePoint reads return stale coords
    // and the mouse click lands on empty space. WPF menus in particular lose
    // their dropdown on focus-change. Menu items don't need pre-focus anyway;
    // the mouseDown/mouseUp activates them directly.
    let controlType = '';
    try {
        controlType = await this.sendCommand('getProperty', { elementId, property: 'ControlType' }) as string;
    } catch {
        // not fatal — fall through, we just won't know the type
    }
    const isMenuItem = controlType === 'MenuItem' || controlType === 'Menu' || controlType === 'MenuBar';

    if (!isMenuItem) {
        const focusCondition = andCondition(
            propertyCondition('IsKeyboardFocusable', true),
            orCondition(
                propertyCondition('ControlType', 'Pane'),
                propertyCondition('ControlType', 'Window'),
            ),
        );

        try {
            const focusableElementId = await this.sendCommand('findElement', {
                scope: 'ancestors-or-self',
                condition: focusCondition,
                contextElementId: elementId,
            }) as string | null;
            if (focusableElementId) {
                await this.sendCommand('setFocus', { elementId: focusableElementId.trim() });
            }
        } catch {
            // ignore if it fails, focus may fail if there is a forced popup window
        }
    }

    const coordinates = {
        x: undefined as number | undefined,
        y: undefined as number | undefined,
    };

    try {
        const clickablePoint = await this.sendCommand('getProperty', { elementId, property: 'ClickablePoint' }) as { x: number; y: number };
        if (clickablePoint && typeof clickablePoint === 'object' && typeof clickablePoint.x === 'number' && typeof clickablePoint.y === 'number') {
            coordinates.x = clickablePoint.x;
            coordinates.y = clickablePoint.y;
        } else {
            throw new Error('Invalid clickable point');
        }
    } catch {
        const rect = await this.sendCommand('getRect', { elementId }) as RectResult;
        coordinates.x = rect.x + rect.width / 2;
        coordinates.y = rect.y + rect.height / 2;
    }

    // Teleport for menu items (an interpolated path crosses sibling items and
    // WPF hover-opens their submenus mid-flight); non-menu callers can opt
    // into an interpolated path via delayBeforeClick + smoothPointerMove.
    const moveDuration = isMenuItem ? 0 : (this.caps.delayBeforeClick ?? 0);
    this.log.debug(`click(${elementId}) controlType=${controlType || '?'} coords=(${coordinates.x},${coordinates.y}) menu=${isMenuItem}`);
    await mouseMoveAbsolute(coordinates.x!, coordinates.y!, moveDuration, easingFunction);

    if (isMenuItem) {
        // WPF ContextMenu items need the WM_MOUSEMOVE to be fully processed
        // before WM_LBUTTONDOWN arrives. Without this gap, the popup's hover
        // tracker hasn't yet marked the target as IsMouseOver, so the click
        // is routed to the popup background and silently dismissed.
        await sleep(100);

        // Re-check ClickablePoint: the popup can still be animating when the
        // initial coordinate read happened (observed 14 px y-drift between
        // consecutive runs of the same click, first one fast enough to catch
        // the popup mid-flight). If the coord moved meaningfully, re-teleport
        // to the final position; otherwise the stale coord lands on the
        // sibling item below/above the target.
        try {
            const refreshed = await this.sendCommand('getProperty', { elementId, property: 'ClickablePoint' }) as { x: number; y: number };
            const drift = Math.abs(refreshed.x - coordinates.x!) + Math.abs(refreshed.y - coordinates.y!);
            if (drift > 2) {
                this.log.debug(`click(${elementId}) popup settled: (${coordinates.x},${coordinates.y}) → (${refreshed.x},${refreshed.y}) — re-teleporting`);
                coordinates.x = refreshed.x;
                coordinates.y = refreshed.y;
                await mouseMoveAbsolute(coordinates.x, coordinates.y, 0, easingFunction);
                await sleep(100);
            }
        } catch {
            // ClickablePoint no longer available — fall through with the
            // original coords; better to click the old spot than skip.
        }

        const afterMovePos = getCursorPos();
        if (afterMovePos) {
            const cursorDrift = Math.abs(afterMovePos.x - coordinates.x!) + Math.abs(afterMovePos.y - coordinates.y!);
            if (cursorDrift > 2) {
                this.log.warn(`click(${elementId}) cursor drift: wanted (${coordinates.x},${coordinates.y}), got (${afterMovePos.x},${afterMovePos.y})`);
            } else {
                this.log.debug(`click(${elementId}) cursor confirmed at (${afterMovePos.x},${afterMovePos.y})`);
            }
        }
    }

    mouseDown();
    mouseUp();

    // Post-click settle — FlaUI's Wait.UntilInputIsProcessed
    // (FlaUI.Core/Input/Wait.cs:19-25, Thread.Sleep(100)). Lets Windows
    // finish dispatching mouseDown/mouseUp before the next UIA call runs.
    const postClickSettleMs = isMenuItem ? 100 : 50;
    await sleep(this.caps.delayAfterClick ?? postClickSettleMs);
}

/**
 * Captures a screenshot of a single element.
 * @param elementId - The id of the element to capture.
 * @returns A base64-encoded PNG image of the element.
 */
export async function getElementScreenshot(this: AppiumDesktopDriver, elementId: string): Promise<string> {
    if (this.isIEContext()) {
        throw new errors.NotYetImplementedError();
    }
    const rootId = (await this.sendCommand('saveRootElementToTable', {}) as string)?.trim();
    if (!rootId) {
        throw new errors.NoSuchWindowError('No active window found for this session.');
    }
    return await this.sendCommand('getElementScreenshot', { elementId }) as string;
}

/**
 * Switches the active IE frame context. Only supported in IE context.
 * @param id - `null` to switch to the default (top-level) content, a numeric frame index,
 * or a WebDriver element reference identifying a frame element.
 * @returns Resolves once the frame switch has completed.
 */
export async function setFrame(
    this: AppiumDesktopDriver,
    id: null | number | Record<string, string>,
): Promise<void> {
    if (!this.isIEContext()) {
        throw new errors.NotImplementedError('setFrame is only supported in IE context');
    }
    if (id === null) {
        await this.ieSession!.switchToDefaultContent();
        return;
    }
    if (typeof id === 'number') {
        await this.ieSession!.switchToFrame(id);
        return;
    }
    const elementId = id[W3C_ELEMENT_KEY];
    if (!elementId) {
        throw new errors.InvalidArgumentError('Invalid frame reference: missing element key');
    }
    await this.ieSession!.switchToFrameByElement(elementId);
}

/**
 * Switches back to the default (top-level) content from within an IE frame. Only supported
 * in IE context.
 * @returns Resolves once the switch has completed.
 */
export async function switchToParentFrame(this: AppiumDesktopDriver): Promise<void> {
    if (!this.isIEContext()) {
        throw new errors.NotImplementedError('switchToParentFrame is only supported in IE context');
    }
    await this.ieSession!.switchToDefaultContent();
}
