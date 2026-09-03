using System.Diagnostics;
using System.Text.Json;
using System.Xml;
using DesktopDriverServer.DotNet;
using DesktopDriverServer.Java;
using DesktopDriverServer.Server;
using DesktopDriverServer.State;
using DesktopDriverServer.Uia3;

namespace DesktopDriverServer.Commands;

public static class PageSourceCommands
{
    public static object? GetPageSource(SessionState state, JsonElement? parameters)
    {
        var root = state.GetLiveRoot();
        if (root == null)
        {
            return "<DummyRoot></DummyRoot>";
        }

        // When Java Swing mode is active and the root is a Java window, build
        // the page source from the Java agent accessibility tree instead of UIA
        // (which sees the Java window as an opaque pane with no children).
        if (state.JavaSwingEnabled && state.Java != null && state.IsJavaWindowElement(root))
        {
            var hwnd = root.CurrentNativeWindowHandle;
            var javaRoot = state.Java.GetWindowRoot(hwnd);
            if (javaRoot != null)
            {
                var javaDoc = new XmlDocument();
                state.Java.BuildXml(javaRoot, javaDoc, null);
                return javaDoc.OuterXml;
            }
        }

        // Unlike Java Swing above, the .NET bridge never auto-swaps standard page source —
        // even on a bridge-attached window, getPageSource() always reflects real UIA only.
        // Bridge-reflected content (custom-drawn control libraries like DevExpress that UIA
        // sees as opaque panes) is reached explicitly via "windows: getPageSourceViaDotnetBridge".
        var xmlDoc = new XmlDocument();

        // Fast path: one BuildUpdatedCache COM call pulls the whole subtree + every
        // property we read, then the walk is in-process (GetCachedChildren /
        // GetCachedPropertyValue). The live path did ~25 cross-process COM calls per node.
        var noCache = Environment.GetEnvironmentVariable("UIA_NO_CACHE") == "1"; // perf A/B only
        try
        {
            if (noCache) throw new InvalidOperationException("UIA_NO_CACHE");
            var req = BuildPageSourceCacheRequest(state.Automation);
            var trueCond = state.Automation.CreateTrueCondition();
            // Cache one tree level at a time: FindAllBuildCache(Children) returns each
            // child with every property already cached, so the ~25 property reads per
            // node become in-process GetCachedPropertyValue calls. Same per-level FindAll
            // traversal the live walk (and native find) use, so nothing is dropped — a
            // full-subtree cache request instead made the WinForms provider slow AND
            // incomplete.
            var cachedRoot = root.FindFirstBuildCache(TreeScope.Element, trueCond, req);
            BuildPageSourceCached(cachedRoot, xmlDoc, null, state, cachedRoot, req, trueCond);
            return xmlDoc.OuterXml;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PageSource] cached walk failed, falling back to live walk: {ex.Message}");
            xmlDoc = new XmlDocument();
        }

