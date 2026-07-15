import { describe, it, expect } from 'vitest';
import { isExtendedKeyVk } from '../../lib/winapi/user32';
import { VirtualKey } from '../../lib/winapi/types/virtualkey';

describe('isExtendedKeyVk', () => {
    // Regression: SendInput must set KEYEVENTF_EXTENDEDKEY for these VKs, or
    // Windows can resolve them against the wrong physical key depending on
    // NumLock state (e.g. VK_DOWN colliding with the Numpad-2 key location).
    it.each([
        ['VK_UP', VirtualKey.VK_UP],
        ['VK_DOWN', VirtualKey.VK_DOWN],
        ['VK_LEFT', VirtualKey.VK_LEFT],
        ['VK_RIGHT', VirtualKey.VK_RIGHT],
        ['VK_HOME', VirtualKey.VK_HOME],
        ['VK_END', VirtualKey.VK_END],
        ['VK_PRIOR (Page Up)', VirtualKey.VK_PRIOR],
        ['VK_NEXT (Page Down)', VirtualKey.VK_NEXT],
        ['VK_INSERT', VirtualKey.VK_INSERT],
        ['VK_DELETE', VirtualKey.VK_DELETE],
        ['VK_DIVIDE', VirtualKey.VK_DIVIDE],
        ['VK_NUMLOCK', VirtualKey.VK_NUMLOCK],
        ['VK_SNAPSHOT', VirtualKey.VK_SNAPSHOT],
        ['VK_RCONTROL', VirtualKey.VK_RCONTROL],
        ['VK_RMENU', VirtualKey.VK_RMENU],
        ['VK_LWIN', VirtualKey.VK_LWIN],
        ['VK_RWIN', VirtualKey.VK_RWIN],
        ['VK_APPS', VirtualKey.VK_APPS],
    ])('returns true for %s', (_name, vk) => {
        expect(isExtendedKeyVk(vk)).toBe(true);
    });

    it.each([
        ['VK_KEY_A', VirtualKey.VK_KEY_A],
        ['VK_KEY_0', VirtualKey.VK_KEY_0],
        ['VK_RETURN', VirtualKey.VK_RETURN],
        ['VK_SPACE', VirtualKey.VK_SPACE],
        ['VK_NUMPAD2 (shares a scan code with VK_DOWN, but is not itself extended)', VirtualKey.VK_NUMPAD2],
        ['VK_SHIFT', VirtualKey.VK_SHIFT],
        ['VK_CONTROL (left)', VirtualKey.VK_CONTROL],
        ['VK_MENU (left Alt)', VirtualKey.VK_MENU],
    ])('returns false for %s', (_name, vk) => {
        expect(isExtendedKeyVk(vk)).toBe(false);
    });

    it('returns false for undefined (scan-code-based events have no vk)', () => {
        expect(isExtendedKeyVk(undefined)).toBe(false);
    });
});
