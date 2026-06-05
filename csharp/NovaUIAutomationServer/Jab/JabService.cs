using System.Text;
using System.Text.Json;
using System.Xml;
using NovaUIAutomationServer.Protocol;

namespace NovaUIAutomationServer.Jab;

/// <summary>
/// Manages Java Access Bridge state and provides element discovery / interaction
/// for Java Swing / AWT applications invisible to Windows UI Automation.
/// </summary>
internal sealed class JabService : IDisposable
{
    private bool _initialized;
    private bool _available;

    private readonly Dictionary<string, JabElement> _elements = new();

    // JAB role_en_US → UIA ControlType name (subset, for XPath condition mapping)
    private static readonly Dictionary<string, string> RoleToControlType = new(StringComparer.OrdinalIgnoreCase)
    {
        ["push button"]    = "Button",
        ["toggle button"]  = "Button",
        ["check box"]      = "CheckBox",
        ["combo box"]      = "ComboBox",
        ["dialog"]         = "Window",
        ["frame"]          = "Window",
        ["window"]         = "Window",
        ["label"]          = "Text",
        ["text"]           = "Edit",
        ["password text"]  = "Edit",
        ["list"]           = "List",
        ["list item"]      = "ListItem",
        ["menu"]           = "Menu",
        ["menu bar"]       = "MenuBar",
        ["menu item"]      = "MenuItem",
        ["panel"]          = "Pane",
        ["root pane"]      = "Pane",
        ["layered pane"]   = "Pane",
        ["glass pane"]     = "Pane",
        ["scroll pane"]    = "Pane",
        ["viewport"]       = "Pane",
        ["progress bar"]   = "ProgressBar",
        ["radio button"]   = "RadioButton",
        ["scroll bar"]     = "ScrollBar",
        ["slider"]         = "Slider",
        ["spin box"]       = "Spinner",
        ["split pane"]     = "Pane",
        ["tabbed pane"]    = "Tab",
        ["page tab"]       = "TabItem",
        ["page tab list"]  = "Tab",
        ["table"]          = "Table",
        ["tree"]           = "Tree",
        ["tree item"]      = "TreeItem",  // non-standard, common in practice
        ["tool bar"]       = "ToolBar",
        ["tool tip"]       = "ToolTip",
        ["option pane"]    = "Pane",
        ["internal frame"] = "Window",
        ["desktop icon"]   = "Button",
        ["canvas"]         = "Custom",
        ["separator"]      = "Separator",
        ["unknown"]        = "Custom",
    };

    // UIA ControlType name → JAB role_en_US list (one-to-many)
    private static readonly Dictionary<string, string[]> ControlTypeToRoles =
        RoleToControlType
            .GroupBy(kv => kv.Value, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Select(kv => kv.Key).ToArray(), StringComparer.OrdinalIgnoreCase);

    public bool IsAvailable => _available;

    /// <summary>Loads and initializes the Java Access Bridge DLL.</summary>
    public bool TryInitialize()
    {
        if (_initialized) return _available;
        _initialized = true;
        try
        {
            JabNative.Windows_run();
            _available = true;
        }
        catch (DllNotFoundException)
        {
            _available = false;
        }
        catch
        {
            _available = false;
        }
        return _available;
    }

    public void ThrowIfUnavailable()
    {
        if (!_available)
            throw new InvalidOperationException(
                "Java Access Bridge is not available. Ensure a 64-bit JRE is installed and 'jabswitch -enable' has been run.");
    }

    public bool IsJavaWindow(IntPtr hwnd)
    {
        if (!_available) return false;
        try { return JabNative.IsJavaWindow(hwnd); }
        catch { return false; }
    }

    /// <summary>Gets the JAB root element for a Java window HWND.</summary>
    public JabElement? GetWindowRoot(IntPtr hwnd)
    {
        ThrowIfUnavailable();
        if (!JabNative.GetAccessibleContextFromHWND(hwnd, out var vmid, out var ac))
            return null;
        return GetOrFetch(vmid, ac);
    }

