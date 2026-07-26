import { W3C_ELEMENT_KEY } from '@appium/base-driver';
import { Element } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';

export type AccessibleNode = {
    name: string | null;
    role: string | null;
    value: string | null;
    description: string | null;
    state: string | null;
    defaultAction: string | null;
    rect: { x: number; y: number; width: number; height: number };
    childCount: number;
    truncated: boolean;
    children: AccessibleNode[];
};

export type AccessibleChildrenResult =
    | { supported: true; node: AccessibleNode }
    | { supported: false; reason: string };

/**
 * Fallback for legacy controls (Janus/ComponentOne-era ActiveX grids, custom-drawn
 * Win32 controls) that expose zero UIA children — confirmed with Inspect.exe, not
 * just this driver. Bypasses UIA and walks the control's raw IAccessible (MSAA)
 * tree instead, since these controls were usually built with a hand-written MSAA
 * implementation for screen-reader compliance that exposes rows/cells as "simple
 * children" — plain integer childIds with no HWND, so EnumChildWindows can't see
 * them either. If `supported` is false or the root node has zero children, the
 * control paints its own content with no accessibility tree left to recover — use
 * the vision fallback (`windows: findByVision`) instead.
 */
export async function executeGetNativeChildren(this: AppiumDesktopDriver, element: Element): Promise<AccessibleChildrenResult> {
    const elementId = element[W3C_ELEMENT_KEY];
    return await this.sendCommand('getAccessibleChildren', { elementId }) as AccessibleChildrenResult;
}
