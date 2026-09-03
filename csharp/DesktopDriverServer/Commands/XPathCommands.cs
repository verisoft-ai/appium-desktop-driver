using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Xml;
using DesktopDriverServer.DotNet;
using DesktopDriverServer.Java;
using DesktopDriverServer.Server;
using DesktopDriverServer.State;
using DesktopDriverServer.Uia3;

namespace DesktopDriverServer.Commands;

/// <summary>
/// "evaluateXPath" — evaluates a whole XPath 1.0 expression in the process that
/// owns the tree, using the platform's mature engine instead of the hand-written
/// remote-tree evaluator that used to live in lib/xpath/.
///
/// For real UIA the tree is materialised once into an <see cref="XmlDocument"/>
/// and handed to <c>System.Xml.XPath</c> (a complete, Microsoft-maintained XPath
/// 1.0 implementation — axes, positional predicates, count(), string functions,
/// unions, all correct). Result nodes carry the element-table id of the element
/// they were built from, so the WebDriver layer gets back the same id strings the
/// old engine produced.
///
/// Language independence: element tag names come from
/// <see cref="ConditionBuilder.ControlTypeNameById"/> (the language-neutral
/// programmatic names — "Button", "Edit", …), never from LocalizedControlType.
/// A selector like <c>//Button</c> matches identically on a Hebrew, English or
/// any other localised Windows. Attribute *values* (Name, HelpText, …) are the
/// app's own strings and are compared verbatim, so mixed-language UIs match
/// exactly as typed.
/// </summary>
public static class XPathCommands
{
    public static object? EvaluateXPath(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var expression = p.GetProperty("expression").GetString()
            ?? throw new ArgumentException("expression is required.");
        bool multiple = p.TryGetProperty("multiple", out var m) && m.ValueKind == JsonValueKind.True;

        string? contextElementId = null;
        if (p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String)
        {
            contextElementId = ctxProp.GetString();
        }

        // Bridge runtimes own their own tree — hand the raw expression to them.
        if (contextElementId != null && JavaAgentElement.IsJavaId(contextElementId))
        {
            if (state.Java == null) throw new InvalidOperationException("Java agent is not attached.");
            return state.Java.EvaluateXPath(state.Java.GetById(contextElementId), expression, multiple);
        }
        if (contextElementId != null && BridgeAgentElement.IsDotnetId(contextElementId))
        {
            if (state.DotNetBridge == null) throw new InvalidOperationException("The .NET bridge is not attached.");
            return state.DotNetBridge.EvaluateXPath(state.DotNetBridge.GetById(contextElementId), expression, multiple);
        }

        // Route a context-less query on a Java window to the Java agent, matching
        // how FindCommands.TryRouteToJava treats the session root.
        if (contextElementId == null && state.JavaSwingEnabled && state.Java != null)
        {
            var uiaRoot = state.GetLiveRoot();
            if (uiaRoot != null && state.IsJavaWindowElement(uiaRoot))
            {
                var hwnd = uiaRoot.CurrentNativeWindowHandle;
                var title = uiaRoot.get_CurrentName() ?? "";
                var javaRoot = state.Java.GetWindowRoot(hwnd, title);
                if (javaRoot != null)
                {
                    return state.Java.EvaluateXPath(javaRoot, expression, multiple);
                }
            }
        }

        var root = contextElementId != null
            ? state.GetElement(contextElementId)
            : (state.GetLiveRoot() ?? state.Automation.GetRootElement());

        var model = UiaXmlModel.Build(state, root, state.PerfMetricsEnabled ? state.Perf : null);

        // Evaluate relative to the context node when one was given, so relative
        // expressions (`.//x`, `..`, `self::`) and the upward axes work.
        var ids = XPathEvaluator.Evaluate(
            model.Document, model.ContextNode(contextElementId), UiaXmlModel.IdAttr, expression, multiple,
            nodeId => model.Elements.TryGetValue(nodeId, out var el) ? state.TrySaveElementAndReturnId(el) : null);

        return multiple ? ids.ToArray() : (ids.Count > 0 ? (object)ids[0] : null);
    }

