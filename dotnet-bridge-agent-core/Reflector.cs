using System.Reflection;
using System.Windows;
using System.Windows.Forms;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace AppiumDotNetBridgeCore;

/// <summary>
/// Reflection over WinForms / WPF trees, plus a best-effort DevExpress adapter — direct C# port
/// of BridgeAgent.cpp's Reflector ref class. See that file for the original comments explaining
/// each DevExpress/owner-draw convention; kept terse here to avoid duplicating the same essay
/// twice across the Framework and CoreCLR agents.
/// </summary>
internal static class Reflector
{
    public static Control? FindUiThreadControl(object target)
    {
        if (target is Control ctrl) return ctrl;
        if (target is ListItemHandle item) return item.Owner as Control;
        if (target is TreeNodeHandle node) return node.Owner as Control;
        if (target is GridRowHandle row) return GridControlOf(row.View);
        if (target is GridCellHandle cell) return GridControlOf(cell.View);
        return null;
    }

    public static Dispatcher? FindWpfDispatcher(object target)
    {
        DependencyObject? dep = target as DependencyObject;
        if (dep == null)
        {
            if (target is ListItemHandle item) dep = item.Owner as DependencyObject;
            else if (target is TreeNodeHandle node) dep = node.Owner as DependencyObject;
        }
        if (dep == null) return null;

        try { return dep.Dispatcher; }
        catch (Exception) { return null; }
    }

    public static object? GetWindowRoot(long hwndValue)
    {
        IntPtr hwnd = new(hwndValue);

        Control? ctrl = Control.FromHandle(hwnd);
        if (ctrl != null) return ctrl;

        try
        {
            var source = HwndSource.FromHwnd(hwnd);
            if (source != null) return source.RootVisual;
        }
        catch (Exception) { /* not a WPF window either */ }

        return null;
    }

    public static List<object> GetChildren(object target)
    {
        var result = new List<object>();

        var rowsFromGrid = TryGetDevExpressGridRows(target);
        if (rowsFromGrid != null) return rowsFromGrid;
        if (target is GridRowHandle row) return GetDevExpressGridCells(row);
        var listItems = TryGetOwnerDrawListItems(target);
        if (listItems != null) return listItems;
        var rootNodes = TryGetTreeRootNodes(target);
        if (rootNodes != null) return rootNodes;
        if (target is TreeNodeHandle node) return GetTreeNodeChildren(node);
        var treeListRoots = TryGetDevExpressTreeListRoots(target);
        if (treeListRoots != null) return treeListRoots;
        if (target is DevExpressTreeListNodeHandle treeListNode) return GetDevExpressTreeListNodeChildren(treeListNode);
        var comboItems = TryGetDevExpressComboItems(target);
        if (comboItems != null) return comboItems;
        var tokens = TryGetDevExpressTokens(target);
        if (tokens != null) return tokens;

        if (target is Control winformsCtrl)
        {
            foreach (Control child in winformsCtrl.Controls)
                result.Add(child);
            return result;
        }
        if (target is DependencyObject dep)
        {
            int count = VisualTreeHelper.GetChildrenCount(dep);
            for (int i = 0; i < count; i++)
                result.Add(VisualTreeHelper.GetChild(dep, i));
            return result;
        }
        return result;
    }

