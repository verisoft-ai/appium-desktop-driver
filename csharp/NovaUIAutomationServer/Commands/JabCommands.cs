using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using NovaUIAutomationServer.Java;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

public static class JabCommands
{
    public static object? EnableJavaSwing(SessionState state, JsonElement? parameters)
    {
        int? pid = null;
        if (parameters?.TryGetProperty("pid", out var pidEl) == true)
            pid = pidEl.GetInt32();
        state.EnableJavaSwing(pid);
        return null;
    }

    public static object? InjectJavaAgent(SessionState state, JsonElement? parameters)
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
                    "Attach to a Java window first using appTopLevelWindow capability.");
        }

        string agentJar = Path.Combine(AppContext.BaseDirectory, "appium-desktop-agent.jar");
        if (!File.Exists(agentJar))
            throw new FileNotFoundException($"Agent JAR not found at: {agentJar}");

        try
        {
            AgentInjector.InjectFromHwnd(hwnd, agentJar);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(BuildDiagnosticMessage(ex, hwnd), ex);
        }

        AgentInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        state.EnableJavaSwing((int)pid);
        return null;
    }

    private static string BuildDiagnosticMessage(Exception ex, IntPtr hwnd)
    {
        var sb = new StringBuilder();
        sb.AppendLine(ex.Message);
        sb.AppendLine();
        sb.AppendLine("=== attachJavaSwing diagnostics ===");

        // Window / process info
        AgentInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        sb.AppendLine($"  hwnd:        0x{hwnd:X}");
        sb.AppendLine($"  pid:         {pid}");

        if (pid != 0)
        {
            try
            {
                using var process = Process.GetProcessById((int)pid);
                sb.AppendLine($"  process:     {process.ProcessName}.exe");
                sb.AppendLine($"  exe:         {process.MainModule?.FileName ?? "(unavailable)"}");

                bool hasJvm = false;
                var jvmPath = "(not found)";
                try
                {
                    foreach (ProcessModule m in process.Modules)
                    {
                        if (m.ModuleName.Contains("jvm", StringComparison.OrdinalIgnoreCase))
                        {
                            hasJvm = true;
                            jvmPath = m.FileName;
                            break;
                        }
                    }
                }
                catch { jvmPath = "(module enumeration denied)"; }

                sb.AppendLine($"  jvm.dll:     {(hasJvm ? jvmPath : "(not loaded — is this a Java process?)")}");
            }
            catch (Exception procEx)
            {
                sb.AppendLine($"  process:     (could not open: {procEx.Message})");
            }
        }

        // Java environment
        sb.AppendLine();
        sb.AppendLine("  JAVA_HOME:          " + (Environment.GetEnvironmentVariable("JAVA_HOME") ?? "(not set)"));
        sb.AppendLine("  JAVA_TOOL_OPTIONS:  " + (Environment.GetEnvironmentVariable("JAVA_TOOL_OPTIONS") ?? "(not set)"));
        sb.AppendLine("  _JAVA_OPTIONS:      " + (Environment.GetEnvironmentVariable("_JAVA_OPTIONS") ?? "(not set)"));
        sb.AppendLine("  JDK_JAVA_OPTIONS:   " + (Environment.GetEnvironmentVariable("JDK_JAVA_OPTIONS") ?? "(not set)"));

        sb.AppendLine("===================================");
        return sb.ToString();
    }
}