    /// <summary>
    /// "windows: findElement(s)ViaDotnetBridge" with an XPath locator — evaluates the
    /// expression against the .NET bridge's own reflected tree directly, the opt-in
    /// counterpart to <see cref="EvaluateXPath"/> for content real UIA can't see.
    /// </summary>
    public static object? EvaluateXPathDotnetBridge(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var expression = p.GetProperty("expression").GetString()
            ?? throw new ArgumentException("expression is required.");
        bool multiple = p.TryGetProperty("multiple", out var m) && m.ValueKind == JsonValueKind.True;
        string? contextElementId = p.TryGetProperty("contextElementId", out var ctxProp) && ctxProp.ValueKind == JsonValueKind.String
            ? ctxProp.GetString()
            : null;

        var root = FindCommands.ResolveDotnetBridgeRoot(state, contextElementId);
        return state.DotNetBridge!.EvaluateXPath(root, expression, multiple);
    }
}

/// <summary>Materialised, XPath-queryable snapshot of a UIA subtree.</summary>
internal sealed class UiaXmlModel
{
    internal const string IdAttr = "__uiaNodeId";

    // Attribute name -> UIA property id. PascalCase keys match what getProperty returns
    // and what the page source exposes, so existing selectors keep working. XPath is
    // case-sensitive on attribute names; these are the canonical spellings.
    private static readonly (string Name, int Pid, bool Bool)[] Attributes =
    {
        ("AcceleratorKey", UIA.AcceleratorKeyPropertyId, false),
        ("AccessKey", UIA.AccessKeyPropertyId, false),
        ("AutomationId", UIA.AutomationIdPropertyId, false),
        ("ClassName", UIA.ClassNamePropertyId, false),
        ("FrameworkId", UIA.FrameworkIdPropertyId, false),
        ("HasKeyboardFocus", UIA.HasKeyboardFocusPropertyId, true),
        ("HelpText", UIA.HelpTextPropertyId, false),
        ("IsContentElement", UIA.IsContentElementPropertyId, true),
        ("IsControlElement", UIA.IsControlElementPropertyId, true),
        ("IsEnabled", UIA.IsEnabledPropertyId, true),
        ("IsKeyboardFocusable", UIA.IsKeyboardFocusablePropertyId, true),
        ("IsOffscreen", UIA.IsOffscreenPropertyId, true),
        ("IsPassword", UIA.IsPasswordPropertyId, true),
        ("IsRequiredForForm", UIA.IsRequiredForFormPropertyId, true),
        ("ItemStatus", UIA.ItemStatusPropertyId, false),
        ("ItemType", UIA.ItemTypePropertyId, false),
        ("LocalizedControlType", UIA.LocalizedControlTypePropertyId, false),
        ("Name", UIA.NamePropertyId, false),
        ("Orientation", UIA.OrientationPropertyId, false),
        ("ProcessId", UIA.ProcessIdPropertyId, false),
    };

    private static IUIAutomationCacheRequest BuildCacheRequest(IUIAutomation automation)
    {
        var req = automation.CreateCacheRequest();
        foreach (var (_, pid, _) in Attributes)
        {
            req.AddProperty(pid);
        }
        req.AddProperty(UIA.ControlTypePropertyId);
        req.AddProperty(UIA.RuntimeIdPropertyId);
        req.AddProperty(UIA.BoundingRectanglePropertyId);
        req.TreeScope = TreeScope.Element;
        req.TreeFilter = automation.CreateTrueCondition();
        req.AutomationElementMode = UIA.AutomationElementModeFull;
        return req;
    }

    private static string ReadCached(IUIAutomationElement el, int pid, bool isBool)
    {
        object? v;
        try { v = el.GetCachedPropertyValue(pid); } catch { v = null; }
        if (isBool) return v is int i && i != 0 ? "true" : "false";
        return v as string ?? (v is int n ? n.ToString() : "");
    }

    public XmlDocument Document { get; }
    public Dictionary<string, IUIAutomationElement> Elements { get; }

    private UiaXmlModel(XmlDocument doc, Dictionary<string, IUIAutomationElement> elements)
    {
        Document = doc;
        Elements = elements;
    }

    /// <summary>
    /// The node to evaluate relative to, or null (evaluate from the document node)
    /// when no context was given. <see cref="Build"/> always roots the document at
    /// the context element, so that element is simply <see cref="XmlDocument.DocumentElement"/> —
    /// no need to re-match it by runtime id (which also breaks when SessionState
    /// minted a GUID id for an element with an empty UIA RuntimeId, and costs one
    /// extra COM call per element).
    /// </summary>
    public XmlElement? ContextNode(string? contextElementId)
        => contextElementId == null ? null : Document.DocumentElement;