        BuildPageSource(root, xmlDoc, null, state, root);
        return xmlDoc.OuterXml;
    }

    // Every property BuildPageSourceCached reads must be added here, or
    // GetCachedPropertyValue throws for it.
    private static readonly int[] PageSourcePropertyIds =
    {
        UIA.ControlTypePropertyId, UIA.LocalizedControlTypePropertyId, UIA.NamePropertyId,
        UIA.AcceleratorKeyPropertyId, UIA.AccessKeyPropertyId, UIA.AutomationIdPropertyId,
        UIA.ClassNamePropertyId, UIA.FrameworkIdPropertyId, UIA.HasKeyboardFocusPropertyId,
        UIA.HelpTextPropertyId, UIA.IsContentElementPropertyId, UIA.IsControlElementPropertyId,
        UIA.IsEnabledPropertyId, UIA.IsKeyboardFocusablePropertyId, UIA.IsOffscreenPropertyId,
        UIA.IsPasswordPropertyId, UIA.IsRequiredForFormPropertyId, UIA.ItemStatusPropertyId,
        UIA.ItemTypePropertyId, UIA.OrientationPropertyId, UIA.ProcessIdPropertyId,
        UIA.RuntimeIdPropertyId, UIA.BoundingRectanglePropertyId,
    };

    private static IUIAutomationCacheRequest BuildPageSourceCacheRequest(IUIAutomation automation)
    {
        var req = automation.CreateCacheRequest();
        foreach (var pid in PageSourcePropertyIds)
        {
            req.AddProperty(pid);
        }
        req.AddPattern(UIA.WindowPatternId);
        req.AddPattern(UIA.TransformPatternId);
        req.TreeScope = TreeScope.Element; // per-level FindAllBuildCache caches each element itself
        req.TreeFilter = automation.CreateTrueCondition();
        req.AutomationElementMode = UIA.AutomationElementModeFull;
        return req;
    }

    private static object? CVal(IUIAutomationElement el, int pid)
    {
        try { return el.GetCachedPropertyValue(pid); } catch { return null; }
    }

    private static string CStr(IUIAutomationElement el, int pid)
        => CVal(el, pid) as string ?? "";

    private static bool CBool(IUIAutomationElement el, int pid)
        => CVal(el, pid) is int i && i != 0;

    private static void BuildPageSourceCached(
        IUIAutomationElement element,
        XmlDocument xmlDoc,
        XmlElement? parentXmlElement,
        SessionState state,
        IUIAutomationElement rootForCoords,
        IUIAutomationCacheRequest req,
        IUIAutomationCondition trueCond)
    {
        var perfSw = state.PerfMetricsEnabled ? Stopwatch.StartNew() : null;
        try
        {
            var controlTypeId = CVal(element, UIA.ControlTypePropertyId) is int ct ? ct : 0;
            var localizedControlType = CStr(element, UIA.LocalizedControlTypePropertyId);
            var tagName = ConditionBuilder.ControlTypeNameById.TryGetValue(controlTypeId, out var name) ? name : "";
            if (string.IsNullOrEmpty(tagName))
            {
                tagName = string.Concat(localizedControlType.Split(' ')
                    .Select(w => w.Length > 0 ? char.ToUpper(w[0]) + w[1..].ToLower() : ""));
            }
            if (string.IsNullOrEmpty(tagName))
            {
                tagName = "Unknown";
            }

            var runtimeId = CVal(element, UIA.RuntimeIdPropertyId) as int[];
            var runtimeIdStr = runtimeId != null ? string.Join(".", runtimeId) : "";

            // Cached BoundingRectangle is a double[4] = [left, top, width, height]
            // (unlike CurrentBoundingRectangle's tagRECT of left/top/right/bottom).
            var rect = CVal(element, UIA.BoundingRectanglePropertyId) as double[] ?? new double[4];
            var rootRect = CVal(rootForCoords, UIA.BoundingRectanglePropertyId) as double[] ?? new double[4];
            if (rect.Length < 4) rect = new double[4];
            if (rootRect.Length < 4) rootRect = new double[4];
            var x = (int)(rect[0] - rootRect[0]);
            var y = (int)(rect[1] - rootRect[1]);
            var width = (int)rect[2];
            var height = (int)rect[3];

            var newXmlElement = xmlDoc.CreateElement(tagName);
            newXmlElement.SetAttribute("AcceleratorKey", CStr(element, UIA.AcceleratorKeyPropertyId));
            newXmlElement.SetAttribute("AccessKey", CStr(element, UIA.AccessKeyPropertyId));
            newXmlElement.SetAttribute("AutomationId", CStr(element, UIA.AutomationIdPropertyId));
            newXmlElement.SetAttribute("ClassName", CStr(element, UIA.ClassNamePropertyId));
            newXmlElement.SetAttribute("FrameworkId", CStr(element, UIA.FrameworkIdPropertyId));
            newXmlElement.SetAttribute("HasKeyboardfocus", CBool(element, UIA.HasKeyboardFocusPropertyId).ToString());
            newXmlElement.SetAttribute("HelpText", CStr(element, UIA.HelpTextPropertyId));
            newXmlElement.SetAttribute("IsContentelement", CBool(element, UIA.IsContentElementPropertyId).ToString());
            newXmlElement.SetAttribute("IsControlelement", CBool(element, UIA.IsControlElementPropertyId).ToString());
            newXmlElement.SetAttribute("IsEnabled", CBool(element, UIA.IsEnabledPropertyId).ToString());
            newXmlElement.SetAttribute("IsKeyboardfocusable", CBool(element, UIA.IsKeyboardFocusablePropertyId).ToString());
            newXmlElement.SetAttribute("IsOffscreen", CBool(element, UIA.IsOffscreenPropertyId).ToString());
            newXmlElement.SetAttribute("IsPassword", CBool(element, UIA.IsPasswordPropertyId).ToString());
            newXmlElement.SetAttribute("IsRequiredforform", CBool(element, UIA.IsRequiredForFormPropertyId).ToString());
            newXmlElement.SetAttribute("ItemStatus", CStr(element, UIA.ItemStatusPropertyId));
            newXmlElement.SetAttribute("ItemType", CStr(element, UIA.ItemTypePropertyId));
            newXmlElement.SetAttribute("LocalizedControlType", localizedControlType);
            newXmlElement.SetAttribute("Name", CStr(element, UIA.NamePropertyId));
            newXmlElement.SetAttribute("Orientation",
                (CVal(element, UIA.OrientationPropertyId) is int o ? o : 0).ToString());
            newXmlElement.SetAttribute("ProcessId",
                (CVal(element, UIA.ProcessIdPropertyId) is int p ? p : 0).ToString());
            newXmlElement.SetAttribute("RuntimeId", runtimeIdStr);
            newXmlElement.SetAttribute("x", x.ToString());
            newXmlElement.SetAttribute("y", y.ToString());
            newXmlElement.SetAttribute("width", width.ToString());
            newXmlElement.SetAttribute("height", height.ToString());

            // GetCachedPattern throws E_INVALIDARG when the element doesn't support the
            // pattern (unlike GetCurrentPattern, which returns null) — guard each.
            try
            {
                if (element.GetCachedPattern(UIA.WindowPatternId) is IUIAutomationWindowPattern wp)
                {
                    newXmlElement.SetAttribute("CanMaximize", (wp.CachedCanMaximize != 0).ToString());
                    newXmlElement.SetAttribute("CanMinimize", (wp.CachedCanMinimize != 0).ToString());
                    newXmlElement.SetAttribute("IsModal", (wp.CachedIsModal != 0).ToString());
                    newXmlElement.SetAttribute("WindowVisualState", wp.CachedWindowVisualState.ToString());
                    newXmlElement.SetAttribute("WindowInteractionState", wp.CachedWindowInteractionState.ToString());
                    newXmlElement.SetAttribute("IsTopmost", (wp.CachedIsTopmost != 0).ToString());
                }
            }
            catch { }

            try
            {
                if (element.GetCachedPattern(UIA.TransformPatternId) is IUIAutomationTransformPattern tp)
                {
                    newXmlElement.SetAttribute("CanRotate", (tp.CachedCanRotate != 0).ToString());
                    newXmlElement.SetAttribute("CanResize", (tp.CachedCanResize != 0).ToString());
                    newXmlElement.SetAttribute("CanMove", (tp.CachedCanMove != 0).ToString());
                }
            }
            catch { }

            if (parentXmlElement == null)
            {
                xmlDoc.AppendChild(newXmlElement);
            }
            else
            {
                parentXmlElement.AppendChild(newXmlElement);
            }

            var children = element.FindAllBuildCache(TreeScope.Children, trueCond, req);

            if (perfSw != null)
            {
                perfSw.Stop();
                state.Perf.Record("uia.pageSource.node", perfSw.Elapsed.TotalMilliseconds);
            }

            foreach (var child in FindCommands.IterateArray(children))
            {
                BuildPageSourceCached(child, xmlDoc, newXmlElement, state, rootForCoords, req, trueCond);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PageSource] cached node skipped: {ex.GetType().Name}: {ex.Message}");
        }
    }

    /// <summary>
    /// "windows: getPageSourceViaDotnetBridge" — dumps the .NET bridge's own reflected
    /// tree directly (its full tree, no correlation with real UIA), for the specific
    /// content a bridge-attached app's real UIA tree can't see. See FindCommands'
    /// FindElementDotnetBridge for the equivalent find-side opt-in.
    /// </summary>
    public static object? GetPageSourceDotnetBridge(SessionState state, JsonElement? parameters)
    {
        string? contextElementId = null;
        if (parameters?.TryGetProperty("contextElementId", out var ctxProp) == true && ctxProp.ValueKind == JsonValueKind.String)
        {
            contextElementId = ctxProp.GetString();
        }

        var dotnetRoot = FindCommands.ResolveDotnetBridgeRoot(state, contextElementId);

        var dotnetDoc = new XmlDocument();
        state.DotNetBridge!.BuildXml(dotnetRoot, dotnetDoc, null);
        return dotnetDoc.OuterXml;
    }

    private static void BuildPageSource(
        IUIAutomationElement element,
        XmlDocument xmlDoc,
        XmlElement? parentXmlElement,
        SessionState state,
        IUIAutomationElement? rootForCoords)
    {
        var perfSw = state.PerfMetricsEnabled ? Stopwatch.StartNew() : null;
        try
        {
            var controlTypeId = element.CurrentControlType;
            var tagName = ConditionBuilder.ControlTypeNameById.TryGetValue(controlTypeId, out var name)
                ? name
                : "";

            var localizedControlType = element.get_CurrentLocalizedControlType() ?? "";
            if (string.IsNullOrEmpty(tagName))
            {
                // Fallback: capitalize localized control type words.
                tagName = string.Concat(
                    localizedControlType.Split(' ')
                        .Select(w => w.Length > 0
                            ? char.ToUpper(w[0]) + w[1..].ToLower()
                            : ""));
            }
            if (string.IsNullOrEmpty(tagName))
            {
                tagName = "Unknown";
            }

            var runtimeId = element.GetRuntimeId();
            var runtimeIdStr = runtimeId != null ? string.Join(".", runtimeId) : "";

            var rect = element.CurrentBoundingRectangle;
            var rootRect = rootForCoords?.CurrentBoundingRectangle ?? new tagRECT();
            var x = rect.left - rootRect.left;
            var y = rect.top - rootRect.top;
            var width = rect.right - rect.left;
            var height = rect.bottom - rect.top;

            var newXmlElement = xmlDoc.CreateElement(tagName);
            newXmlElement.SetAttribute("AcceleratorKey", element.get_CurrentAcceleratorKey() ?? "");
            newXmlElement.SetAttribute("AccessKey", element.get_CurrentAccessKey() ?? "");
            newXmlElement.SetAttribute("AutomationId", element.get_CurrentAutomationId() ?? "");
            newXmlElement.SetAttribute("ClassName", element.get_CurrentClassName() ?? "");
            newXmlElement.SetAttribute("FrameworkId", element.get_CurrentFrameworkId() ?? "");
            newXmlElement.SetAttribute("HasKeyboardfocus", (element.CurrentHasKeyboardFocus != 0).ToString());
            newXmlElement.SetAttribute("HelpText", element.get_CurrentHelpText() ?? "");
            newXmlElement.SetAttribute("IsContentelement", (element.CurrentIsContentElement != 0).ToString());
            newXmlElement.SetAttribute("IsControlelement", (element.CurrentIsControlElement != 0).ToString());
            newXmlElement.SetAttribute("IsEnabled", (element.CurrentIsEnabled != 0).ToString());
            newXmlElement.SetAttribute("IsKeyboardfocusable", (element.CurrentIsKeyboardFocusable != 0).ToString());
            newXmlElement.SetAttribute("IsOffscreen", (element.CurrentIsOffscreen != 0).ToString());
            newXmlElement.SetAttribute("IsPassword", (element.CurrentIsPassword != 0).ToString());
            newXmlElement.SetAttribute("IsRequiredforform", (element.CurrentIsRequiredForForm != 0).ToString());
            newXmlElement.SetAttribute("ItemStatus", element.get_CurrentItemStatus() ?? "");
            newXmlElement.SetAttribute("ItemType", element.get_CurrentItemType() ?? "");
            newXmlElement.SetAttribute("LocalizedControlType", localizedControlType);
            newXmlElement.SetAttribute("Name", element.get_CurrentName() ?? "");
            newXmlElement.SetAttribute("Orientation", element.CurrentOrientation.ToString());
            newXmlElement.SetAttribute("ProcessId", element.CurrentProcessId.ToString());
            newXmlElement.SetAttribute("RuntimeId", runtimeIdStr);
            newXmlElement.SetAttribute("x", x.ToString());
            newXmlElement.SetAttribute("y", y.ToString());
            newXmlElement.SetAttribute("width", width.ToString());
            newXmlElement.SetAttribute("height", height.ToString());

            // WindowPattern attributes (for top-level windows)
            if (element.GetCurrentPattern(UIA.WindowPatternId) is IUIAutomationWindowPattern wp)
            {
                newXmlElement.SetAttribute("CanMaximize", (wp.CurrentCanMaximize != 0).ToString());
                newXmlElement.SetAttribute("CanMinimize", (wp.CurrentCanMinimize != 0).ToString());
                newXmlElement.SetAttribute("IsModal", (wp.CurrentIsModal != 0).ToString());
                newXmlElement.SetAttribute("WindowVisualState", wp.CurrentWindowVisualState.ToString());
                newXmlElement.SetAttribute("WindowInteractionState", wp.CurrentWindowInteractionState.ToString());
                newXmlElement.SetAttribute("IsTopmost", (wp.CurrentIsTopmost != 0).ToString());
            }

            // TransformPattern attributes
            if (element.GetCurrentPattern(UIA.TransformPatternId) is IUIAutomationTransformPattern tp)
            {
                newXmlElement.SetAttribute("CanRotate", (tp.CurrentCanRotate != 0).ToString());
                newXmlElement.SetAttribute("CanResize", (tp.CurrentCanResize != 0).ToString());
                newXmlElement.SetAttribute("CanMove", (tp.CurrentCanMove != 0).ToString());
            }

            if (parentXmlElement == null)
            {
                xmlDoc.AppendChild(newXmlElement);
            }
            else
            {
                parentXmlElement.AppendChild(newXmlElement);
            }

            // Walk all children unconditionally, matching the traversal FindCommands
            // uses (native find ignores TreeFilter; its manual-walk fallback uses
            // TrueCondition). Keeps page source and findElement seeing the same tree.
            var children = element.FindAll(TreeScope.Children, state.Automation.CreateTrueCondition());

            if (perfSw != null)
            {
                perfSw.Stop();
                state.Perf.Record("uia.pageSource.node", perfSw.Elapsed.TotalMilliseconds);
            }

            foreach (var child in FindCommands.IterateArray(children))
            {
                BuildPageSource(child, xmlDoc, newXmlElement, state, rootForCoords);
            }
        }
        catch
        {
            // Match the historical PowerShell driver's behavior — swallow per-element
            // failures during page-source generation so a single flaky subtree can't
            // abort the whole dump.
        }
    }
}