    public JabElement? GetOrFetch(int vmid, long ac)
    {
        if (ac == 0) return null;
        var id = JabElement.MakeId(vmid, ac);
        if (_elements.TryGetValue(id, out var cached)) return cached;

        var info = new JabNative.AccessibleContextInfo();
        if (!JabNative.GetAccessibleContextInfo(vmid, ac, info)) return null;

        var el = new JabElement(vmid, ac, info);
        _elements[id] = el;
        return el;
    }

    public JabElement GetById(string id)
    {
        if (_elements.TryGetValue(id, out var el)) return el;
        if (!JabElement.TryParseId(id, out var vmid, out var ac))
            throw new KeyNotFoundException($"JAB element not found: {id}");
        var fetched = GetOrFetch(vmid, ac)
            ?? throw new KeyNotFoundException($"JAB element could not be fetched: {id}");
        return fetched;
    }

    public string Save(JabElement el)
    {
        _elements[el.Id] = el;
        return el.Id;
    }

    // ── Find ──────────────────────────────────────────────────────────────────

    public string? FindFirst(JabElement root, ConditionDto condition, string scope)
    {
        var predicate = BuildPredicate(condition);
        return scope.ToLowerInvariant() switch
        {
            "element" => predicate(root) ? Save(root) : null,
            "children" => FindFirstChildren(root, predicate),
            "descendants" or "subtree" => FindFirstRecursive(root, predicate, scope == "subtree", 0),
            _ => null,
        };
    }

    public string[] FindAll(JabElement root, ConditionDto condition, string scope)
    {
        var predicate = BuildPredicate(condition);
        return scope.ToLowerInvariant() switch
        {
            "element" => predicate(root) ? new[] { Save(root) } : Array.Empty<string>(),
            "children" => FindAllChildren(root, predicate),
            "descendants" or "subtree" => FindAllRecursive(root, predicate, scope == "subtree", 0),
            _ => Array.Empty<string>(),
        };
    }

