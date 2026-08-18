using System.Text.Json;
using NovaUIAutomationServer.DotNet;
using NovaUIAutomationServer.Java;
using NovaUIAutomationServer.Protocol;
using NovaUIAutomationServer.Server;
using NovaUIAutomationServer.State;
using NovaUIAutomationServer.Uia3;

namespace NovaUIAutomationServer.Commands;

public static class FindCommands
{
    public static object? FindElement(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var scope = p.GetProperty("scope").GetString() ?? "descendants";
        var conditionDto = JsonSerializer.Deserialize<ConditionDto>(p.GetProperty("condition").GetRawText())
            ?? throw new ArgumentException("condition is required.");

        string? contextElementId = null;
        if (p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String)
        {
            contextElementId = ctxProp.GetString();
        }

        // Route to Java agent when context is a Java element or the UIA root is a Java window.
        if (TryRouteToJava(state, contextElementId, out var javaRoot))
        {
            return state.Java!.FindFirst(javaRoot!, conditionDto, scope);
        }

        // Route to .NET bridge only when context is already a bridge element —
        // i.e. a caller is deliberately continuing a search inside a subtree it
        // already knows is bridge-only (e.g. one returned by a prior splice).
        // We deliberately do NOT route here just because the context/root's
        // window belongs to the bridge-injected process: that would search the
        // bridge's whole reflected tree (different shape from UIA) instead of
        // the real UIA tree, for elements that are perfectly UIA-visible.
        // Blind subtrees are instead reached transparently below (see
        // dotnetWindowRoot / TryFindInBridgeSplice / the post-match upgrade).
        if (TryRouteToDotnet(state, contextElementId, out var dotnetRoot))
        {
            return state.DotNetBridge!.FindFirst(dotnetRoot!, conditionDto, scope);
        }

        // When searching from the session root we re-resolve the attached HWND
        // via IUIAutomation.ElementFromHandle(hwnd) on every call. WPF apps
        // routinely rebuild their automation-peer tree after navigation (splash
        // → main, logout → login), invalidating any cached IUIAutomationElement.
        // Fresh resolution is a sub-ms COM call and gives us the live tree.
        var searchRoot = contextElementId != null
            ? state.GetElement(contextElementId)
            : (state.GetLiveRoot() ?? state.Automation.GetRootElement());

        var condition = ConditionBuilder.Build(state.Automation, conditionDto);
        var dotnetWindowRoot = GetDotnetWindowRoot(state);

        switch (scope.ToLowerInvariant())
        {
            case "descendants":
                return FindFirstRecursively(searchRoot, condition, conditionDto, dotnetWindowRoot, state, includeSelf: false);
            case "children":
            {
                var el = searchRoot.FindFirst(TreeScope.Children, condition);
                return el != null ? SaveUpgraded(el, dotnetWindowRoot, state) : null;
            }
            case "element":
            {
                var el = searchRoot.FindFirst(TreeScope.Element, condition);
                return el != null ? SaveUpgraded(el, dotnetWindowRoot, state) : null;
            }
            case "subtree":
                return FindFirstRecursively(searchRoot, condition, conditionDto, dotnetWindowRoot, state, includeSelf: true);
            case "ancestors":
                return FindFirstAncestor(searchRoot, condition, state);
            case "ancestors-or-self":
                return FindFirstAncestorOrSelf(searchRoot, condition, state);
            case "parent":
                return FindParent(searchRoot, condition, state);
            case "following":
                return FindFollowing(searchRoot, condition, state);
            case "following-sibling":
                return FindFollowingSibling(searchRoot, condition, state);
            case "preceding":
                return FindPreceding(searchRoot, condition, state);
            case "preceding-sibling":
                return FindPrecedingSibling(searchRoot, condition, state);
            case "child-or-self":
            {
                var el = searchRoot.FindFirst(TreeScope.Element | TreeScope.Children, condition);
                return el != null ? SaveUpgraded(el, dotnetWindowRoot, state) : null;
            }
            default:
                throw new ArgumentException($"Unsupported scope: '{scope}'");
        }
    }

