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
    private JabMessageThread? _jabThread;

    private readonly Dictionary<string, JabElement> _elements = new();
    private readonly object _elementsLock = new();

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
        ["tree item"]      = "TreeItem",
        ["tool bar"]       = "ToolBar",
        ["tool tip"]       = "ToolTip",
        ["option pane"]    = "Pane",
        ["internal frame"] = "Window",
        ["desktop icon"]   = "Button",
        ["canvas"]         = "Custom",
        ["separator"]      = "Separator",
        ["unknown"]        = "Custom",
    };

    private static readonly Dictionary<string, string[]> ControlTypeToRoles =
        RoleToControlType
            .GroupBy(kv => kv.Value, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Select(kv => kv.Key).ToArray(), StringComparer.OrdinalIgnoreCase);

    public bool IsAvailable => _available;

    // ── Initialization ─────────────────────────────────────────────────────────

    /// <summary>
    /// Starts the dedicated JAB message-pump thread and initializes the Windows Access Bridge.
    /// Must be called once before any other method.
    /// </summary>
    public bool TryInitialize()
    {
        if (_initialized) return _available;
        _initialized = true;
        try
        {
            _jabThread = new JabMessageThread();
            _jabThread.Start(); // calls Windows_run() on STA thread with message pump
            _available = true;
        }
        catch (DllNotFoundException)
        {
            _jabThread = null;
            _available = false;
        }
        catch
        {
            _jabThread = null;
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

    // ── Window detection ───────────────────────────────────────────────────────

    public bool IsJavaWindow(IntPtr hwnd)
    {
        if (!_available || _jabThread == null) return false;
        try { return _jabThread.Invoke(() => JabNative.IsJavaWindow(hwnd)); }
        catch { return false; }
    }

    // ── Element retrieval ──────────────────────────────────────────────────────

    /// <summary>Gets the JAB root element for a Java window HWND.</summary>
    public JabElement? GetWindowRoot(IntPtr hwnd)
    {
        ThrowIfUnavailable();
        return _jabThread!.Invoke(() => GetWindowRootOnThread(hwnd));
    }

    private JabElement? GetWindowRootOnThread(IntPtr hwnd)
    {
        if (!JabNative.GetAccessibleContextFromHWND(hwnd, out var vmid, out var ac))
            return null;
        return GetOrFetchOnThread(vmid, ac);
    }

    public JabElement? GetOrFetch(int vmid, long ac)
    {
        if (ac == 0) return null;
        var id = JabElement.MakeId(vmid, ac);
        lock (_elementsLock)
        {
            if (_elements.TryGetValue(id, out var cached)) return cached;
        }
        return _jabThread!.Invoke(() => GetOrFetchOnThread(vmid, ac));
    }

    private JabElement? GetOrFetchOnThread(int vmid, long ac)
    {
        if (ac == 0) return null;
        var id = JabElement.MakeId(vmid, ac);
        lock (_elementsLock)
        {
            if (_elements.TryGetValue(id, out var cached)) return cached;
        }

        var info = new JabNative.AccessibleContextInfo();
        if (!JabNative.GetAccessibleContextInfo(vmid, ac, info)) return null;

        var el = new JabElement(vmid, ac, info);
        lock (_elementsLock)
        {
            _elements[id] = el;
        }
        return el;
    }

    public JabElement GetById(string id)
    {
        lock (_elementsLock)
        {
            if (_elements.TryGetValue(id, out var el)) return el;
        }
        if (!JabElement.TryParseId(id, out var vmid, out var ac))
            throw new KeyNotFoundException($"JAB element not found: {id}");
        var fetched = _jabThread!.Invoke(() => GetOrFetchOnThread(vmid, ac))
            ?? throw new KeyNotFoundException($"JAB element could not be fetched: {id}");
        return fetched;
    }

    public string Save(JabElement el)
    {
        lock (_elementsLock)
        {
            _elements[el.Id] = el;
        }
        return el.Id;
    }

    // ── Find ──────────────────────────────────────────────────────────────────

    public string? FindFirst(JabElement root, ConditionDto condition, string scope)
    {
        var predicate = BuildPredicate(condition);
        return _jabThread!.Invoke(() => FindFirstOnThread(root, predicate, scope));
    }

    public string[] FindAll(JabElement root, ConditionDto condition, string scope)
    {
        var predicate = BuildPredicate(condition);
        return _jabThread!.Invoke(() => FindAllOnThread(root, predicate, scope));
    }

    private string? FindFirstOnThread(JabElement root, Func<JabElement, bool> predicate, string scope)
    {
        return scope.ToLowerInvariant() switch
        {
            "element" => predicate(root) ? Save(root) : null,
            "children" => FindFirstChildrenOnThread(root, predicate),
            "descendants" or "subtree" => FindFirstRecursiveOnThread(root, predicate, scope == "subtree", 0),
            _ => null,
        };
    }

    private string[] FindAllOnThread(JabElement root, Func<JabElement, bool> predicate, string scope)
    {
        return scope.ToLowerInvariant() switch
        {
            "element" => predicate(root) ? new[] { Save(root) } : Array.Empty<string>(),
            "children" => FindAllChildrenOnThread(root, predicate),
            "descendants" or "subtree" => FindAllRecursiveOnThread(root, predicate, scope == "subtree", 0),
            _ => Array.Empty<string>(),
        };
    }

    private string? FindFirstChildrenOnThread(JabElement node, Func<JabElement, bool> predicate)
    {
        var count = node.Info.childrenCount;
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetchOnThread(node.VmId, childAc);
            if (child != null && predicate(child)) return Save(child);
        }
        return null;
    }

    private string[] FindAllChildrenOnThread(JabElement node, Func<JabElement, bool> predicate)
    {
        var results = new List<string>();
        var count = node.Info.childrenCount;
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetchOnThread(node.VmId, childAc);
            if (child != null && predicate(child)) results.Add(Save(child));
        }
        return results.ToArray();
    }

    private string? FindFirstRecursiveOnThread(JabElement node, Func<JabElement, bool> predicate, bool includeSelf, int depth)
    {
        if (depth > 100) return null;
        if (includeSelf && predicate(node)) return Save(node);

        var count = node.Info.childrenCount;
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetchOnThread(node.VmId, childAc);
            if (child == null) continue;
            if (predicate(child)) return Save(child);
            var found = FindFirstRecursiveOnThread(child, predicate, false, depth + 1);
            if (found != null) return found;
        }
        return null;
    }

    private string[] FindAllRecursiveOnThread(JabElement node, Func<JabElement, bool> predicate, bool includeSelf, int depth)
    {
        if (depth > 100) return Array.Empty<string>();
        var results = new List<string>();
        if (includeSelf && predicate(node)) results.Add(Save(node));

        var count = node.Info.childrenCount;
        for (var i = 0; i < count; i++)
        {
            var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
            if (childAc == 0) continue;
            var child = GetOrFetchOnThread(node.VmId, childAc);
            if (child == null) continue;
            if (predicate(child)) results.Add(Save(child));
            results.AddRange(FindAllRecursiveOnThread(child, predicate, false, depth + 1));
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
                   || string.Equals(el.Info.role, value, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(NormalizeTagName(el.Info.role_en_US ?? ""), value, StringComparison.OrdinalIgnoreCase),
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
        if (ControlTypeToRoles.TryGetValue(controlTypeName, out var roles))
        {
            return el => roles.Any(r => string.Equals(el.Info.role_en_US, r, StringComparison.OrdinalIgnoreCase));
        }
        return el => string.Equals(el.Info.role_en_US, controlTypeName, StringComparison.OrdinalIgnoreCase)
                  || string.Equals(el.Info.role, controlTypeName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool ParseBool(string value) =>
        value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1";

    private static string ExtractStringValue(JsonElement? element)
    {
        if (element == null) return "";
        return element.Value.ValueKind switch
        {
            JsonValueKind.String => element.Value.GetString() ?? "",
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Number => element.Value.GetRawText(),
            _ => element.Value.GetRawText(),
        };
    }

    // ── Live info refresh ─────────────────────────────────────────────────────

    /// <summary>
    /// Re-fetches AccessibleContextInfo for the element via JAB, bypassing the cached Info.
    /// Used for state-dependent reads (checked, selected, focused) that change after interaction.
    /// </summary>
    public JabNative.AccessibleContextInfo? GetFreshInfo(JabElement el)
    {
        return _jabThread!.Invoke(() =>
        {
            var info = new JabNative.AccessibleContextInfo();
            return JabNative.GetAccessibleContextInfo(el.VmId, el.Ac, info) ? info : null;
        });
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
            "clickablepoint" => new
            {
                x = el.Info.x + el.Info.width / 2.0,
                y = el.Info.y + el.Info.height / 2.0,
            },
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
        // For editable text elements always return AccessibleText content (empty string on JNI
        // failure) — never fall through to Info.name, which is the field's label, not its value.
        if (el.Info.accessibleText != 0)
            return GetTextContent(el) ?? "";
        if (!string.IsNullOrEmpty(el.Info.name)) return el.Info.name;
        if (!string.IsNullOrEmpty(el.Info.description)) return el.Info.description;
        return "";
    }

    public string? GetTextContent(JabElement el)
    {
        if (el.Info.accessibleText == 0) return null;
        return _jabThread!.Invoke(() => GetTextContentOnThread(el));
    }

    private string? GetTextContentOnThread(JabElement el)
    {
        if (!JabNative.GetAccessibleTextInfo(el.VmId, el.Ac, out var info, 0, 0))
            return null;
        if (info.charCount <= 0)
            return "";
        var len = (short)Math.Min(info.charCount + 1, 4096);
        var sb = new System.Text.StringBuilder(len);
        // Cap end so that end-start+1 <= len-1 (len includes null terminator slot).
        var end = Math.Min(info.charCount - 1, len - 2);
        if (!JabNative.GetAccessibleTextRange(el.VmId, el.Ac, 0, end, sb, len))
            return null;
        return sb.ToString();
    }

    // ── Interaction ────────────────────────────────────────────────────────────

    public void Invoke(JabElement el)
    {
        ThrowIfUnavailable();
        _jabThread!.Invoke(() => InvokeOnThread(el));
    }

    private void InvokeOnThread(JabElement el)
    {
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
        _jabThread!.Invoke(() => SetValueOnThread(el, value));
    }

    private void SetValueOnThread(JabElement el, string value)
    {
        if (el.Info.accessibleText == 0)
            throw new InvalidOperationException("JAB element does not support text input (accessibleText=0).");
        if (!JabNative.SetTextContents(el.VmId, el.Ac, value))
            throw new InvalidOperationException("JAB SetTextContents failed.");
    }

    // ── Page source XML ────────────────────────────────────────────────────────

    public void BuildXml(JabElement node, XmlDocument doc, XmlElement? parent, int depth = 0)
    {
        _jabThread!.Invoke(() => BuildXmlOnThread(node, doc, parent, depth));
    }

    private void BuildXmlOnThread(JabElement node, XmlDocument doc, XmlElement? parent, int depth = 0)
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

            var count = node.Info.childrenCount;
            for (var i = 0; i < count; i++)
            {
                var childAc = JabNative.GetAccessibleChildFromContext(node.VmId, node.Ac, i);
                if (childAc == 0) continue;
                var child = GetOrFetchOnThread(node.VmId, childAc);
                if (child != null) BuildXmlOnThread(child, doc, el, depth + 1);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[JAB] BuildXml error at depth {depth}: {ex.Message}");
        }
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
        if (_available && _jabThread != null)
        {
            try
            {
                _jabThread.Invoke(() =>
                {
                    lock (_elementsLock)
                    {
                        foreach (var el in _elements.Values)
                        {
                            try { JabNative.ReleaseJavaObject(el.VmId, el.Ac); }
                            catch { }
                        }
                    }
                });
            }
            catch { }
        }

        lock (_elementsLock)
        {
            _elements.Clear();
        }

        _jabThread?.Dispose();
        _jabThread = null;
    }
}
