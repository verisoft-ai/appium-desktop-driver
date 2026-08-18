using System.Xml;

namespace NovaUIAutomationServer.DotNet;

/// <summary>
/// Reshapes a spliced-in bridge subtree to look like real UIA output: maps
/// each node's reflected ClassName to a UIA ControlType tag, emits the same
/// attribute set PageSourceCommands emits for real UIA elements, and flattens
/// pure-layout wrappers (Border/Grid/StackPanel/...) the way UIA's
/// IsControlElement filter would — instead of dumping the bridge's raw
/// visual-tree walk (every Border/ContentPresenter/etc.), which is what made
/// the tree structure change wholesale wherever the bridge was active.
/// </summary>
internal static class BridgeUiaShaper
{
    private static readonly (string Suffix, string ControlType)[] ClassSuffixMap =
    {
        ("PasswordBox", "Edit"),
        ("TextBox", "Edit"),
        ("TextBlock", "Text"),
        ("Label", "Text"),
        ("Button", "Button"),
        ("CheckBox", "CheckBox"),
        ("RadioButton", "RadioButton"),
        ("ComboBoxItem", "ListItem"),
        ("ComboBox", "ComboBox"),
        ("ListBoxItem", "ListItem"),
        ("ListViewItem", "ListItem"),
        ("ListBox", "List"),
        ("ListView", "List"),
        ("TreeViewItem", "TreeItem"),
        ("TreeView", "Tree"),
        ("TabItem", "TabItem"),
        ("TabControl", "Tab"),
        ("ProgressBar", "ProgressBar"),
        ("Slider", "Slider"),
        ("ScrollBar", "ScrollBar"),
        ("Image", "Image"),
        ("Hyperlink", "Hyperlink"),
        ("MenuItem", "MenuItem"),
        ("Menu", "Menu"),
        ("DataGridRow", "DataItem"),
        ("DataGridCell", "Custom"),
        ("DataGrid", "DataGrid"),
        ("GroupBox", "Group"),
        ("ToolTip", "ToolTip"),
        ("ToolBar", "ToolBar"),
        ("StatusBar", "StatusBar"),
    };

    // Pure-layout wrappers a real UIA control-view walk would never surface —
    // flattened away (their children get attached to the nearest emitted
    // ancestor) instead of emitted as a node, unless they carry a Name.
    private static readonly HashSet<string> LayoutWrapperClassNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Border", "Grid", "StackPanel", "DockPanel", "WrapPanel", "Canvas", "UniformGrid",
        "ContentPresenter", "ScrollViewer", "ScrollContentPresenter", "AdornerDecorator",
        "Decorator", "ItemsPresenter", "VirtualizingStackPanel", "Popup", "AdornerLayer", "Viewbox",
    };

    public static void BuildSplicedXml(BridgeAgentService bridge, BridgeAgentElement node, XmlDocument doc, XmlElement parent, int processId, int depth = 0)
    {
        if (depth > 100) return;
        try
        {
            var info = node.Info;
            var className = GetString(info, "ClassName") ?? "";
            var automationId = GetString(info, "AutomationId") ?? "";
            var name = GetString(info, "Name") ?? "";

            var attachTo = parent;
            if (IsContentWorthy(className, automationId, name))
            {
                var el = doc.CreateElement(GuessControlType(className));
                el.SetAttribute("AcceleratorKey", "");
                el.SetAttribute("AccessKey", "");
                el.SetAttribute("AutomationId", automationId);
                el.SetAttribute("ClassName", className);
                el.SetAttribute("FrameworkId", GetString(info, "FrameworkId") ?? "WPF");
                el.SetAttribute("HasKeyboardfocus", "False");
                el.SetAttribute("HelpText", GetString(info, "Description") ?? "");
                el.SetAttribute("IsContentelement", "True");
                el.SetAttribute("IsControlelement", "True");
                el.SetAttribute("IsEnabled", GetString(info, "IsEnabled") ?? "True");
                el.SetAttribute("IsKeyboardfocusable", "False");
                el.SetAttribute("IsOffscreen", GetString(info, "IsOffscreen") ?? "False");
                el.SetAttribute("IsPassword", "False");
                el.SetAttribute("IsRequiredforform", "False");
                el.SetAttribute("ItemStatus", "");
                el.SetAttribute("ItemType", "");
                el.SetAttribute("LocalizedControlType", GetString(info, "LocalizedControlType") ?? "");
                el.SetAttribute("Name", name);
                el.SetAttribute("Orientation", "None");
                el.SetAttribute("ProcessId", processId.ToString());
                el.SetAttribute("RuntimeId", node.Id);
                el.SetAttribute("x", GetString(info, "x") ?? "0");
                el.SetAttribute("y", GetString(info, "y") ?? "0");
                el.SetAttribute("width", GetString(info, "width") ?? "0");
                el.SetAttribute("height", GetString(info, "height") ?? "0");

                parent.AppendChild(el);
                attachTo = el;
            }

            foreach (var child in bridge.GetChildren(node))
            {
                BuildSplicedXml(bridge, child, doc, attachTo, processId, depth + 1);
            }
        }
        catch
        {
            // Match PageSourceCommands' per-element swallow — one flaky bridge
            // node can't abort the whole splice.
        }
    }

    private static bool IsContentWorthy(string className, string automationId, string name)
    {
        if (!string.IsNullOrEmpty(automationId)) return true;
        if (!string.IsNullOrEmpty(name) && !LayoutWrapperClassNames.Contains(className)) return true;
        return ClassSuffixMap.Any(m => className.EndsWith(m.Suffix, StringComparison.OrdinalIgnoreCase));
    }

    private static string GuessControlType(string className)
    {
        foreach (var (suffix, controlType) in ClassSuffixMap)
        {
            if (className.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)) return controlType;
        }
        return "Custom";
    }

    private static string? GetString(Dictionary<string, object?> info, string key)
    {
        foreach (var k in info.Keys)
        {
            if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
            {
                return info[k]?.ToString();
            }
        }
        return null;
    }
}
