using System.Text.Json;
using NovaUIAutomationServer.Protocol;
using NovaUIAutomationServer.State;
using NovaUIAutomationServer.Uia3;

namespace NovaUIAutomationServer.DotNet;

/// <summary>
/// Per-call snapshot of the bridge's reflected tree for the currently-attached
/// window: the window root plus every descendant, walked once. Built once per
/// GetPageSource/FindElement/FindElements call and reused across every
/// correlation attempt within that call — walking the whole bridge tree is a
/// server round trip per node (BridgeAgentService.GetChildren), and a naive
/// re-walk per blind UIA leaf turned out to be pathological on real DevExpress
/// grids (many blind leaves × a big tree = a 30s+ search).
/// </summary>
internal sealed class BridgeSpliceContext
{
    public BridgeAgentElement WindowRoot { get; }
    private readonly BridgeAgentService _bridge;
    private List<BridgeAgentElement>? _descendants;

    // Lazy and cached: walking the whole bridge tree is a server round trip
    // per node, and on a large real app (many controls) that's seconds of
    // cost. Most correlation attempts succeed via the cheap identity path
    // (bridge-side FindFirst) and never need this at all — only the rect
    // fallback does, so defer the walk until something actually asks for it,
    // and keep it around after that so a single Find call doesn't pay for it
    // twice.
    public IReadOnlyList<BridgeAgentElement> Descendants =>
        _descendants ??= DotNetBridgeSplice.EnumerateDescendants(_bridge, WindowRoot).ToList();

    private BridgeSpliceContext(BridgeAgentElement windowRoot, BridgeAgentService bridge)
    {
        WindowRoot = windowRoot;
        _bridge = bridge;
    }

    public static BridgeSpliceContext? Build(SessionState state)
    {
        if (!state.DotNetBridgeEnabled || state.DotNetBridge == null) return null;
        var windowElement = state.GetLiveRoot();
        if (windowElement == null || !state.IsDotnetBridgeWindowElement(windowElement)) return null;

        try
        {
            var root = state.DotNetBridge.GetWindowRoot(windowElement.CurrentNativeWindowHandle);
            return root == null ? null : new BridgeSpliceContext(root, state.DotNetBridge);
        }
        catch
        {
            return null;
        }
    }
}

/// <summary>
/// Correlates a UIA element that UIA itself reports as opaque (a control-view
/// element with zero UIA children) to its counterpart in the .NET bridge's
/// reflected control tree, so callers can splice the bridge's subtree in at
/// that exact point instead of swapping the whole window's tree for the
/// bridge's view (which uses a different tree shape — see BridgeUiaShaper).
/// </summary>
internal static class DotNetBridgeSplice
{
    /// <summary>
    /// Finds the bridge node matching a blind UIA element. Tries AutomationId
    /// or Name+ClassName first, then falls back to matching bounding
    /// rectangles. The identity fallback matters because the elements this
    /// feature exists to reach are exactly the ones with no stable identity —
    /// UIA synthesizes a placeholder Name for templated cells (e.g. "Item:
    /// RowItem, Column Display Index: 2") that never matches anything real in
    /// the bridge's tree, and anonymous layout wrappers (Border,
    /// ContentPresenter) have neither AutomationId nor Name at all. Bounding
    /// rect is always present on both sides, so it's the fallback that
    /// actually reaches those elements.
    /// </summary>
    public static BridgeAgentElement? Correlate(SessionState state, IUIAutomationElement uiaElement, BridgeSpliceContext ctx)
    {
        return CorrelateExact(state, uiaElement, ctx.WindowRoot)
            ?? CorrelateByRect(uiaElement, ctx.Descendants);
    }

