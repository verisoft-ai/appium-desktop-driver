namespace AppiumDotNetBridgeCore;

// Synthetic wrapper objects for controls that paint their own rows/cells/nodes and have no
// backing Control/DependencyObject of their own — direct port of the ref classes in
// BridgeAgent.cpp (GridRowHandle, GridCellHandle, ListItemHandle, TreeNodeHandle,
// DevExpressTreeListNodeHandle, DevExpressItemHandle). ElementRegistry.Save accepts any object,
// and everything downstream (getInfo/getChildren/getValue/find) already dispatches on object, so
// no changes are needed outside Reflector for these to work as first-class elements.

internal sealed class GridRowHandle(object view, int rowHandle)
{
    public object View { get; } = view;
    public int RowHandle { get; } = rowHandle;
}

internal sealed class GridCellHandle(object view, int rowHandle, object column, string caption, string fieldName)
{
    public object View { get; } = view;
    public int RowHandle { get; } = rowHandle;
    public object Column { get; } = column;
    public string Caption { get; } = caption;
    public string FieldName { get; } = fieldName;
}

internal sealed class ListItemHandle(object owner, int index)
{
    public object Owner { get; } = owner;
    public int Index { get; } = index;
}

internal sealed class TreeNodeHandle(object owner, int nodeId)
{
    public object Owner { get; } = owner;
    public int NodeId { get; } = nodeId;
}

internal sealed class DevExpressTreeListNodeHandle(object treeList, object node)
{
    public object TreeList { get; } = treeList;
    public object Node { get; } = node;
}

internal sealed class DevExpressItemHandle(object owner, object item, int index, string kind)
{
    public object Owner { get; } = owner;
    public object Item { get; } = item;
    public int Index { get; } = index;
    public string Kind { get; } = kind; // "combo" or "token"
}
