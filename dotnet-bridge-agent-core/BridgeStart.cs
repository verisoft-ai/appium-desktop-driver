using System.IO;
using System.Threading;

namespace AppiumDotNetBridgeCore;

/// <summary>
/// Managed entry point the profiler-attach bootstrap IL calls after
/// Assembly.LoadFrom'ing this DLL (see dotnet-bridge-profiler/ProfilerCallback.cpp's
/// GetReJITParameters and dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md).
/// </summary>
public static class EntryPoint
{
    private static int _started;

    /// <summary>
    /// Must return quickly and must not run <see cref="BridgeServer.Run"/> synchronously. Two
    /// reasons, both load-bearing:
    ///
    /// 1. This method is called *inline* from the anchor method's own rewritten IL (e.g.
    ///    <c>Control.WndProc</c>), which executes on the target's UI/message-pump thread. If
    ///    <see cref="BridgeServer.Run"/> (an infinite TCP accept loop) ran synchronously here,
    ///    that thread would never return to the message pump — freezing the entire target
    ///    application. Mutating bridge commands (invoke/select/setValue/...) that marshal onto
    ///    that exact thread via <c>Control.Invoke</c> would then hang forever too, since the
    ///    thread they're marshaling onto would never be pumping messages again. Spawning a
    ///    background thread here and returning immediately keeps the UI thread free.
    /// 2. `RequestReJIT` is permanent for the process' lifetime, not one-shot — once applied, the
    ///    rewritten anchor method calls <see cref="BridgeStart"/> on *every* future invocation
    ///    (e.g. every window message), not just the first. Without the <see cref="_started"/>
    ///    guard, each call would spawn another listener and clobber the port file with a new
    ///    port, degrading over time instead of failing loudly.
    /// </summary>
    public static void BridgeStart()
    {
        if (Interlocked.Exchange(ref _started, 1) != 0) return;

        var thread = new Thread(RunServerCatchingErrors) { IsBackground = true };
        thread.Start();
    }

    private static void RunServerCatchingErrors()
    {
        try
        {
            BridgeServer.Run();
        }
        catch (Exception ex)
        {
            // Same error-surfacing convention as the native agent's BridgeStart export: the
            // bootstrap has no return channel for the exception itself, so persist it next to
            // where the port file would have gone.
            try
            {
                int pid = Environment.ProcessId;
                string errorFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.error");
                File.WriteAllText(errorFile, ex.ToString());
            }
            catch (Exception) { /* best-effort — nothing more we can do here */ }
        }
    }
}