    public static Dictionary<string, object?> BuildInfo(object? target)
    {
        var info = new Dictionary<string, object?>();
        if (target == null) return info;

        if (target is GridRowHandle row)
        {
            bool isGroupRow = false;
            try
            {
                var isGroupRowMethod = row.View.GetType().GetMethod("IsGroupRow", new[] { typeof(int) });
                if (isGroupRowMethod != null)
                    isGroupRow = (bool)isGroupRowMethod.Invoke(row.View, new object[] { row.RowHandle })!;
            }
            catch (Exception) { /* best-effort — treat as a data row */ }

            if (isGroupRow)
            {
                info["ClassName"] = "GridGroupRow";
                info["LocalizedControlType"] = "GridGroupRow";
                info["AutomationId"] = "";
                info["Description"] = "";
                info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
                info["IsEnabled"] = true;
                info["IsOffscreen"] = false;
                info["IsGroupRow"] = true;

                string groupValue = "";
                int childCount = 0;
                try
                {
                    var getGroupRowValueMethod = row.View.GetType().GetMethod("GetGroupRowValue", new[] { typeof(int) });
                    object? val = getGroupRowValueMethod?.Invoke(row.View, new object[] { row.RowHandle });
                    groupValue = val?.ToString() ?? "";

                    var getChildRowCountMethod = row.View.GetType().GetMethod("GetChildRowCount", new[] { typeof(int) });
                    if (getChildRowCountMethod != null)
                        childCount = (int)getChildRowCountMethod.Invoke(row.View, new object[] { row.RowHandle })!;
                }
                catch (Exception) { /* best-effort */ }

                info["Value"] = groupValue;
                info["Name"] = $"{groupValue} ({childCount} items)";
                return info;
            }

            info["ClassName"] = "GridRow";
            info["LocalizedControlType"] = "GridRow";
            info["Name"] = $"Row {row.RowHandle + 1}";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            bool isSelected = false;
            try
            {
                var focusedRowHandleProp = row.View.GetType().GetProperty("FocusedRowHandle");
                if (focusedRowHandleProp != null)
                {
                    int focused = (int)focusedRowHandleProp.GetValue(row.View)!;
                    isSelected = focused == row.RowHandle;
                }
            }
            catch (Exception) { /* best-effort — leave isSelected false */ }
            info["IsSelected"] = isSelected;
            return info;
        }
        if (target is GridCellHandle cell)
        {
            info["ClassName"] = "GridCell";
            info["LocalizedControlType"] = "GridCell";
            info["Name"] = $"{cell.Caption} row {cell.RowHandle + 1}";
            info["AutomationId"] = cell.FieldName;
            info["Description"] = "";
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            object? value = GetDevExpressRowCellValue(cell.View, cell.RowHandle, cell.Column);
            info["Value"] = value?.ToString() ?? "";
            return info;
        }
        if (target is ListItemHandle item)
        {
            var ownerType = item.Owner.GetType();
            info["ClassName"] = "BridgeListItem";
            info["LocalizedControlType"] = "BridgeListItem";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;

            var getItemTextMethod = ownerType.GetMethod("GetItemText", new[] { typeof(int) });
            string text = getItemTextMethod != null
                ? (string)getItemTextMethod.Invoke(item.Owner, new object[] { item.Index })!
                : "";
            info["Name"] = text;
            info["Value"] = text;

            bool isSelected = false;
            var selectedIndexProp = ownerType.GetProperty("SelectedIndex");
            if (selectedIndexProp != null)
            {
                try
                {
                    int selected = (int)selectedIndexProp.GetValue(item.Owner)!;
                    isSelected = selected == item.Index;
                }
                catch (Exception) { /* best-effort — leave isSelected false */ }
            }
            info["IsSelected"] = isSelected;

            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;
            var getItemBoundsMethod = ownerType.GetMethod("GetItemBounds", new[] { typeof(int) });
            var ownerCtrl = item.Owner as Control;
            if (getItemBoundsMethod != null && ownerCtrl != null)
            {
                try
                {
                    object? boundsObj = getItemBoundsMethod.Invoke(item.Owner, new object[] { item.Index });
                    var bounds = (System.Drawing.Rectangle)boundsObj!;
                    System.Drawing.Point screenTopLeft = ownerCtrl.PointToScreen(new System.Drawing.Point(bounds.X, bounds.Y));
                    info["x"] = (double)screenTopLeft.X;
                    info["y"] = (double)screenTopLeft.Y;
                    info["width"] = (double)bounds.Width;
                    info["height"] = (double)bounds.Height;
                }
                catch (Exception) { /* best-effort — leave 0,0,0,0 */ }
            }
            return info;
        }
        if (target is TreeNodeHandle treeNode)
        {
            var ownerType = treeNode.Owner.GetType();
            info["ClassName"] = "BridgeTreeNode";
            info["LocalizedControlType"] = "BridgeTreeNode";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;

            var getNodeTextMethod = ownerType.GetMethod("GetNodeText", new[] { typeof(int) })!;
            string text = (string)getNodeTextMethod.Invoke(treeNode.Owner, new object[] { treeNode.NodeId })!;
            info["Name"] = text;
            info["Value"] = text;

            var hasChildrenMethod = ownerType.GetMethod("NodeHasChildren", new[] { typeof(int) })!;
            info["HasChildren"] = (bool)hasChildrenMethod.Invoke(treeNode.Owner, new object[] { treeNode.NodeId })!;

            var isExpandedMethod = ownerType.GetMethod("IsNodeExpanded", new[] { typeof(int) })!;
            info["IsExpanded"] = (bool)isExpandedMethod.Invoke(treeNode.Owner, new object[] { treeNode.NodeId })!;
            return info;
        }
        if (target is DevExpressTreeListNodeHandle tlNode)
        {
            info["ClassName"] = "DevExpressTreeListNode";
            info["LocalizedControlType"] = "DevExpressTreeListNode";
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;

            bool hasChildren = false, expanded = false;
            try
            {
                var childNodesProp = tlNode.Node.GetType().GetProperty("Nodes");
                var childNodes = childNodesProp?.GetValue(tlNode.Node) as System.Collections.ICollection;
                hasChildren = childNodes != null && childNodes.Count > 0;

                var expandedProp = tlNode.Node.GetType().GetProperty("Expanded");
                if (expandedProp != null)
                    expanded = (bool)expandedProp.GetValue(tlNode.Node)!;
            }
            catch (Exception) { /* best-effort */ }
            info["HasChildren"] = hasChildren;
            info["IsExpanded"] = expanded;

            var nameParts = new List<string>();
            try
            {
                var columnsProp = tlNode.TreeList.GetType().GetProperty("Columns");
                var columns = columnsProp?.GetValue(tlNode.TreeList) as System.Collections.IEnumerable;
                Control? treeListCtrl = tlNode.TreeList as Control;
                if (columns != null)
                {
                    foreach (object column in columns)
                    {
                        var visibleProp = column.GetType().GetProperty("Visible");
                        if (visibleProp != null && !(bool)visibleProp.GetValue(column)!) continue;

                        var captionProp = column.GetType().GetProperty("Caption");
                        string caption = captionProp != null ? (string)captionProp.GetValue(column)! : "";

                        object? value = null;
                        var getCellValueForColumn = tlNode.TreeList.GetType().GetMethod(
                            "GetRowCellValue", new[] { tlNode.Node.GetType(), column.GetType() });
                        if (getCellValueForColumn != null)
                        {
                            var args = new[] { tlNode.Node, column };
                            try
                            {
                                if (treeListCtrl != null && treeListCtrl.IsHandleCreated && treeListCtrl.InvokeRequired)
                                    value = treeListCtrl.Invoke(() => getCellValueForColumn.Invoke(tlNode.TreeList, args));
                                else
                                    value = getCellValueForColumn.Invoke(tlNode.TreeList, args);
                            }
                            catch (Exception) { /* best-effort */ }
                        }

                        nameParts.Add($"{caption}: {value}");
                    }
                }
            }
            catch (Exception) { /* best-effort */ }

            string combined = string.Join(" | ", nameParts);
            info["Name"] = combined;
            info["Value"] = combined;
            return info;
        }
        if (target is DevExpressItemHandle devExItem)
        {
            info["ClassName"] = devExItem.Kind == "token" ? "DevExpressToken" : "DevExpressComboItem";
            info["LocalizedControlType"] = info["ClassName"];
            info["AutomationId"] = "";
            info["Description"] = "";
            info["IsEnabled"] = true;
            info["IsOffscreen"] = false;
            info["x"] = 0.0; info["y"] = 0.0; info["width"] = 0.0; info["height"] = 0.0;

            string realValue = "";
            try
            {
                if (devExItem.Kind == "token")
                {
                    var valueProp = devExItem.Item.GetType().GetProperty("Value");
                    object? val = valueProp?.GetValue(devExItem.Item);
                    realValue = val?.ToString() ?? "";
                }
                else
                {
                    var realValueProp = devExItem.Item.GetType().GetProperty("RealValue");
                    object? val = realValueProp?.GetValue(devExItem.Item);
                    realValue = val?.ToString() ?? devExItem.Item.ToString() ?? "";
                }
            }
            catch (Exception) { /* best-effort */ }

            info["Name"] = realValue;
            info["Value"] = realValue;
            return info;
        }

        info["ClassName"] = target.GetType().Name;
        info["LocalizedControlType"] = target.GetType().Name;

        if (target is Control ctrl2)
        {
            info["Name"] = ctrl2.Name ?? "";
            info["AutomationId"] = ctrl2.Name ?? "";
            info["Description"] = "";
            try
            {
                System.Drawing.Point screenPt = ctrl2.Parent != null
                    ? ctrl2.Parent.PointToScreen(ctrl2.Location)
                    : ctrl2.Location;
                info["x"] = (double)screenPt.X;
                info["y"] = (double)screenPt.Y;
            }
            catch (Exception) { info["x"] = 0.0; info["y"] = 0.0; }
            info["width"] = (double)ctrl2.Width;
            info["height"] = (double)ctrl2.Height;
            info["IsEnabled"] = ctrl2.Enabled;
            info["IsOffscreen"] = !ctrl2.Visible;
            info["HasKeyboardFocus"] = ctrl2.Focused;

            try
            {
                var textProp = target.GetType().GetProperty("Text");
                if (textProp != null)
                {
                    string? text = (string?)textProp.GetValue(target);
                    if (!string.IsNullOrEmpty(text) && string.IsNullOrEmpty((string?)info["Name"]))
                        info["Name"] = text;
                    info["Value"] = text;
                }
            }
            catch (Exception) { /* no Text property, or reflection failed — not fatal */ }
        }
        else if (target is DependencyObject dep2)
        {
            var fe = target as FrameworkElement;
            info["Name"] = fe?.Name ?? "";
            info["AutomationId"] = info["Name"];
            info["Description"] = "";

            if (fe != null)
            {
                try
                {
                    System.Windows.Point topLeft = fe.PointToScreen(new System.Windows.Point(0, 0));
                    info["x"] = topLeft.X;
                    info["y"] = topLeft.Y;
                }
                catch (Exception) { info["x"] = 0.0; info["y"] = 0.0; }
                info["width"] = fe.ActualWidth;
                info["height"] = fe.ActualHeight;
                info["IsEnabled"] = fe.IsEnabled;
                info["IsOffscreen"] = !fe.IsVisible;
                info["HasKeyboardFocus"] = fe.IsFocused;
            }

            try
            {
                var textProp = target.GetType().GetProperty("Text");
                if (textProp != null)
                {
                    string? text = (string?)textProp.GetValue(target);
                    if (!string.IsNullOrEmpty(text) && string.IsNullOrEmpty((string?)info["Name"]))
                        info["Name"] = text;
                    info["Value"] = text;
                }
            }
            catch (Exception) { /* no Text property, or reflection failed — not fatal */ }
        }

        TryAddDevExpressProps(target, info);
        return info;
    }

