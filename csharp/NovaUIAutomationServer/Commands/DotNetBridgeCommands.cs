using System.Diagnostics;
using System.Text;
using System.Text.Json;
using NovaUIAutomationServer.DotNet;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

public static class DotNetBridgeCommands
{
    public static object? EnableDotnetBridge(SessionState state, JsonElement? parameters)
    {
        int? pid = null;
        if (parameters?.TryGetProperty("pid", out var pidEl) == true)
            pid = pidEl.GetInt32();
        state.EnableDotnetBridge(pid);
        return null;
    }

    public static object? InjectDotnetBridge(SessionState state, JsonElement? parameters)
    {
        IntPtr hwnd;

        if (parameters?.TryGetProperty("hwnd", out var hwndEl) == true)
        {
            hwnd = (IntPtr)hwndEl.GetInt64();
        }
        else
        {
            var root = state.GetRootOrThrow();
            hwnd = root.CurrentNativeWindowHandle;
            if (hwnd == IntPtr.Zero)
                throw new InvalidOperationException(
                    "Current root element has no native window handle. " +
                    "Attach to a window first using the appTopLevelWindow capability.");
        }

        string bridgeDll = Path.Combine(AppContext.BaseDirectory, "appium-dotnet-bridge.dll");
        if (!File.Exists(bridgeDll))
            throw new FileNotFoundException($"Bridge DLL not found at: {bridgeDll}");

        try
        {
            BridgeInjector.InjectFromHwnd(hwnd, bridgeDll);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd), ex);
        }

        BridgeInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        state.EnableDotnetBridge((int)pid);
        return null;
    }

    private static string BuildDiagnosticMessage(Exception ex, IntPtr hwnd)
    {
        var sb = new StringBuilder();
        sb.AppendLine(ex.Message);
        sb.AppendLine();
        sb.AppendLine("=== attachDotnetBridge diagnostics ===");

        BridgeInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        sb.AppendLine($"  hwnd:        0x{hwnd:X}");
        sb.AppendLine($"  pid:         {pid}");

        if (pid != 0)
        {
            try
            {
                using var process = Process.GetProcessById((int)pid);
                sb.AppendLine($"  process:     {process.ProcessName}.exe");
                sb.AppendLine($"  exe:         {process.MainModule?.FileName ?? "(unavailable)"}");

                var framework = BridgeInjector.DetectClrFramework((int)pid);
                sb.AppendLine($"  clr:         {framework}");

                string? clrModulePath = null;
                try
                {
                    foreach (ProcessModule m in process.Modules)
                    {
                        if (m.ModuleName.Equals("clr.dll", StringComparison.OrdinalIgnoreCase) ||
                            m.ModuleName.Equals("coreclr.dll", StringComparison.OrdinalIgnoreCase))
                        {
                            clrModulePath = m.FileName;
                            break;
                        }
                    }
                }
                catch { clrModulePath = "(module enumeration denied — try running as Administrator)"; }

                sb.AppendLine($"  clr module:  {clrModulePath ?? "(not loaded — is this a .NET process?)"}");
            }
            catch (Exception procEx)
            {
                sb.AppendLine($"  process:     (could not open: {procEx.Message})");
            }
        }

        sb.AppendLine("===================================");
        return sb.ToString();
    }
}
