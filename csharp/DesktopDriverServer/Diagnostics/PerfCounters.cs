using System.Collections.Concurrent;

namespace DesktopDriverServer.Diagnostics;

/// <summary>
/// Lightweight per-session performance counters, opt-in via the <c>perfMetrics</c>
/// capability. Records a call count and summed elapsed milliseconds per string label
/// (e.g. <c>java.getChildren</c>), so a benchmark can attribute where a slow
/// high-level operation — page source, a full-tree XPath scan — actually spends its
/// time.
///
/// <para>When perf metrics are disabled the counters are simply never written to;
/// callers guard on <see cref="SessionState.PerfMetricsEnabled"/> before touching a
/// stopwatch so the hot path stays free.</para>
/// </summary>
public sealed class PerfCounters
{
    public sealed record Counter(long Count, double TotalMs);

    private readonly ConcurrentDictionary<string, (long count, double totalMs)> _counters = new();
    private readonly object _lock = new();

    public void Record(string label, double elapsedMs)
    {
        _counters.AddOrUpdate(
            label,
            _ => (1, elapsedMs),
            (_, cur) => (cur.count + 1, cur.totalMs + elapsedMs));
    }

    public void Reset() => _counters.Clear();

    /// <summary>
    /// Snapshot of every counter plus rolled-up totals, shaped for JSON:
    /// <c>{ totalCalls, totalMs, byLabel: { "java.getChildren": { count, totalMs }, ... } }</c>.
    /// </summary>
    public object Snapshot()
    {
        lock (_lock)
        {
            var byLabel = new Dictionary<string, object>();
            long totalCalls = 0;
            double totalMs = 0;
            foreach (var kv in _counters)
            {
                byLabel[kv.Key] = new { count = kv.Value.count, totalMs = Math.Round(kv.Value.totalMs, 3) };
                totalCalls += kv.Value.count;
                totalMs += kv.Value.totalMs;
            }
            return new
            {
                totalCalls,
                totalMs = Math.Round(totalMs, 3),
                byLabel,
            };
        }
    }
}
