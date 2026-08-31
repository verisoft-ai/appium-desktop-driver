using System.Text.Json;
using DesktopDriverServer.DotNet;
using DesktopDriverServer.Java;
using DesktopDriverServer.Protocol;
using DesktopDriverServer.Server;
using DesktopDriverServer.State;
using DesktopDriverServer.Uia3;

namespace DesktopDriverServer.Commands;

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

        // Route to .NET bridge only when context is already a bridge element — see
        // TryRouteToDotnet. Bridge-only content is reached via the explicit
        // *ViaDotnetBridge commands, never automatically from here.
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

        switch (scope.ToLowerInvariant())
        {
            case "descendants":
                return FindFirstRecursively(searchRoot, condition, state, includeSelf: false);
            case "children":
            {
                var el = searchRoot.FindFirst(TreeScope.Children, condition);
                return el != null ? state.SaveElementAndReturnId(el) : null;
            }
            case "element":
            {
                var el = searchRoot.FindFirst(TreeScope.Element, condition);
                return el != null ? state.SaveElementAndReturnId(el) : null;
            }
            case "subtree":
                return FindFirstRecursively(searchRoot, condition, state, includeSelf: true);
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
                return el != null ? state.SaveElementAndReturnId(el) : null;
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
        // TryRouteToDotnet. Bridge-only content is reached via the explicit
        // *ViaDotnetBridge commands, never automatically from here.
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

        switch (scope.ToLowerInvariant())
        {
            case "descendants":
                return FindAllRecursively(searchRoot, condition, state, includeSelf: false);
            case "children":
                return SaveAll(searchRoot.FindAll(TreeScope.Children, condition), state);
            case "element":
                return SaveAll(searchRoot.FindAll(TreeScope.Element, condition), state);
            case "subtree":
                return FindAllRecursively(searchRoot, condition, state, includeSelf: true);
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
                return SaveAll(searchRoot.FindAll(TreeScope.Element | TreeScope.Children, condition), state);
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
    /// continuing a search inside a subtree it already knows is bridge-only, e.g.
    /// one returned by "windows: findElementViaDotnetBridge"). Standard find never
    /// auto-routes into the bridge just because the current window happens to have
    /// one attached — real UIA content stays reachable through the normal find
    /// commands even on a bridge-attached window; the bridge is opt-in via the
    /// dedicated *ViaDotnetBridge commands below (see FindElementDotnetBridge).
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
    /// Resolves the .NET bridge subtree a *ViaDotnetBridge command should search —
    /// either the bridge element named by an explicit contextElementId (continuing a
    /// search a caller already started in bridge-land), or the whole window's
    /// reflected tree when no context is given. Internal (not private) so
    /// PageSourceCommands.GetPageSourceDotnetBridge shares this instead of
    /// re-implementing the same resolution.
    /// </summary>
    internal static BridgeAgentElement ResolveDotnetBridgeRoot(SessionState state, string? contextElementId)
    {
        if (!state.DotNetBridgeEnabled || state.DotNetBridge == null)
        {
            throw new InvalidOperationException(
                "The .NET bridge is not attached to this session. Call 'windows: attachDotnetBridge' first.");
        }

        if (contextElementId != null)
        {
            if (!BridgeAgentElement.IsDotnetId(contextElementId))
            {
                throw new ArgumentException(
                    "contextElementId must be a .NET bridge element id (returned by a *ViaDotnetBridge command) " +
                    "— the bridge tree isn't correlated to the real UIA tree, so a plain UIA element id can't be used as a bridge search root.");
            }
            return state.DotNetBridge.GetById(contextElementId);
        }

        var uiaRoot = state.GetLiveRoot()
            ?? throw new InvalidOperationException("No active window for this session.");
        var hwnd = uiaRoot.CurrentNativeWindowHandle;
        var title = uiaRoot.get_CurrentName() ?? "";
        return state.DotNetBridge.GetWindowRoot(hwnd, title)
            ?? throw new InvalidOperationException("Could not resolve the .NET bridge's window root for the current window.");
    }

    /// <summary>
    /// "windows: findElementViaDotnetBridge" — searches the .NET bridge's own
    /// reflected tree directly (its full tree, no correlation with real UIA),
    /// bypassing UIA entirely. The explicit opt-in counterpart to FindElement,
    /// for the specific elements a bridge-attached app's real UIA tree can't see.
    /// </summary>
    public static object? FindElementDotnetBridge(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var conditionDto = JsonSerializer.Deserialize<ConditionDto>(p.GetProperty("condition").GetRawText())
            ?? throw new ArgumentException("condition is required.");
        string? contextElementId = p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String
            ? ctxProp.GetString()
            : null;

        var root = ResolveDotnetBridgeRoot(state, contextElementId);
        return state.DotNetBridge!.FindFirst(root, conditionDto, "subtree");
    }

    /// <summary>"windows: findElementsViaDotnetBridge" — see FindElementDotnetBridge.</summary>
    public static object? FindElementsDotnetBridge(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var conditionDto = JsonSerializer.Deserialize<ConditionDto>(p.GetProperty("condition").GetRawText())
            ?? throw new ArgumentException("condition is required.");
        string? contextElementId = p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String
            ? ctxProp.GetString()
            : null;

        var root = ResolveDotnetBridgeRoot(state, contextElementId);
        return state.DotNetBridge!.FindAll(root, conditionDto, "subtree");
    }

    // Descendant / subtree search is UIA's own scoped FindFirst/FindAll and nothing
    // more. A previous implementation supplemented this with a manual child-by-child
    // walk via TreeScope.Children to recover matches native scope skips (WPF popups
    // hosted in a separate fragment root, virtualised lists). That walk was removed:
    // it ran unconditionally even when native returned complete results, had no
    // containment guard, and on legacy Win32 providers (ComboBox, old ActiveX) whose
    // TreeScope.Children navigation is broken it escaped the element's subtree and
    // enumerated the whole desktop (20k+ elements for `.//*`). Provider-boundary
    // cases that genuinely need crossing (IE/MSHTML documents, some popups) should be
    // handled with targeted fragment-root resolution, not a blanket re-walk.

    private static string? FindFirstRecursively(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state, bool includeSelf)
    {
        var scope = includeSelf ? TreeScope.Subtree : TreeScope.Descendants;
        var native = element.FindFirst(scope, condition);
        if (native != null) return state.TrySaveElementAndReturnId(native);

        if (includeSelf)
        {
            var self = element.FindFirst(TreeScope.Element, condition);
            if (self != null) return state.TrySaveElementAndReturnId(self);
        }
        return null;
    }

    private static string[] FindAllRecursively(IUIAutomationElement element, IUIAutomationCondition condition, SessionState state, bool includeSelf)
    {
        var scope = includeSelf ? TreeScope.Subtree : TreeScope.Descendants;
        var results = IterateArray(element.FindAll(scope, condition))
            .Select(el => state.TrySaveElementAndReturnId(el))
            .Where(id => id != null)
            .Select(id => id!)
            .ToList();

        // TreeScope.Subtree already includes the element itself, but a broken provider
        // can omit it from FindAll while still matching it via TreeScope.Element.
        // Prepend it: descendant-or-self is document order, so self comes first.
        if (includeSelf)
        {
            var self = element.FindFirst(TreeScope.Element, condition);
            if (self != null)
            {
                var id = state.TrySaveElementAndReturnId(self);
                if (id != null && !results.Contains(id)) results.Insert(0, id);
            }
        }
        return results.ToArray();
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