    private static void TryAddDevExpressProps(object target, Dictionary<string, object?> info)
    {
        try
        {
            string? typeName = target.GetType().FullName;
            if (typeName == null || !typeName.StartsWith("DevExpress.", StringComparison.Ordinal)) return;

            info["IsDevExpressControl"] = true;

            foreach (string candidate in new[] { "EditValue", "DisplayText", "Text" })
            {
                var prop = target.GetType().GetProperty(candidate);
                if (prop == null || !prop.CanRead) continue;
                object? value = prop.GetValue(target);
                if (value != null)
                {
                    info["Value"] = value.ToString();
                    break;
                }
            }

            // Xpf.Grid's LightweightCellEditor (unfocused/off-screen cells rendered via a cheap
            // non-editing surrogate, DevExpress's own perf feature for virtualized rows/columns)
            // has none of the three candidates above -- confirmed live against a real
            // DevExpress.Xpf.Grid 26.1 GridControl (appium-windows2-test-apps' wpf-devexpress-
            // lightweight fixture), it exposes no Text/EditValue/DisplayText at all. But its
            // RowData.Row is the actual bound data item and Column.FieldName names the bound
            // property on that item -- reading the value that way needs no DevExpress-internal
            // API, just the row object's own property by name, so unlike the WinForms XtraGrid /
            // TreeList adapters elsewhere in this file this doesn't depend on a specific
            // DevExpress version's private method shapes: RowData and FieldName are long-standing,
            // publicly documented Xpf.Grid concepts. Only runs when the probes above found
            // nothing, since a real editor's own Text/EditValue is always more authoritative when
            // present (e.g. an actively-focused cell that already swapped to a full editor).
            if (!(info.TryGetValue("Value", out var existingValue) && !string.IsNullOrEmpty(existingValue as string)))
            {
                try
                {
                    var rowDataProp = target.GetType().GetProperty(
                        "RowData", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    var rowData = rowDataProp?.GetValue(target);
                    var rowProp = rowData?.GetType().GetProperty(
                        "Row", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    var boundRow = rowProp?.GetValue(rowData);

                    var columnProp = target.GetType().GetProperty(
                        "Column", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    var column = columnProp?.GetValue(target);
                    var fieldNameProp = column?.GetType().GetProperty("FieldName");
                    var fieldName = fieldNameProp?.GetValue(column) as string;

                    if (boundRow != null && !string.IsNullOrEmpty(fieldName))
                    {
                        var fieldProp = boundRow.GetType().GetProperty(fieldName);
                        var fieldValue = fieldProp?.GetValue(boundRow);
                        if (fieldValue != null)
                        {
                            info["Value"] = fieldValue.ToString();
                            if (string.IsNullOrEmpty(info.GetValueOrDefault("Name") as string))
                                info["Name"] = fieldValue.ToString();
                        }
                    }
                }
                catch (Exception) { /* best-effort */ }
            }

            var selectedProp = target.GetType().GetProperty("Selected");
            if (selectedProp != null && selectedProp.CanRead)
            {
                object? selected = selectedProp.GetValue(target);
                if (selected != null) info["IsSelected"] = selected;
            }
        }
        catch (Exception)
        {
            // Reflection over an unknown DevExpress internal shape is inherently best-effort —
            // never let it fail the whole getInfo() call.
        }
    }

    public static void SetValue(object target, string value)
    {
        var textProp = target.GetType().GetProperty("Text");
        if (textProp != null && textProp.CanWrite)
        {
            textProp.SetValue(target, value);
            return;
        }
        var editValueProp = target.GetType().GetProperty("EditValue");
        if (editValueProp != null && editValueProp.CanWrite)
        {
            editValueProp.SetValue(target, value);
            return;
        }
        throw new InvalidOperationException("Element has no writable Text/EditValue property.");
    }

    public static void Invoke(object target)
    {
        var performClick = target.GetType().GetMethod("PerformClick", Type.EmptyTypes);
        if (performClick != null)
        {
            performClick.Invoke(target, null);
            return;
        }

        var onClick = target.GetType().GetMethod("OnClick", BindingFlags.NonPublic | BindingFlags.Instance);
        if (onClick != null && onClick.GetParameters().Length == 0)
        {
            onClick.Invoke(target, null);
            return;
        }

        throw new InvalidOperationException("Element does not support a reflectable invoke action.");
    }

    public static void Select(object target)
    {
        if (target is GridRowHandle row)
        {
            var focusedRowHandleProp = row.View.GetType().GetProperty("FocusedRowHandle");
            if (focusedRowHandleProp != null && focusedRowHandleProp.CanWrite)
            {
                focusedRowHandleProp.SetValue(row.View, row.RowHandle);
                return;
            }
        }
        if (target is ListItemHandle item)
        {
            var selectItemMethod = item.Owner.GetType().GetMethod("SelectItem", new[] { typeof(int) });
            if (selectItemMethod != null)
            {
                selectItemMethod.Invoke(item.Owner, new object[] { item.Index });
                return;
            }
        }
        if (target is DevExpressTreeListNodeHandle tlNode)
        {
            var focusedNodeProp = tlNode.TreeList.GetType().GetProperty("FocusedNode");
            if (focusedNodeProp != null && focusedNodeProp.CanWrite)
            {
                focusedNodeProp.SetValue(tlNode.TreeList, tlNode.Node);
                return;
            }
        }
        if (target is DevExpressItemHandle devExItem && devExItem.Kind == "combo")
        {
            var editValueProp = devExItem.Owner.GetType().GetProperty("EditValue");
            if (editValueProp != null && editValueProp.CanWrite)
            {
                editValueProp.SetValue(devExItem.Owner, devExItem.Item);
                return;
            }
        }
        var performClick = target.GetType().GetMethod("PerformClick", Type.EmptyTypes);
        if (performClick != null)
        {
            performClick.Invoke(target, null);
            return;
        }
        throw new InvalidOperationException($"selectElement not supported for {target.GetType().Name}.");
    }

    // Deliberately no PerformClick/Invoke fallback here (unlike Select) — a click silently
    // "succeeding" on a non-expandable element while claiming to have expanded it would be
    // exactly the bug the invoke/select/expand split was meant to fix.
    public static void Expand(object target)
    {
        if (target is TreeNodeHandle node)
        {
            var toggleExpandMethod = node.Owner.GetType().GetMethod("ToggleExpand", new[] { typeof(int) });
            if (toggleExpandMethod != null)
            {
                toggleExpandMethod.Invoke(node.Owner, new object[] { node.NodeId });
                return;
            }
        }
        if (target is DevExpressTreeListNodeHandle tlNode)
        {
            var expandedProp = tlNode.Node.GetType().GetProperty("Expanded");
            if (expandedProp != null && expandedProp.CanWrite)
            {
                expandedProp.SetValue(tlNode.Node, true);
                return;
            }
        }
        throw new InvalidOperationException($"expandElement not supported for {target.GetType().Name}.");
    }

    // ── Condition matching — mirrors java-agent/CommandHandler.java's matchesCondition() shape:
    //    {"type":"and"|"or"|"not"|"true"|"false"|"property", "property":..., "value":..., "conditions":[...], "condition":{...}}

    public static bool MatchesCondition(object target, object? conditionObj)
    {
        if (conditionObj == null) return true;
        if (conditionObj is not Dictionary<string, object?> condition) return true;

        string? type = condition.TryGetValue("type", out var t) ? t as string : null;
        if (type == null || type == "true") return true;
        if (type == "false") return false;

        if (type == "not")
        {
            object? inner = condition.TryGetValue("condition", out var c) ? c : null;
            return !MatchesCondition(target, inner);
        }
        if (type == "and")
        {
            if (!condition.TryGetValue("conditions", out var subsObj) || subsObj is not List<object?> subs) return true;
            foreach (var sub in subs)
                if (!MatchesCondition(target, sub)) return false;
            return true;
        }
        if (type == "or")
        {
            if (!condition.TryGetValue("conditions", out var subsObj) || subsObj is not List<object?> subs) return false;
            foreach (var sub in subs)
                if (MatchesCondition(target, sub)) return true;
            return false;
        }
        if (type == "property")
        {
            string? prop = condition.TryGetValue("property", out var p) ? p as string : null;
            object? valueObj = condition.TryGetValue("value", out var v) ? v : null;
            string value = valueObj?.ToString() ?? "";
            return MatchesProperty(target, prop, value);
        }
        return false;
    }

    public static List<object>? TryGetOwnerDrawListItems(object target)
    {
        var type = target.GetType();
        var itemCountProp = type.GetProperty("ItemCount");
        var getItemTextMethod = type.GetMethod("GetItemText", new[] { typeof(int) });
        var selectItemMethod = type.GetMethod("SelectItem", new[] { typeof(int) });
        if (itemCountProp == null || getItemTextMethod == null || selectItemMethod == null)
            return null;

        int count = (int)itemCountProp.GetValue(target)!;
        var result = new List<object>();
        for (int i = 0; i < count; i++)
            result.Add(new ListItemHandle(target, i));
        return result;
    }

    private static bool IsTreeHost(Type type)
    {
        return type.GetMethod("GetChildNodeIds", new[] { typeof(int) }) != null
            && type.GetMethod("GetNodeText", new[] { typeof(int) }) != null
            && type.GetMethod("NodeHasChildren", new[] { typeof(int) }) != null
            && type.GetMethod("IsNodeExpanded", new[] { typeof(int) }) != null
            && type.GetMethod("ToggleExpand", new[] { typeof(int) }) != null;
    }

    private static int[] GetChildNodeIds(object owner, int parentNodeId)
    {
        var method = owner.GetType().GetMethod("GetChildNodeIds", new[] { typeof(int) })!;
        return (int[])method.Invoke(owner, new object[] { parentNodeId })!;
    }

    public static List<object>? TryGetTreeRootNodes(object target)
    {
        if (!IsTreeHost(target.GetType())) return null;

        var result = new List<object>();
        foreach (int id in GetChildNodeIds(target, -1))
            result.Add(new TreeNodeHandle(target, id));
        return result;
    }

    public static List<object> GetTreeNodeChildren(TreeNodeHandle node)
    {
        var result = new List<object>();
        var ownerType = node.Owner.GetType();
        var isExpandedMethod = ownerType.GetMethod("IsNodeExpanded", new[] { typeof(int) })!;
        bool expanded = (bool)isExpandedMethod.Invoke(node.Owner, new object[] { node.NodeId })!;
        if (!expanded) return result;

        foreach (int id in GetChildNodeIds(node.Owner, node.NodeId))
            result.Add(new TreeNodeHandle(node.Owner, id));
        return result;
    }

    public static List<object>? TryGetDevExpressGridRows(object target)
    {
        string? typeName = target.GetType().FullName;
        if (typeName != "DevExpress.XtraGrid.GridControl") return null;

        var mainViewProp = target.GetType().GetProperty("MainView");
        object? view = mainViewProp?.GetValue(target);
        if (view == null) return null;

        var rowCountProp = view.GetType().GetProperty("RowCount");
        if (rowCountProp == null) return null;
        int rowCount = (int)rowCountProp.GetValue(view)!;

        var visibleHandleMethod = view.GetType().GetMethod("GetVisibleRowHandle", new[] { typeof(int) });

        var result = new List<object>();
        for (int i = 0; i < rowCount; i++)
        {
            int rowHandle = i;
            if (visibleHandleMethod != null)
            {
                try { rowHandle = (int)visibleHandleMethod.Invoke(view, new object[] { i })!; }
                catch (Exception) { rowHandle = i; }
            }
            result.Add(new GridRowHandle(view, rowHandle));
        }
        return result;
    }

    public static List<object> GetDevExpressGridCells(GridRowHandle row)
    {
        var result = new List<object>();

        try
        {
            var isGroupRowMethod = row.View.GetType().GetMethod("IsGroupRow", new[] { typeof(int) });
            if (isGroupRowMethod != null &&
                (bool)isGroupRowMethod.Invoke(row.View, new object[] { row.RowHandle })!)
                return result;
        }
        catch (Exception) { /* best-effort — fall through to normal cell reads */ }

        var columnsProp = row.View.GetType().GetProperty("Columns");
        if (columnsProp == null) return result;
        if (columnsProp.GetValue(row.View) is not System.Collections.IEnumerable columns) return result;

        foreach (object column in columns)
        {
            var visibleProp = column.GetType().GetProperty("Visible");
            if (visibleProp != null && !(bool)visibleProp.GetValue(column)!) continue;

            var captionProp = column.GetType().GetProperty("Caption");
            var fieldNameProp = column.GetType().GetProperty("FieldName");
            string caption = captionProp != null ? (string)captionProp.GetValue(column)! : "";
            string fieldName = fieldNameProp != null ? (string)fieldNameProp.GetValue(column)! : "";

            result.Add(new GridCellHandle(row.View, row.RowHandle, column, caption, fieldName));
        }
        return result;
    }

    private static Control? GridControlOf(object view)
    {
        var gridControlProp = view.GetType().GetProperty("GridControl");
        return gridControlProp?.GetValue(view) as Control;
    }

    // Type.GetProperty(string) throws AmbiguousMatchException when a property is re-declared
    // with a covariant return type at more than one level of the hierarchy — DevExpress editors
    // do exactly this for "Properties". Walking from the most-derived type down with
    // DeclaredOnly finds the first (most-derived, most useful) match instead of throwing.
    private static PropertyInfo? FindPropertyInHierarchy(Type type, string name)
    {
        for (Type? t = type; t != null; t = t.BaseType)
        {
            var prop = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
            if (prop != null) return prop;
        }
        return null;
    }

    private static object? GetDevExpressRowCellValue(object view, int rowHandle, object column)
    {
        var method = view.GetType().GetMethod("GetRowCellValue", new[] { typeof(int), column.GetType() });
        if (method == null) return null;

        Control? ctrl = GridControlOf(view);

        if (ctrl != null && ctrl.IsHandleCreated && ctrl.InvokeRequired)
            return ctrl.Invoke(() => method.Invoke(view, new object[] { rowHandle, column }));

        return method.Invoke(view, new object[] { rowHandle, column });
    }

    public static List<object>? TryGetDevExpressTreeListRoots(object target)
    {
        string? typeName = target.GetType().FullName;
        if (typeName != "DevExpress.XtraTreeList.TreeList") return null;

        var nodesProp = target.GetType().GetProperty("Nodes");
        if (nodesProp?.GetValue(target) is not System.Collections.IEnumerable nodes) return null;

        var result = new List<object>();
        foreach (object node in nodes)
            result.Add(new DevExpressTreeListNodeHandle(target, node));
        return result;
    }

    public static List<object> GetDevExpressTreeListNodeChildren(DevExpressTreeListNodeHandle handle)
    {
        var result = new List<object>();

        var expandedProp = handle.Node.GetType().GetProperty("Expanded");
        bool expanded = expandedProp != null && (bool)expandedProp.GetValue(handle.Node)!;
        if (!expanded) return result;

        var childNodesProp = handle.Node.GetType().GetProperty("Nodes");
        if (childNodesProp?.GetValue(handle.Node) is not System.Collections.IEnumerable childNodes) return result;

        foreach (object child in childNodes)
            result.Add(new DevExpressTreeListNodeHandle(handle.TreeList, child));
        return result;
    }

    public static List<object>? TryGetDevExpressComboItems(object target)
    {
        string? typeName = target.GetType().FullName;
        if (typeName != "DevExpress.XtraEditors.ComboBoxEdit") return null;

        try
        {
            var propertiesProp = FindPropertyInHierarchy(target.GetType(), "Properties");
            object? properties = propertiesProp?.GetValue(target);
            if (properties == null) return new List<object>();

            var itemsProp = properties.GetType().GetProperty("Items");
            if (itemsProp?.GetValue(properties) is not System.Collections.IEnumerable items)
                return new List<object>();

            var result = new List<object>();
            int index = 0;
            foreach (object item in items)
                result.Add(new DevExpressItemHandle(target, item, index++, "combo"));
            return result;
        }
        catch (Exception ex)
        {
            // Surface the failure as a single diagnostic child instead of throwing — an
            // exception here would silently vanish upstream, leaving a plain empty-children
            // element indistinguishable from "combo really has no items."
            var result = new List<object> { new DevExpressItemHandle(target, "ERROR: " + ex.Message, 0, "combo") };
            return result;
        }
    }

    public static List<object>? TryGetDevExpressTokens(object target)
    {
        string? typeName = target.GetType().FullName;
        if (typeName != "DevExpress.XtraEditors.TokenEdit") return null;

        try
        {
            var propertiesProp = FindPropertyInHierarchy(target.GetType(), "Properties");
            object? properties = propertiesProp?.GetValue(target);
            if (properties == null) return new List<object>();

            var tokensProp = properties.GetType().GetProperty("Tokens");
            if (tokensProp?.GetValue(properties) is not System.Collections.IEnumerable tokens)
                return new List<object>();

            var result = new List<object>();
            int index = 0;
            foreach (object token in tokens)
                result.Add(new DevExpressItemHandle(target, token, index++, "token"));
            return result;
        }
        catch (Exception ex)
        {
            var result = new List<object> { new DevExpressItemHandle(target, "ERROR: " + ex.Message, 0, "token") };
            return result;
        }
    }

    // Case-insensitive lookup directly against whatever BuildInfo populated for this target.
    private static bool MatchesProperty(object target, string? property, string value)
    {
        if (property == null) return false;
        var info = BuildInfo(target);
        string prop = property.ToLowerInvariant();

        string? key = null;
        foreach (string k in info.Keys)
        {
            if (k.ToLowerInvariant() == prop) { key = k; break; }
        }
        if (key == null) return false;

        object? actual = info[key];
        string actualStr = actual?.ToString() ?? "";
        return actualStr == value;
    }
}