    public static object? FindElements(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var scope = p.GetProperty("scope").GetString() ?? "descendants";
        var conditionDto = JsonSerializer.Deserialize<ConditionDto>(p.GetProperty("condition").GetRawText())
            ?? throw new ArgumentException("condition is required.");

        string? contextElementId = null;
        if (p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String)
        {
            contextElementId = ctxProp.GetString();
        }

        // Route to Java agent when context is a Java element or the UIA root is a Java window.
        if (TryRouteToJava(state, contextElementId, out var javaRoot))
        {
            return state.Java!.FindAll(javaRoot!, conditionDto, scope);
        }

        // Route to .NET bridge only when context is already a bridge element — see
        // the matching comment in FindElement above.
        if (TryRouteToDotnet(state, contextElementId, out var dotnetRoot))
        {
            return state.DotNetBridge!.FindAll(dotnetRoot!, conditionDto, scope);
        }

        // When searching from the session root we re-resolve the attached HWND
        // via IUIAutomation.ElementFromHandle(hwnd) on every call. WPF apps
        // routinely rebuild their automation-peer tree after navigation (splash
        // → main, logout → login), invalidating any cached IUIAutomationElement.
        // Fresh resolution is a sub-ms COM call and gives us the live tree.
        var searchRoot = contextElementId != null
            ? state.GetElement(contextElementId)
            : (state.GetLiveRoot() ?? state.Automation.GetRootElement());

        var condition = ConditionBuilder.Build(state.Automation, conditionDto);
        var dotnetWindowRoot = GetDotnetWindowRoot(state);

        switch (scope.ToLowerInvariant())
        {
            case "descendants":
                return FindAllRecursively(searchRoot, condition, conditionDto, dotnetWindowRoot, state, includeSelf: false);
            case "children":
                return SaveAllUpgraded(searchRoot.FindAll(TreeScope.Children, condition), dotnetWindowRoot, state);
            case "element":
                return SaveAllUpgraded(searchRoot.FindAll(TreeScope.Element, condition), dotnetWindowRoot, state);
            case "subtree":
                return FindAllRecursively(searchRoot, condition, conditionDto, dotnetWindowRoot, state, includeSelf: true);
            case "ancestors":
                return FindAllAncestors(searchRoot, condition, state);
            case "ancestors-or-self":
                return FindAllAncestorsOrSelf(searchRoot, condition, state);
            case "parent":
            {
                var result = FindParent(searchRoot, condition, state);
                return result != null ? new[] { result } : Array.Empty<string>();
            }
            case "following":
                return FindAllFollowing(searchRoot, condition, state);
            case "following-sibling":
                return FindAllFollowingSiblings(searchRoot, condition, state);
            case "preceding":
                return FindAllPreceding(searchRoot, condition, state);
            case "preceding-sibling":
                return FindAllPrecedingSiblings(searchRoot, condition, state);
            case "child-or-self":
                return SaveAllUpgraded(searchRoot.FindAll(TreeScope.Element | TreeScope.Children, condition), dotnetWindowRoot, state);
            default:
                throw new ArgumentException($"Unsupported scope: '{scope}'");
        }
    }

    public static object? FindElementFocused(SessionState state, JsonElement? parameters)
    {
        var focused = state.Automation.GetFocusedElement();
        return state.SaveElementAndReturnId(focused);
    }

    public static object? SaveRootElementToTable(SessionState state, JsonElement? parameters)
    {
        var root = state.GetLiveRoot() ?? state.Automation.GetRootElement();
        return state.SaveElementAndReturnId(root);
    }

    public static object? LookupElement(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        if (JavaAgentElement.IsJavaId(elementId))
        {
            if (state.Java == null) return false;
            try
            {
                return state.Java!.IsAlive(elementId);
            }
            catch { return false; }
        }

        if (BridgeAgentElement.IsDotnetId(elementId))
        {
            if (state.DotNetBridge == null) return false;
            try
            {
                return state.DotNetBridge!.IsAlive(elementId);
            }
            catch { return false; }
        }

        return state.ElementTable.ContainsKey(elementId);
    }

