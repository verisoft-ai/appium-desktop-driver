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

        var hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf<tagRECT>());
        if (hr == 0) return true;

        if (GetWindowRect(hwnd, out rect)) return true;

        // Both native lookups failed — almost always means hwnd is stale/destroyed
        // (window closed between attach and this call). Callers fall back to the
        // UIA CurrentBoundingRectangle COM path, which can itself throw
        // UIA_E_ELEMENTNOTAVAILABLE for the same underlying reason.
        var win32Err = Marshal.GetLastWin32Error();
        Console.Error.WriteLine($"[NativeWindowRect] both DwmGetWindowAttribute (hr=0x{hr:X8}) and GetWindowRect (GetLastError={win32Err}) failed for hwnd=0x{hwnd.ToInt64():X}. Window handle is likely stale/destroyed.");
        return false;
    }
}