    /// <summary>
    /// Identity-only correlation (AutomationId, or Name+ClassName) — no rect
    /// fallback. Used to upgrade an already-found, already-visible UIA
    /// element to its bridge counterpart (e.g. an owner-drawn combo box UIA
    /// can see fine but whose painted value it can't read); the fuzzier rect
    /// match isn't appropriate there since a wrong guess would silently
    /// swap in an unrelated element's value for something UIA already
    /// resolved correctly.
    /// </summary>
    public static BridgeAgentElement? CorrelateExact(SessionState state, IUIAutomationElement uiaElement, BridgeAgentElement bridgeWindowRoot)
    {
        var automationId = uiaElement.get_CurrentAutomationId() ?? "";
        var name = uiaElement.get_CurrentName() ?? "";
        var className = uiaElement.get_CurrentClassName() ?? "";

        ConditionDto? condition = BuildCorrelationCondition(automationId, name, className);
        if (condition == null) return null;

        try
        {
            var id = state.DotNetBridge!.FindFirst(bridgeWindowRoot, condition, "subtree");
            return id != null ? state.DotNetBridge.GetById(id) : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Scores candidates by top-left point distance only — not center point,
    /// not size. WPF's bridge-side rect comes from PointToScreen (correct,
    /// DPI-aware physical pixels) for the origin, but width/height come from
    /// ActualWidth/ActualHeight (device-independent units, NOT DPI-scaled) —
    /// under any display scaling other than 100%, a size- or center-based
    /// score drifts by exactly the scale factor and silently stops matching.
    /// The top-left corner has no such distortion, so it's the only
    /// dimension worth trusting across the whole element population.
    /// </summary>
    private static BridgeAgentElement? CorrelateByRect(IUIAutomationElement uiaElement, IReadOnlyList<BridgeAgentElement> candidates)
    {
        tagRECT rect;
        try { rect = uiaElement.CurrentBoundingRectangle; }
        catch { return null; }

        var targetX = rect.left;
        var targetY = rect.top;
        var targetW = rect.right - rect.left;
        var targetH = rect.bottom - rect.top;
        if (targetW <= 0 || targetH <= 0) return null;

        BridgeAgentElement? best = null;
        var bestDist = double.MaxValue;

        foreach (var candidate in candidates)
        {
            var info = candidate.Info;
            if (!TryGetDouble(info, "x", out var x) || !TryGetDouble(info, "y", out var y))
            {
                continue;
            }
            if (TryGetDouble(info, "width", out var w) && w <= 0) continue;
            if (TryGetDouble(info, "height", out var h) && h <= 0) continue;

            var dist = Math.Sqrt(Math.Pow(x - targetX, 2) + Math.Pow(y - targetY, 2));
            if (dist < bestDist)
            {
                bestDist = dist;
                best = candidate;
            }
        }

        // Fixed, generous cap rather than proportional to the target's own
        // size — guards against matching a coincidentally nearby unrelated
        // element when nothing in the bridge tree genuinely corresponds.
        const double maxAllowed = 60;
        return bestDist <= maxAllowed ? best : null;
    }

    internal static IEnumerable<BridgeAgentElement> EnumerateDescendants(BridgeAgentService bridge, BridgeAgentElement root, int maxDepth = 30)
    {
        var stack = new Stack<(BridgeAgentElement node, int depth)>();
        stack.Push((root, 0));
        while (stack.Count > 0)
        {
            var (node, depth) = stack.Pop();
            yield return node;
            if (depth >= maxDepth) continue;

            List<BridgeAgentElement> children;
            try { children = bridge.GetChildren(node); }
            catch { continue; }

            foreach (var child in children) stack.Push((child, depth + 1));
        }
    }

    private static bool TryGetDouble(Dictionary<string, object?> info, string key, out double value)
    {
        value = 0;
        foreach (var k in info.Keys)
        {
            if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
            {
                var s = info[k]?.ToString();
                return s != null && double.TryParse(s, out value);
            }
        }
        return false;
    }

    private static ConditionDto? BuildCorrelationCondition(string automationId, string name, string className)
    {
        if (!string.IsNullOrEmpty(automationId))
        {
            return PropertyCondition("AutomationId", automationId);
        }
        if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(className))
        {
            return new ConditionDto
            {
                Type = "and",
                Conditions = new[] { PropertyCondition("Name", name), PropertyCondition("ClassName", className) },
            };
        }
        if (!string.IsNullOrEmpty(name))
        {
            return PropertyCondition("Name", name);
        }
        return null;
    }

    private static ConditionDto PropertyCondition(string property, string value) => new()
    {
        Type = "property",
        Property = property,
        Value = JsonSerializer.SerializeToElement(value),
    };
}
