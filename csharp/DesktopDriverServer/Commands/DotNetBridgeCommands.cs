using System.Diagnostics;
using System.Text;
using System.Text.Json;
using DesktopDriverServer.DotNet;
using DesktopDriverServer.State;

namespace DesktopDriverServer.Commands;

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

        string x64Dll = Path.Combine(AppContext.BaseDirectory, "appium-dotnet-bridge.dll");
        if (!File.Exists(x64Dll))
            throw new FileNotFoundException($"Bridge DLL not found at: {x64Dll}");

        // native/win-x86/ is a sibling of this host's own directory (native/win-x64/) — see
        // BridgeInjector.InjectFromPidAutoBitness for why a 32-bit target needs its own DLL build
        // and a bitness-matched injector stub rather than this 64-bit host injecting directly.
        string x86Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "win-x86"));
        string x86Dll = Path.Combine(x86Root, "appium-dotnet-bridge.dll");
        string x86Stub = Path.Combine(x86Root, "BridgeInjectorX86Stub.exe");

        BridgeInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0)
            throw new InvalidOperationException($"Could not resolve PID from window handle 0x{hwnd:X}.");

        try
        {
            BridgeInjector.InjectFromPidAutoBitness((int)pid, x64Dll, x86Dll, x86Stub);
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd,
                "Injection failed at the Win32 API level (LoadLibrary/CreateRemoteThread). " +
                "Common causes: antivirus/EDR blocking cross-process code injection, or insufficient privileges — try running as Administrator."), ex);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd,
                "Access denied opening the target process. Try running as Administrator, " +
                "or check that antivirus/EDR is not blocking process access."), ex);
        }
        catch (IOException ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd,
                "I/O error reading or writing the bridge DLL or the x86 stub. " +
                "Verify the files are not locked by antivirus and were not corrupted during install."), ex);
        }
        catch (BadImageFormatException ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd,
                "Bridge DLL bitness does not match the target process (32-bit vs 64-bit)."), ex);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd), ex);
        }

        state.EnableDotnetBridge((int)pid);
        return null;
    }

    private static string BuildDiagnosticMessage(Exception ex, IntPtr hwnd, string? hint = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine(ex.Message);
        if (hint != null)
        {
            sb.AppendLine();
            sb.AppendLine(hint);
        }
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

                try
                {
                    bool is32Bit = BridgeInjector.DetectIs32Bit((int)pid);
                    sb.AppendLine($"  bitness:     {(is32Bit ? "32-bit (WOW64)" : "64-bit")}");
                }
                catch (Exception bitnessEx) { sb.AppendLine($"  bitness:     (could not determine: {bitnessEx.Message})"); }

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