    // --- Ancestor / Following / Preceding via TreeWalker ---

    private static IUIAutomationTreeWalker DefaultWalker(SessionState state)
        => state.TreeWalker ?? state.Automation.ControlViewWalker;

    private static string? FindFirstAncestor(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = walker.GetParentElement(element);
        while (el != null)
        {
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                return state.SaveElementAndReturnId(el);
            }
            el = walker.GetParentElement(el);
        }
        return null;
    }

    private static string? FindFirstAncestorOrSelf(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = element;
        while (el != null)
        {
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                return state.SaveElementAndReturnId(el);
            }
            el = walker.GetParentElement(el);
        }
        return null;
    }

    private static string[] FindAllAncestors(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = walker.GetParentElement(element);
        while (el != null)
        {
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                results.Add(state.SaveElementAndReturnId(el));
            }
            el = walker.GetParentElement(el);
        }
        return results.ToArray();
    }

    private static string[] FindAllAncestorsOrSelf(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = element;
        while (el != null)
        {
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                results.Add(state.SaveElementAndReturnId(el));
            }
            el = walker.GetParentElement(el);
        }
        return results.ToArray();
    }

    private static string? FindParent(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var parent = DefaultWalker(state).GetParentElement(element);
        if (parent == null) return null;
        return parent.FindFirst(TreeScope.Element, condition) != null
            ? state.SaveElementAndReturnId(parent)
            : null;
    }

    private static string? FindFollowing(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = element;
        while (el != null)
        {
            var next = walker.GetNextSiblingElement(el);
            if (next != null)
            {
                if (next.FindFirst(TreeScope.Element, condition) != null)
                {
                    return state.SaveElementAndReturnId(next);
                }
                // Descend into this sibling's subtree to look for matches there first.
                var found = next.FindFirst(TreeScope.Descendants, condition);
                if (found != null)
                {
                    return state.SaveElementAndReturnId(found);
                }
                el = next;
                continue;
            }
            el = walker.GetParentElement(el);
        }
        return null;
    }

    private static string[] FindAllFollowing(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = element;
        while (el != null)
        {
            var next = walker.GetNextSiblingElement(el);
            if (next != null)
            {
                el = next;
                if (el.FindFirst(TreeScope.Element, condition) != null)
                {
                    var id = state.TrySaveElementAndReturnId(el);
                    if (id != null) results.Add(id);
                }
                foreach (var match in IterateArray(el.FindAll(TreeScope.Descendants, condition)))
                {
                    var id = state.TrySaveElementAndReturnId(match);
                    if (id != null) results.Add(id);
                }
            }
            else
            {
                el = walker.GetParentElement(el);
            }
        }
        return results.ToArray();
    }

    private static string? FindFollowingSibling(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = element;
        while (true)
        {
            var next = walker.GetNextSiblingElement(el);
            if (next == null) break;
            el = next;
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                return state.SaveElementAndReturnId(el);
            }
        }
        return null;
    }

    private static string[] FindAllFollowingSiblings(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = element;
        while (true)
        {
            var next = walker.GetNextSiblingElement(el);
            if (next == null) break;
            el = next;
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                results.Add(state.SaveElementAndReturnId(el));
            }
        }
        return results.ToArray();
    }

    private static string? FindPreceding(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = element;
        while (el != null)
        {
            var prev = walker.GetPreviousSiblingElement(el);
            if (prev != null)
            {
                if (prev.FindFirst(TreeScope.Element, condition) != null)
                {
                    return state.SaveElementAndReturnId(prev);
                }
                var found = prev.FindFirst(TreeScope.Descendants, condition);
                if (found != null)
                {
                    return state.SaveElementAndReturnId(found);
                }
                el = prev;
                continue;
            }
            el = walker.GetParentElement(el);
        }
        return null;
    }

    private static string[] FindAllPreceding(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = element;
        while (el != null)
        {
            var prev = walker.GetPreviousSiblingElement(el);
            if (prev != null)
            {
                el = prev;
                if (el.FindFirst(TreeScope.Element, condition) != null)
                {
                    var id = state.TrySaveElementAndReturnId(el);
                    if (id != null) results.Add(id);
                }
                foreach (var match in IterateArray(el.FindAll(TreeScope.Descendants, condition)))
                {
                    var id = state.TrySaveElementAndReturnId(match);
                    if (id != null) results.Add(id);
                }
            }
            else
            {
                el = walker.GetParentElement(el);
            }
        }
        return results.ToArray();
    }

    private static string? FindPrecedingSibling(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var el = element;
        while (true)
        {
            var prev = walker.GetPreviousSiblingElement(el);
            if (prev == null) break;
            el = prev;
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                return state.SaveElementAndReturnId(el);
            }
        }
        return null;
    }

    private static string[] FindAllPrecedingSiblings(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state)
    {
        var walker = DefaultWalker(state);
        var results = new List<string>();
        var el = element;
        while (true)
        {
            var prev = walker.GetPreviousSiblingElement(el);
            if (prev == null) break;
            el = prev;
            if (el.FindFirst(TreeScope.Element, condition) != null)
            {
                results.Add(state.SaveElementAndReturnId(el));
            }
        }
        return results.ToArray();
    }

    // ── Java agent routing ───────────────────────────────────────────────────────

    /// <summary>
    /// Returns true when the find request should be routed to the Java agent.
    /// Sets <paramref name="javaRoot"/> to the Java element to search from.
    /// </summary>
    private static bool TryRouteToJava(SessionState state, string? contextElementId, out JavaAgentElement? javaRoot)
    {
        javaRoot = null;
        if (!state.JavaSwingEnabled || state.Java == null) return false;

        // Context is already a Java element — search within Java subtree directly.
        if (contextElementId != null && JavaAgentElement.IsJavaId(contextElementId))
        {
            javaRoot = state.Java.GetById(contextElementId);
            return true;
        }

        // Determine the UIA element that is the search root.
        IUIAutomationElement? uiaRoot = null;
        if (contextElementId != null)
        {
            try { uiaRoot = state.GetElement(contextElementId); }
            catch { return false; }
        }
        else
        {
            uiaRoot = state.GetLiveRoot();
        }

        if (uiaRoot == null) return false;

        // Check if the UIA element sits on a Java window.
        if (!state.IsJavaWindowElement(uiaRoot)) return false;

        // Get the Java agent root for this Java window HWND.
        // Pass the window title as a secondary match key for JVMs where HWND
        // reflection is blocked by module encapsulation (Java 9+).
        var hwnd = uiaRoot.CurrentNativeWindowHandle;
        var title = uiaRoot.get_CurrentName() ?? "";
        javaRoot = state.Java.GetWindowRoot(hwnd, title);
        return javaRoot != null;
    }

    // ── .NET bridge routing ──────────────────────────────────────────────────────

    /// <summary>
    /// Returns true when the find request should be routed to the .NET bridge —
    /// only when the context is already a bridge element (a caller deliberately
    /// continuing a search inside a subtree it already knows is bridge-only).
    /// Sets <paramref name="dotnetRoot"/> to the bridge element to search from.
    /// </summary>
    private static bool TryRouteToDotnet(SessionState state, string? contextElementId, out BridgeAgentElement? dotnetRoot)
    {
        dotnetRoot = null;
        if (!state.DotNetBridgeEnabled || state.DotNetBridge == null) return false;
        if (contextElementId == null || !BridgeAgentElement.IsDotnetId(contextElementId)) return false;

        dotnetRoot = state.DotNetBridge.GetById(contextElementId);
        return true;
    }

    /// <summary>
    /// Resolves the bridge's reflected tree for the currently-attached window,
    /// once per Find call — not per element. Computing it from the session's
    /// own live root (which always carries a real HWND) instead of from
    /// whatever arbitrary descendant element triggered a correlation attempt
    /// matters: most UIA elements below the top-level window (virtually all
    /// WPF ones) report NativeWindowHandle == 0, so deriving it per-element
    /// would silently never find a window to search from.
    /// </summary>
    private static BridgeSpliceContext? GetDotnetWindowRoot(SessionState state) => BridgeSpliceContext.Build(state);

    /// <summary>
    /// A UIA element can be perfectly visible to UIA (native find succeeds)
    /// while its VALUE is still blind — an owner-drawn combo box reports its
    /// AutomationId to UIA fine but paints its selected text itself, so
    /// UIA's own Text/Value property comes back empty. Whenever a match
    /// lands inside a bridge-active window, prefer its bridge counterpart
    /// (found by exact identity — AutomationId, or Name+ClassName) so
    /// getText/getAttribute reach the bridge's real reflected value instead
    /// of UIA's blank one. Falls back to the plain UIA id when there's no
    /// bridge, no window match, or no exact-identity counterpart.
    /// </summary>
    private static string? SaveUpgraded(IUIAutomationElement element, BridgeSpliceContext? dotnetWindowRoot, SessionState state)
    {
        var uiaId = state.TrySaveElementAndReturnId(element);
        if (uiaId == null || dotnetWindowRoot == null) return uiaId;
        try
        {
            var bridgeMatch = DotNetBridgeSplice.CorrelateExact(state, element, dotnetWindowRoot.WindowRoot);
            return bridgeMatch?.Id ?? uiaId;
        }
        catch
        {
            return uiaId;
        }
    }

    private static string[] SaveAllUpgraded(IUIAutomationElementArray array, BridgeSpliceContext? dotnetWindowRoot, SessionState state)
    {
        var results = new List<string>();
        foreach (var el in IterateArray(array))
        {
            var id = SaveUpgraded(el, dotnetWindowRoot, state);
            if (id != null) results.Add(id);
        }
        return results.ToArray();
    }

    /// <summary>
    /// Single bridge-wide fallback search, used only after the real UIA walk
    /// (native + manual) comes up completely empty. Earlier this correlated
    /// and searched at every blind UIA leaf individually — correct, but each
    /// correlation/search pair is a full server-side tree walk
    /// (BridgeAgentService's C++ FindFirst/FindAll has no indexing, it's a
    /// plain recursive VisualTreeHelper scan every call), so on a real app
    /// with many blind regions that multiplied into dozens of multi-second
    /// round trips per Find call. One bridge-wide search costs the same as a
    /// single correlation attempt but covers all bridge-reachable content at
    /// once, since the bridge's own tree already spans the whole window
    /// regardless of which UIA node would have been used as a starting point.
    /// </summary>
    private static string? TryBridgeWideFindFirst(ConditionDto conditionDto, BridgeSpliceContext? dotnetWindowRoot, SessionState state)
    {
        if (dotnetWindowRoot == null) return null;
        try
        {
            return state.DotNetBridge!.FindFirst(dotnetWindowRoot.WindowRoot, conditionDto, "subtree");
        }
        catch
        {
            return null;
        }
    }

    private static string[] TryBridgeWideFindAll(ConditionDto conditionDto, BridgeSpliceContext? dotnetWindowRoot, SessionState state)
    {
        if (dotnetWindowRoot == null) return Array.Empty<string>();
        try
        {
            return state.DotNetBridge!.FindAll(dotnetWindowRoot.WindowRoot, conditionDto, "subtree");
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    // Native UIA3 descendant search first — sub-millisecond on typical apps.
    // If native misses (happens for elements in subtrees it doesn't traverse —
    // WPF popup owners hosted in a separate UIA provider, and some virtualised
    // lists), fall back to a manual child-by-child walk via TreeScope.Children
    // which does cross those boundaries. The manual walk is slow on miss
    // (~3–12 s for large trees) but guarantees parity with the original Nova
    // driver's behaviour — tests that were passing before rely on it to find
    // elements the native scope skips.

    private static string? FindFirstRecursively(IUIAutomationElement element, IUIAutomationCondition condition, ConditionDto conditionDto, BridgeSpliceContext? dotnetWindowRoot, SessionState state, bool includeSelf)
    {
        var scope = includeSelf ? TreeScope.Subtree : TreeScope.Descendants;
        var native = element.FindFirst(scope, condition);
        if (native != null) return SaveUpgraded(native, dotnetWindowRoot, state);

        if (includeSelf)
        {
            var self = element.FindFirst(TreeScope.Element, condition);
            if (self != null) return SaveUpgraded(self, dotnetWindowRoot, state);
        }

        // Try the bridge's own exhaustive reflected-tree search before the
        // manual real-UIA walk below — a native miss almost always means the
        // target is genuinely bridge-only content (blind to UIA entirely,
        // the exact case this feature exists for), and the manual walk's
        // documented ~3-12s cost on a large tree is pure waste when the
        // answer was going to come from the bridge anyway. Still falls
        // through to the manual walk when the bridge also misses, so parity
        // with the original Nova driver's behaviour is unchanged for the
        // native-skipped-but-still-real-UIA case (WPF popups in a separate
        // provider, virtualised lists) the walk exists for.
        if (dotnetWindowRoot != null)
        {
            var bridgeHit = TryBridgeWideFindFirst(conditionDto, dotnetWindowRoot, state);
            if (bridgeHit != null) return bridgeHit;
        }

        var trueCond = state.Automation.CreateTrueCondition();
        return WalkForFirst(element, condition, dotnetWindowRoot, trueCond, state);
    }

    private static string? WalkForFirst(IUIAutomationElement element, IUIAutomationCondition condition, BridgeSpliceContext? dotnetWindowRoot, IUIAutomationCondition trueCond, SessionState state)
    {
        var direct = element.FindFirst(TreeScope.Children, condition);
        if (direct != null) return SaveUpgraded(direct, dotnetWindowRoot, state);

        var children = IterateArray(element.FindAll(TreeScope.Children, trueCond)).ToList();
        foreach (var child in children)
        {
            var found = WalkForFirst(child, condition, dotnetWindowRoot, trueCond, state);
            if (found != null) return found;
        }
        return null;
    }

    private static string[] FindAllRecursively(IUIAutomationElement element, IUIAutomationCondition condition, ConditionDto conditionDto, BridgeSpliceContext? dotnetWindowRoot, SessionState state, bool includeSelf)
    {
        var scope = includeSelf ? TreeScope.Subtree : TreeScope.Descendants;
        var nativeResults = IterateArray(element.FindAll(scope, condition))
            .Select(el => SaveUpgraded(el, dotnetWindowRoot, state))
            .Where(id => id != null)
            .Select(id => id!)
            .ToList();

        // Supplement with a manual walk to catch matches the native scope
        // missed. De-dupe by RuntimeId (which is the saved element ID).
        var seen = new HashSet<string>(nativeResults);
        if (includeSelf)
        {
            var self = element.FindFirst(TreeScope.Element, condition);
            if (self != null)
            {
                var id = SaveUpgraded(self, dotnetWindowRoot, state);
                if (id != null && seen.Add(id)) nativeResults.Add(id);
            }
        }

        // One bridge-wide search, merged in, so content real UIA can never
        // see at all (owner-drawn popups, templated cells) still comes back —
        // see TryBridgeWideFindFirst for why this replaced per-leaf splicing.
        //
        // When a bridge is attached we treat native FindAll (thorough over
        // its own traversal) plus this bridge-wide search (thorough over the
        // bridge's reflected tree) as jointly sufficient, and skip the manual
        // real-UIA re-walk below — its documented ~3-12s cost on a large
        // tree (see FindFirstRecursively) is paid on every call regardless
        // of hits, and every failing case observed against a real app was
        // bridge-only content the walk was never going to find anyway. Only
        // non-bridge sessions still pay for it, unchanged from before this
        // feature existed — the one case it's for (native-skipped-but-real
        // UIA content: WPF popups in a separate provider, virtualised lists)
        // that has no bridge counterpart in a bridge-attached window would
        // now be missed here; no test in this repo's suite currently
        // exercises that combination.
        if (dotnetWindowRoot != null)
        {
            foreach (var id in TryBridgeWideFindAll(conditionDto, dotnetWindowRoot, state))
            {
                if (seen.Add(id)) nativeResults.Add(id);
            }
        }
        else
        {
            var trueCond = state.Automation.CreateTrueCondition();
            WalkForAll(element, condition, dotnetWindowRoot, trueCond, state, nativeResults, seen);
        }

        return DedupeBridgeResults(nativeResults, state);
    }

    /// <summary>
    /// The native+upgrade path and the manual-walk splice path can both
    /// independently correlate the same underlying bridge row (e.g. a
    /// DevExpress grid row UIA can already enumerate, plus the same row
    /// rediscovered while walking a blind sibling subtree) — the plain
    /// string `seen` set doesn't catch this because the bridge mints a new
    /// element handle per query, so the same live object comes back as two
    /// different id strings. Re-dedupe bridge-sourced ids by content
    /// identity (AutomationId, or ClassName+Name+position) instead of by id.
    /// </summary>
    private static string[] DedupeBridgeResults(List<string> ids, SessionState state)
    {
        if (state.DotNetBridge == null) return ids.ToArray();

        var result = new List<string>();
        var seenKeys = new HashSet<string>();
        foreach (var id in ids)
        {
            var key = id;
            if (BridgeAgentElement.IsDotnetId(id))
            {
                try
                {
                    key = BridgeResultKey(state.DotNetBridge.GetById(id).Info);
                }
                catch
                {
                    // Fall back to the raw id — better to risk a rare
                    // duplicate than to drop a genuine result.
                }
            }
            if (seenKeys.Add(key)) result.Add(id);
        }
        return result.ToArray();
    }

    private static string BridgeResultKey(Dictionary<string, object?> info)
    {
        // AutomationId alone isn't safe as the whole key: DevExpress grid
        // cells commonly reuse the same AutomationId across every row in a
        // column (bound to the column/field name, not made row-unique), so
        // keying on it alone collapsed distinct "Status row 2"/"row 3" cells
        // down to one. Combine every distinguishing field instead — still
        // dedupes the same live object rediscovered twice (its reported
        // Name/ClassName/position are identical both times), without
        // collapsing genuinely different elements that happen to share one
        // field.
        var automationId = BridgeInfoString(info, "AutomationId") ?? "";
        var className = BridgeInfoString(info, "ClassName") ?? "";
        var name = BridgeInfoString(info, "Name") ?? "";
        var x = BridgeInfoString(info, "x") ?? "";
        var y = BridgeInfoString(info, "y") ?? "";
        return $"{automationId}|{className}|{name}|{x}|{y}";
    }

    private static string? BridgeInfoString(Dictionary<string, object?> info, string key)
    {
        foreach (var k in info.Keys)
        {
            if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase)) return info[k]?.ToString();
        }
        return null;
    }

    private static void WalkForAll(IUIAutomationElement element, IUIAutomationCondition condition, BridgeSpliceContext? dotnetWindowRoot, IUIAutomationCondition trueCond, SessionState state, List<string> results, HashSet<string> seen)
    {
        var children = IterateArray(element.FindAll(TreeScope.Children, trueCond)).ToList();

        foreach (var child in children)
        {
            if (child.FindFirst(TreeScope.Element, condition) != null)
            {
                var id = SaveUpgraded(child, dotnetWindowRoot, state);
                if (id != null && seen.Add(id)) results.Add(id);
            }
            WalkForAll(child, condition, dotnetWindowRoot, trueCond, state, results, seen);
        }
    }

    // --- UIA3 array iteration ---

    public static IEnumerable<IUIAutomationElement> IterateArray(IUIAutomationElementArray? array)
    {
        if (array == null) yield break;
        var len = array.Length;
        for (var i = 0; i < len; i++)
        {
            yield return array.GetElement(i);
        }
    }

    private static string[] SaveAll(IUIAutomationElementArray array, SessionState state)
    {
        var results = new List<string>();
        foreach (var el in IterateArray(array))
        {
            var id = state.TrySaveElementAndReturnId(el);
            if (id != null) results.Add(id);
        }
        return results.ToArray();
    }
}