    private string? FindFirstChildren(JabElement node, Func<JabElement, bool> predicate)
    {
        var count = Math.Min(node.Info.childrenCount, 256);
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetch(node.VmId, childAc);
            if (child != null && predicate(child)) return Save(child);
        }
        return null;
    }

    private string[] FindAllChildren(JabElement node, Func<JabElement, bool> predicate)
    {
        var results = new List<string>();
        var count = Math.Min(node.Info.childrenCount, 256);
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetch(node.VmId, childAc);
            if (child != null && predicate(child)) results.Add(Save(child));
        }
        return results.ToArray();
    }

    private string? FindFirstRecursive(JabElement node, Func<JabElement, bool> predicate, bool includeSelf, int depth)
    {
        if (depth > 100) return null;
        if (includeSelf && predicate(node)) return Save(node);

        var count = Math.Min(node.Info.childrenCount, 256);
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetch(node.VmId, childAc);
            if (child == null) continue;
            if (predicate(child)) return Save(child);
            var found = FindFirstRecursive(child, predicate, false, depth + 1);
            if (found != null) return found;
        }
        return null;
    }

    private string[] FindAllRecursive(JabElement node, Func<JabElement, bool> predicate, bool includeSelf, int depth)
    {
        if (depth > 100) return Array.Empty<string>();
        var results = new List<string>();
        if (includeSelf && predicate(node)) results.Add(Save(node));

        var count = Math.Min(node.Info.childrenCount, 256);
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetch(node.VmId, childAc);
            if (child == null) continue;
            if (predicate(child)) results.Add(Save(child));
            results.AddRange(FindAllRecursive(child, predicate, false, depth + 1));
        }
        return results.ToArray();
    }

    // ── Condition → Predicate ─────────────────────────────────────────────────

    private Func<JabElement, bool> BuildPredicate(ConditionDto condition)
    {
        return condition.Type switch
        {
            "true" => _ => true,
            "false" => _ => false,
            "not" => condition.Condition != null
                ? el => !BuildPredicate(condition.Condition)(el)
                : (_ => true),
            "and" => condition.Conditions != null && condition.Conditions.Length > 0
                ? el => condition.Conditions.All(c => BuildPredicate(c)(el))
                : (_ => true),
            "or" => condition.Conditions != null && condition.Conditions.Length > 0
                ? el => condition.Conditions.Any(c => BuildPredicate(c)(el))
                : (_ => false),
            "property" => BuildPropertyPredicate(condition),
            _ => _ => false,
        };
    }

    private Func<JabElement, bool> BuildPropertyPredicate(ConditionDto condition)
    {
        var prop = condition.Property ?? "";
        var value = ExtractStringValue(condition.Value);

        return prop.ToLowerInvariant() switch
        {
            "name" => el => string.Equals(el.Info.name, value, StringComparison.Ordinal),
            "automationid" => el => string.Equals(el.Info.name, value, StringComparison.Ordinal),
            "classname" =>
                el => string.Equals(el.Info.role_en_US, value, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(el.Info.role, value, StringComparison.OrdinalIgnoreCase),
            "controltype" => BuildControlTypePredicate(value),
            "localizedcontroltype" =>
                el => string.Equals(el.Info.role, value, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(el.Info.role_en_US, value, StringComparison.OrdinalIgnoreCase),
            "isenabled" =>
                el => (el.Info.states?.Contains("enabled", StringComparison.OrdinalIgnoreCase) ?? false)
                      == ParseBool(value),
            "isoffscreen" =>
                el => !(el.Info.states?.Contains("showing", StringComparison.OrdinalIgnoreCase) ?? false)
                      == ParseBool(value),
            _ => _ => false,
        };
    }

    private Func<JabElement, bool> BuildControlTypePredicate(string controlTypeName)
    {
        // value may be the UIA integer ID or the programmatic name (e.g. "Button" or "50000")
        // Try to map from ControlType name to JAB roles
        if (ControlTypeToRoles.TryGetValue(controlTypeName, out var roles))
        {
            return el => roles.Any(r => string.Equals(el.Info.role_en_US, r, StringComparison.OrdinalIgnoreCase));
        }
        // Fallback: compare directly against role_en_US / role
        return el => string.Equals(el.Info.role_en_US, controlTypeName, StringComparison.OrdinalIgnoreCase)
                  || string.Equals(el.Info.role, controlTypeName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool ParseBool(string value) =>
        value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1";

    private static string ExtractStringValue(System.Text.Json.JsonElement? element)
    {
        if (element == null) return "";
        return element.Value.ValueKind switch
        {
            System.Text.Json.JsonValueKind.String => element.Value.GetString() ?? "",
            System.Text.Json.JsonValueKind.True => "true",
            System.Text.Json.JsonValueKind.False => "false",
            System.Text.Json.JsonValueKind.Number => element.Value.GetRawText(),
            _ => element.Value.GetRawText(),
        };
    }

    // ── Property access ────────────────────────────────────────────────────────

    public object? GetProperty(JabElement el, string property)
    {
        return property.ToLowerInvariant() switch
        {
            "name" => el.Info.name ?? "",
            "automationid" => el.Info.name ?? "",
            "classname" => el.Info.role_en_US ?? "",
            "controltype" => RoleToControlType.TryGetValue(el.Info.role_en_US ?? "", out var ct) ? ct : el.Info.role_en_US ?? "",
            "localizedcontroltype" => el.Info.role ?? "",
            "helptext" => el.Info.description ?? "",
            "isenabled" => el.Info.states?.Contains("enabled", StringComparison.OrdinalIgnoreCase) ?? false,
            "isoffscreen" => !(el.Info.states?.Contains("showing", StringComparison.OrdinalIgnoreCase) ?? false),
            "iscontrolement" => true,
            "iscontentelement" => true,
            "iskeyboardfocusable" => el.Info.states?.Contains("focusable", StringComparison.OrdinalIgnoreCase) ?? false,
            "haskeyboardfocus" => el.Info.states?.Contains("focused", StringComparison.OrdinalIgnoreCase) ?? false,
            "runtimeid" => el.Id,
            "nativewindowhandle" => 0,
            "processid" => 0,
            "boundingRectangle" or "boundingrectangle" => new
            {
                x = (double)el.Info.x,
                y = (double)el.Info.y,
                width = (double)el.Info.width,
                height = (double)el.Info.height,
            },
            _ => "",
        };
    }

    public object GetRect(JabElement el) => new
    {
        x = (double)el.Info.x,
        y = (double)el.Info.y,
        width = (double)el.Info.width,
        height = (double)el.Info.height,
    };

    public string GetTagName(JabElement el)
    {
        var role = el.Info.role_en_US;
        if (RoleToControlType.TryGetValue(role ?? "", out var ct)) return ct;
        return NormalizeTagName(role ?? el.Info.role ?? "element");
    }

    public string GetText(JabElement el)
    {
        if (!string.IsNullOrEmpty(el.Info.name)) return el.Info.name;
        if (!string.IsNullOrEmpty(el.Info.description)) return el.Info.description;
        return "";
    }

    // ── Interaction ────────────────────────────────────────────────────────────

    public void Invoke(JabElement el)
    {
        ThrowIfUnavailable();
        var actions = new JabNative.AccessibleActions();
        if (!JabNative.GetAccessibleActions(el.VmId, el.Ac, actions) || actions.actionsCount == 0)
            throw new InvalidOperationException("JAB element has no accessible actions.");

        var todo = new JabNative.AccessibleActionsToDo
        {
            actionsCount = 1,
            actions = new JabNative.AccessibleActionInfo[32],
        };
        todo.actions[0] = actions.actionInfo[0];

        if (!JabNative.DoAccessibleActions(el.VmId, el.Ac, ref todo, out var failure))
            throw new InvalidOperationException($"JAB DoAccessibleActions failed (failure={failure}).");
    }

    public void SetValue(JabElement el, string value)
    {
        ThrowIfUnavailable();
        if (el.Info.accessibleText == 0)
            throw new InvalidOperationException("JAB element does not support text input (accessibleText=0).");
        if (!JabNative.SetTextContents(el.VmId, el.Ac, value))
            throw new InvalidOperationException("JAB SetTextContents failed.");
    }

    // ── Page source XML ────────────────────────────────────────────────────────

    public void BuildXml(JabElement node, XmlDocument doc, XmlElement? parent, int depth = 0)
    {
        if (depth > 100) return;
        try
        {
            var tagName = NormalizeTagName(
                !string.IsNullOrEmpty(node.Info.role_en_US) ? node.Info.role_en_US :
                !string.IsNullOrEmpty(node.Info.role) ? node.Info.role : "element");

            var el = doc.CreateElement(tagName);
            el.SetAttribute("Name", node.Info.name ?? "");
            el.SetAttribute("AutomationId", node.Info.name ?? "");
            el.SetAttribute("ClassName", node.Info.role_en_US ?? "");
            el.SetAttribute("LocalizedControlType", node.Info.role ?? "");
            el.SetAttribute("HelpText", node.Info.description ?? "");
            el.SetAttribute("States", node.Info.states ?? "");
            el.SetAttribute("x", node.Info.x.ToString());
            el.SetAttribute("y", node.Info.y.ToString());
            el.SetAttribute("width", node.Info.width.ToString());
            el.SetAttribute("height", node.Info.height.ToString());
            el.SetAttribute("IsEnabled", (node.Info.states?.Contains("enabled", StringComparison.OrdinalIgnoreCase) ?? false).ToString());
            el.SetAttribute("IsOffscreen", (!(node.Info.states?.Contains("showing", StringComparison.OrdinalIgnoreCase) ?? false)).ToString());
            el.SetAttribute("RuntimeId", node.Id);

            if (parent == null) doc.AppendChild(el);
            else parent.AppendChild(el);

            var count = Math.Min(node.Info.childrenCount, 256);
            for (var i = 0; i < count; i++)
            {
                var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
                if (childAc == 0) continue;
                var child = GetOrFetch(node.VmId, childAc);
                if (child != null) BuildXml(child, doc, el, depth + 1);
            }
        }
        catch { /* swallow per-element errors */ }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static string NormalizeTagName(string role)
    {
        if (string.IsNullOrWhiteSpace(role)) return "Element";
        var parts = role.Split(' ', '-', '_');
        var sb = new StringBuilder();
        foreach (var p in parts)
            if (p.Length > 0)
                sb.Append(char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant());
        var result = sb.ToString();
        if (result.Length == 0 || !char.IsLetter(result[0])) result = "E" + result;
        return result;
    }

    public void Dispose()
    {
        if (_available)
        {
            foreach (var el in _elements.Values)
            {
                try { JabNative.ReleaseJavaObject(el.VmId, el.Ac); }
                catch { /* best effort */ }
            }
        }
        _elements.Clear();
    }
}
