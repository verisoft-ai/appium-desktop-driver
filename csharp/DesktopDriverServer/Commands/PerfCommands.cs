using System.Text.Json;
using DesktopDriverServer.State;

namespace DesktopDriverServer.Commands;

/// <summary>
/// Read/reset the per-session <see cref="PerfCounters"/>. Reachable from the driver as
/// <c>windows: getPerfMetrics</c> / <c>windows: resetPerfMetrics</c>. Counters are only
/// populated when the session was created with the <c>perfMetrics</c> capability.
/// </summary>
public static class PerfCommands
{
    public static object? GetPerfMetrics(SessionState state, JsonElement? parameters)
    {
        var snapshot = state.Perf.Snapshot();
        return new
        {
            enabled = state.PerfMetricsEnabled,
            metrics = snapshot,
        };
    }

    public static object? ResetPerfMetrics(SessionState state, JsonElement? parameters)
    {
        state.Perf.Reset();
        return null;
    }
}