    public static UiaXmlModel Build(SessionState state, IUIAutomationElement root, Diagnostics.PerfCounters? perf = null)
    {
        var doc = new XmlDocument();
        var elements = new Dictionary<string, IUIAutomationElement>();
        int counter = 0;

        // Fast path: one BuildUpdatedCache pulls the whole subtree + every property,
        // then the walk is in-process. Falls back to the per-node live walk on failure.
        try
        {
            if (Environment.GetEnvironmentVariable("UIA_NO_CACHE") == "1") throw new InvalidOperationException("UIA_NO_CACHE"); // perf A/B
            var req = BuildCacheRequest(state.Automation);
            var trueCond = state.Automation.CreateTrueCondition();
            // Cache one level at a time via FindAllBuildCache(Children) — see
            // PageSourceCommands for why a full-subtree cache request is avoided.
            var cachedRoot = root.FindFirstBuildCache(TreeScope.Element, trueCond, req);
            var rootXml = BuildElementCached(doc, cachedRoot, elements, ref counter, perf, req, trueCond)
                ?? doc.CreateElement("DummyRoot");
            doc.AppendChild(rootXml);
            return new UiaXmlModel(doc, elements);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[XPath] cached materialise failed, falling back to live walk: {ex.Message}");
        }

        doc = new XmlDocument();
        elements = new Dictionary<string, IUIAutomationElement>();
        counter = 0;
        var liveTrueCond = state.Automation.CreateTrueCondition();
        var liveRootXml = BuildElementLive(doc, root, liveTrueCond, elements, ref counter, perf)
            ?? doc.CreateElement("DummyRoot");
        doc.AppendChild(liveRootXml);
        return new UiaXmlModel(doc, elements);
    }

    private static XmlElement? BuildElementCached(
        XmlDocument doc,
        IUIAutomationElement element,
        Dictionary<string, IUIAutomationElement> elements,
        ref int counter,
        Diagnostics.PerfCounters? perf,
        IUIAutomationCacheRequest req,
        IUIAutomationCondition trueCond)
    {
        var perfSw = perf != null ? Stopwatch.StartNew() : null;
        XmlElement xml;
        try
        {
            xml = doc.CreateElement(TagNameOfCached(element));

            var nodeId = "n" + counter++;
            xml.SetAttribute(IdAttr, nodeId);
            elements[nodeId] = element;

            foreach (var (name, pid, isBool) in Attributes)
            {
                try { xml.SetAttribute(name, Sanitize(ReadCached(element, pid, isBool))); }
                catch { /* skip a single unreadable attribute */ }
            }

            try
            {
                if (element.GetCachedPropertyValue(UIA.RuntimeIdPropertyId) is int[] rid && rid.Length > 0)
                    xml.SetAttribute("RuntimeId", string.Join(".", rid));
            }
            catch { }

            try
            {
                // Cached BoundingRectangle is a double[4] = [left, top, width, height].
                if (element.GetCachedPropertyValue(UIA.BoundingRectanglePropertyId) is double[] r && r.Length == 4)
                {
                    xml.SetAttribute("x", ((int)r[0]).ToString());
                    xml.SetAttribute("y", ((int)r[1]).ToString());
                    xml.SetAttribute("width", ((int)r[2]).ToString());
                    xml.SetAttribute("height", ((int)r[3]).ToString());
                }
            }
            catch { }

            var text = Sanitize(ReadCached(element, UIA.NamePropertyId, false));
            if (text.Length > 0) xml.AppendChild(doc.CreateTextNode(text));
        }
        catch
        {
            return null;
        }

        try
        {
            var children = element.FindAllBuildCache(TreeScope.Children, trueCond, req);
            var len = children?.Length ?? 0;

            if (perfSw != null)
            {
                perfSw.Stop();
                perf!.Record("uia.xpathModel.node", perfSw.Elapsed.TotalMilliseconds);
            }

            for (var i = 0; i < len; i++)
            {
                IUIAutomationElement child;
                try { child = children!.GetElement(i); }
                catch { continue; }
                var childXml = BuildElementCached(doc, child, elements, ref counter, perf, req, trueCond);
                if (childXml != null) xml.AppendChild(childXml);
            }
        }
        catch { }

        return xml;
    }

