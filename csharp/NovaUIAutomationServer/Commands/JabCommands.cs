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
            // Fall back to current session root element's window handle
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

        AgentInjector.InjectFromHwnd(hwnd, agentJar);

        AgentInjector.GetWindowThreadProcessId(hwnd, out uint pid);
        state.EnableJavaSwing((int)pid);
        return null;
    }
}
