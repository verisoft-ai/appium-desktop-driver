using System.Runtime.InteropServices;

namespace NovaUIAutomationServer.Uia3;

// Win32-only window rect lookup, shared by any command that needs "the
// window's bounds" without going through a live UIA/COM round-trip to the
// target app's provider (which can stall or throw UIA_E_ELEMENTNOTAVAILABLE
// if that app's UI thread is busy).
public static class NativeWindowRect
{
    // DWMWA_EXTENDED_FRAME_BOUNDS gives the true visible window edge. Plain
    // GetWindowRect includes the invisible resize border DWM adds on themed
    // windows, which reports a rect a few px larger than what's actually
    // visible on screen.
    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out tagRECT pvAttribute, int cbAttribute);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hWnd, out tagRECT lpRect);

    public static bool TryGet(IntPtr hwnd, out tagRECT rect)
    {
        if (hwnd == IntPtr.Zero)
        {
            rect = default;
            return false;
        }
        return DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf<tagRECT>()) == 0
            || GetWindowRect(hwnd, out rect);
    }
}