    private static XmlElement? BuildElementLive(
        XmlDocument doc,
        IUIAutomationElement element,
        IUIAutomationCondition trueCond,
        Dictionary<string, IUIAutomationElement> elements,
        ref int counter,
        Diagnostics.PerfCounters? perf)
    {
        var perfSw = perf != null ? Stopwatch.StartNew() : null;
        XmlElement xml;
        try
        {
            xml = doc.CreateElement(TagNameOf(element));

            var nodeId = "n" + counter++;
            xml.SetAttribute(IdAttr, nodeId);
            elements[nodeId] = element;

            foreach (var (name, pid, isBool) in Attributes)
            {
                try { xml.SetAttribute(name, Sanitize(ReadLive(element, pid, isBool))); }
                catch { /* skip a single unreadable attribute */ }
            }

            try
            {
                var rid = element.GetRuntimeId();
                if (rid != null && rid.Length > 0) xml.SetAttribute("RuntimeId", string.Join(".", rid));
            }
            catch { }

            try
            {
                var r = element.CurrentBoundingRectangle;
                xml.SetAttribute("x", r.left.ToString());
                xml.SetAttribute("y", r.top.ToString());
                xml.SetAttribute("width", (r.right - r.left).ToString());
                xml.SetAttribute("height", (r.bottom - r.top).ToString());
            }
            catch { }

            var text = Sanitize(SafeName(element));
            if (text.Length > 0) xml.AppendChild(doc.CreateTextNode(text));
        }
        catch
        {
            return null;
        }

        try
        {
            var children = element.FindAll(TreeScope.Children, trueCond);
            var len = children?.Length ?? 0;

            if (perfSw != null)
            {
                perfSw.Stop();
                perf!.Record("uia.xpathModel.node", perfSw.Elapsed.TotalMilliseconds);
            }

            for (var i = 0; i < len; i++)
            {
                IUIAutomationElement child;
                try { child = children!.GetElement(i); }
                catch { continue; }
                var childXml = BuildElementLive(doc, child, trueCond, elements, ref counter, perf);
                if (childXml != null) xml.AppendChild(childXml);
            }
        }
        catch { }

        return xml;
    }

    private static string ReadLive(IUIAutomationElement el, int pid, bool isBool)
    {
        var v = el.GetCurrentPropertyValue(pid);
        if (isBool) return v is int i && i != 0 ? "true" : "false";
        return v as string ?? (v is int n ? n.ToString() : "");
    }

    private static string SafeName(IUIAutomationElement e)
    {
        try { return e.get_CurrentName() ?? ""; } catch { return ""; }
    }

    private static string TagNameOfCached(IUIAutomationElement element)
    {
        object? ctv;
        try { ctv = element.GetCachedPropertyValue(UIA.ControlTypePropertyId); } catch { ctv = null; }
        var ctId = ctv is int c ? c : 0;
        if (ConditionBuilder.ControlTypeNameById.TryGetValue(ctId, out var name)) return name;

        var localized = ReadCached(element, UIA.LocalizedControlTypePropertyId, false);
        var candidate = string.Concat(localized.Split(' ')
            .Where(w => w.Length > 0)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..].ToLowerInvariant()));
        return IsValidXmlName(candidate) ? candidate : "Custom";
    }

    private static string TagNameOf(IUIAutomationElement element)
    {
        int ctId;
        try { ctId = element.CurrentControlType; }
        catch { return "Custom"; }

        if (ConditionBuilder.ControlTypeNameById.TryGetValue(ctId, out var name))
        {
            return name;
        }

        // Unknown control type. Derive a PascalCase name from the localised
        // control type only as a last resort, falling back to "Custom" when the
        // result is not a valid XML element name (non-ASCII, spaces, empty).
        string localized;
        try { localized = element.get_CurrentLocalizedControlType() ?? ""; }
        catch { localized = ""; }

        var candidate = string.Concat(localized.Split(' ')
            .Where(w => w.Length > 0)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..].ToLowerInvariant()));

        return IsValidXmlName(candidate) ? candidate : "Custom";
    }

    private static bool IsValidXmlName(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        try { XmlConvert.VerifyName(s); return true; }
        catch { return false; }
    }

    private static string Sanitize(string s)
    {
        if (string.IsNullOrEmpty(s)) return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (ch == '\t' || ch == '\n' || ch == '\r' ||
                (ch >= 0x20 && ch <= 0xD7FF) ||
                (ch >= 0xE000 && ch <= 0xFFFD))
            {
                sb.Append(ch);
            }
        }
        return sb.ToString();
    }
}
