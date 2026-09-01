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

        var model = UiaXmlModel.Build(state, root);

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

    // Attribute name -> reader. PascalCase keys match what getProperty returns and
    // what the page source exposes, so existing selectors keep working. XPath is
    // case-sensitive on attribute names; these are the canonical spellings.
    private static readonly (string Name, Func<IUIAutomationElement, string> Read)[] Attributes =
    {
        ("AcceleratorKey", e => e.get_CurrentAcceleratorKey() ?? ""),
        ("AccessKey", e => e.get_CurrentAccessKey() ?? ""),
        ("AutomationId", e => e.get_CurrentAutomationId() ?? ""),
        ("ClassName", e => e.get_CurrentClassName() ?? ""),
        ("FrameworkId", e => e.get_CurrentFrameworkId() ?? ""),
        ("HasKeyboardFocus", e => Bool(e.CurrentHasKeyboardFocus)),
        ("HelpText", e => e.get_CurrentHelpText() ?? ""),
        ("IsContentElement", e => Bool(e.CurrentIsContentElement)),
        ("IsControlElement", e => Bool(e.CurrentIsControlElement)),
        ("IsEnabled", e => Bool(e.CurrentIsEnabled)),
        ("IsKeyboardFocusable", e => Bool(e.CurrentIsKeyboardFocusable)),
        ("IsOffscreen", e => Bool(e.CurrentIsOffscreen)),
        ("IsPassword", e => Bool(e.CurrentIsPassword)),
        ("IsRequiredForForm", e => Bool(e.CurrentIsRequiredForForm)),
        ("ItemStatus", e => e.get_CurrentItemStatus() ?? ""),
        ("ItemType", e => e.get_CurrentItemType() ?? ""),
        ("LocalizedControlType", e => e.get_CurrentLocalizedControlType() ?? ""),
        ("Name", e => e.get_CurrentName() ?? ""),
        ("Orientation", e => e.CurrentOrientation.ToString()),
        ("ProcessId", e => e.CurrentProcessId.ToString()),
    };

    private static string Bool(int v) => v != 0 ? "true" : "false";

    public XmlDocument Document { get; }
    public Dictionary<string, IUIAutomationElement> Elements { get; }

    private UiaXmlModel(XmlDocument doc, Dictionary<string, IUIAutomationElement> elements)
    {
        Document = doc;
        Elements = elements;
    }

    /// <summary>
    /// The node built from <paramref name="contextElementId"/>, or null (evaluate
    /// from the document root) when no context was given / it is not in the tree.
    /// </summary>
    public XmlElement? ContextNode(string? contextElementId)
    {
        if (contextElementId == null) return null;
        var match = Elements.FirstOrDefault(kv => IdOf(kv.Value) == contextElementId).Key;
        if (match == null) return null;
        return Document.SelectSingleNode($"//*[@{IdAttr}='{match}']") as XmlElement;
    }

    private static string IdOf(IUIAutomationElement element)
    {
        try
        {
            var rid = element.GetRuntimeId();
            return rid == null || rid.Length == 0 ? "" : string.Join(".", rid);
        }
        catch { return ""; }
    }

    public static UiaXmlModel Build(SessionState state, IUIAutomationElement root)
    {
        var doc = new XmlDocument();
        var elements = new Dictionary<string, IUIAutomationElement>();
        var trueCond = state.Automation.CreateTrueCondition();
        int counter = 0;

        var rootXml = BuildElement(doc, root, trueCond, elements, ref counter)
            ?? doc.CreateElement("DummyRoot");
        doc.AppendChild(rootXml);

        return new UiaXmlModel(doc, elements);
    }

    private static XmlElement? BuildElement(
        XmlDocument doc,
        IUIAutomationElement element,
        IUIAutomationCondition trueCond,
        Dictionary<string, IUIAutomationElement> elements,
        ref int counter)
    {
        XmlElement xml;
        try
        {
            xml = doc.CreateElement(TagNameOf(element));

            var nodeId = "n" + counter++;
            xml.SetAttribute(IdAttr, nodeId);
            elements[nodeId] = element;

            foreach (var (name, read) in Attributes)
            {
                try { xml.SetAttribute(name, Sanitize(read(element))); }
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

            // text() ~ the element's Name, matching the old engine which mapped
            // text() to the element's Name/Value.
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
            for (var i = 0; i < len; i++)
            {
                IUIAutomationElement child;
                try { child = children!.GetElement(i); }
                catch { continue; }
                var childXml = BuildElement(doc, child, trueCond, elements, ref counter);
                if (childXml != null) xml.AppendChild(childXml);
            }
        }
        catch { }

        return xml;
    }

    private static string SafeName(IUIAutomationElement e)
    {
        try { return e.get_CurrentName() ?? ""; } catch { return ""; }
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
