using System.Runtime.InteropServices;
using System.Text;

namespace NovaUIAutomationServer.Java;

/// <summary>
/// Detects Java AWT/Swing windows using WinAPI GetClassName.
/// Replaces JabService.IsJavaWindow — no JAB DLL dependency.
/// </summary>
internal static class JavaWindowDetector
{
    // Standard AWT window class names on Windows (Oracle/OpenJDK JREs)
    private static readonly HashSet<string> JavaWindowClassNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "SunAwtFrame",
        "SunAwtWindow",
        "SunAwtDialog",
        "SunAwtCanvas",
        "SunAwtPanel",
    };

    public static bool IsJavaWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return false;
        var sb = new StringBuilder(256);
        GetClassName(hwnd, sb, sb.Capacity);
        return JavaWindowClassNames.Contains(sb.ToString());
    }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
}
