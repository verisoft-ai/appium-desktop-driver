import { AppiumDesktopDriver } from '../driver';
import { getChildWindows } from '../winapi/user32';

/**
 * Fallback for legacy WinForms controls that expose zero UIA children (confirmed
 * with Inspect.exe, not just this driver). Bypasses UIA entirely and walks the
 * real Win32 child-window tree via EnumChildWindows. If this also returns an
 * empty array, the control paints its own content with no child windows either,
 * and there is no structural data left to recover — use the vision fallback
 * (`windows: findByVision`) instead.
 */
export async function executeGetNativeChildren(this: AppiumDesktopDriver, args: { elementId: string }): Promise<Array<{ handle: string; className: string; title: string; rect: { x: number; y: number; width: number; height: number } }>> {
    const { elementId } = args;
    const nativeWindowHandle = await this.sendCommand('getProperty', { elementId, property: 'NativeWindowHandle' }) as string;
    return getChildWindows(Number(nativeWindowHandle));
}
