#nullable enable
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace OwnerDrawGallery;

// Five owner-drawn elements exercising the .NET bridge's generic synthetic-item machinery
// (ListItemHandle, TreeNodeHandle) plus the invoke/select/expand split. All controls follow the
// StatusIndicator convention: own painting AND accessibility (AccessibleName blanked), so plain
// UIA genuinely can't see real values — same discipline as minimal-ownerdraw-winforms.

// ── 1. ListBox — validated already against listbox-probe-throwaway; reused here verbatim,
//    plus an ItemSelected event so the combo/context-menu popups (which host an instance of
//    this class) can react to a selection instead of only being driven externally. ────────────
internal sealed class OwnerDrawListBoxFixture : Control
{
    private const int RowHeight = 24;
    private readonly string[] _items;
    private int _selectedIndex = -1;

    public event Action<int>? ItemSelected;

    public int ItemCount => _items.Length;
    public int SelectedIndex => _selectedIndex;

    public OwnerDrawListBoxFixture(string[] items)
    {
        _items = items;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(160, RowHeight * items.Length);
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
    }

    public string GetItemText(int index) => _items[index];

    public Rectangle GetItemBounds(int index) => new(0, index * RowHeight, Width, RowHeight);

    public void SelectItem(int index)
    {
        _selectedIndex = index;
        Invalidate();
        ItemSelected?.Invoke(index);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        int index = e.Y / RowHeight;
        if (index >= 0 && index < _items.Length)
        {
            SelectItem(index);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        for (int i = 0; i < _items.Length; i++)
        {
            var rowRect = GetItemBounds(i);
            var backColor = i == _selectedIndex ? Color.LightBlue : Color.White;
            e.Graphics.FillRectangle(new SolidBrush(backColor), rowRect);
            TextRenderer.DrawText(e.Graphics, _items[i], Font, rowRect, Color.Black,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
        }
    }
}

// ── 2. TreeView — 2-level fixed hierarchy. Children of a collapsed node are genuinely absent
//    from GetChildNodeIds's result until ToggleExpand runs, which is what gives the bridge's
//    Expand command something real to prove. ────────────────────────────────────────────────
internal sealed class OwnerDrawTreeFixture : Control
{
    private const int RowHeight = 22;

    private readonly Dictionary<int, List<int>> _childrenByParent = new()
    {
        [-1] = new List<int> { 0, 1 },
        [0] = new List<int> { 2, 3 },
        [1] = new List<int> { 4, 5 },
    };

    private readonly Dictionary<int, string> _textById = new()
    {
        [0] = "Root A", [1] = "Root B",
        [2] = "Child A1", [3] = "Child A2",
        [4] = "Child B1", [5] = "Child B2",
    };

    private readonly HashSet<int> _expandedNodeIds = new();

    public OwnerDrawTreeFixture()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(180, RowHeight * 6);
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
    }

    public int[] GetChildNodeIds(int parentNodeId) =>
        _childrenByParent.TryGetValue(parentNodeId, out var list) ? list.ToArray() : Array.Empty<int>();

    public string GetNodeText(int nodeId) => _textById[nodeId];

    public bool NodeHasChildren(int nodeId) =>
        _childrenByParent.TryGetValue(nodeId, out var list) && list.Count > 0;

    public bool IsNodeExpanded(int nodeId) => _expandedNodeIds.Contains(nodeId);

    public void ToggleExpand(int nodeId)
    {
        if (!_expandedNodeIds.Add(nodeId))
        {
            _expandedNodeIds.Remove(nodeId);
        }
        Invalidate();
    }

    private List<int> GetVisibleNodes()
    {
        var result = new List<int>();
        void Walk(int parentId)
        {
            foreach (var id in GetChildNodeIds(parentId))
            {
                result.Add(id);
                if (IsNodeExpanded(id)) Walk(id);
            }
        }
        Walk(-1);
        return result;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        int index = e.Y / RowHeight;
        var visible = GetVisibleNodes();
        if (index >= 0 && index < visible.Count)
        {
            ToggleExpand(visible[index]);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var visible = GetVisibleNodes();
        e.Graphics.FillRectangle(Brushes.White, ClientRectangle);
        for (int i = 0; i < visible.Count; i++)
        {
            int id = visible[i];
            var rowRect = new Rectangle(0, i * RowHeight, Width, RowHeight);
            string glyph = NodeHasChildren(id) ? (IsNodeExpanded(id) ? "[-] " : "[+] ") : "      ";
            TextRenderer.DrawText(e.Graphics, glyph + GetNodeText(id), Font, rowRect, Color.Black,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
        }
    }
}

// ── Shared popup helper for Combo (3) and ContextMenu (4) — both are a borderless owned Form
//    hosting an OwnerDrawListBoxFixture, deliberately NOT a real ContextMenuStrip/ComboBox
//    dropdown (those leak to UIA via real automation peers even when custom-painted). This
//    reproduces the "second top-level window, same PID, dismissed by naive traversal" fragility
//    called out for the Windows To-Do popup handling in test/e2e/helpers/session.ts. ──────────
internal static class OwnerDrawPopup
{
    public static Form Open(Control anchor, Point screenLocation, string[] items, Action<int> onSelect)
    {
        var popup = new Form
        {
            FormBorderStyle = FormBorderStyle.None,
            TopMost = true,
            ShowInTaskbar = false,
            StartPosition = FormStartPosition.Manual,
            Location = screenLocation,
        };

        var list = new OwnerDrawListBoxFixture(items) { Name = "PopupList", Location = Point.Empty };
        popup.ClientSize = list.Size;
        list.ItemSelected += (index) =>
        {
            onSelect(index);
            popup.Close();
        };
        popup.Controls.Add(list);
        popup.Deactivate += (_, _) => popup.Close();
        popup.Show(anchor.FindForm());
        return popup;
    }
}

// ── 3. Combo — closed box shows the current value via the generic Text-property reflection
//    path Reflector::BuildInfo already has (no bridge changes needed for the closed box).
//    PerformClick() reuses the existing Invoke->PerformClick convention so the bridge can open
//    the popup without any new RPC command. ─────────────────────────────────────────────────
internal sealed class OwnerDrawComboFixture : Control
{
    private static readonly string[] Options = { "Red", "Green", "Blue" };

    public OwnerDrawComboFixture()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(160, 32);
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
        Text = Options[0];
    }

    public void PerformClick()
    {
        var screenLocation = PointToScreen(new Point(0, Height));
        OwnerDrawPopup.Open(this, screenLocation, Options, (index) =>
        {
            Text = Options[index];
            Invalidate();
        });
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        PerformClick();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.FillRectangle(Brushes.White, ClientRectangle);
        e.Graphics.DrawRectangle(Pens.Gray, 0, 0, Width - 1, Height - 1);
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Color.Black,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.Left);
        TextRenderer.DrawText(e.Graphics, "▼", Font, new Rectangle(Width - 20, 0, 20, Height), Color.Black,
            TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
    }
}

// ── 4. ContextMenu — right-click (or bridge invoke, via the same PerformClick convention)
//    opens the same kind of borderless popup as the combo, with menu-style items. ─────────────
internal sealed class OwnerDrawContextMenuFixture : Control
{
    private static readonly string[] MenuItems = { "Copy", "Paste", "Delete" };
    private string _lastAction = "(none)";

    public string LastAction => _lastAction;

    public OwnerDrawContextMenuFixture()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(160, 40);
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
        Text = _lastAction;
    }

    public void PerformClick() => ShowMenu(PointToScreen(new Point(0, Height)));

    private void ShowMenu(Point screenLocation)
    {
        OwnerDrawPopup.Open(this, screenLocation, MenuItems, (index) =>
        {
            _lastAction = MenuItems[index];
            Text = _lastAction;
            Invalidate();
        });
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Right)
        {
            ShowMenu(PointToScreen(e.Location));
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.FillRectangle(Brushes.WhiteSmoke, ClientRectangle);
        e.Graphics.DrawRectangle(Pens.Gray, 0, 0, Width - 1, Height - 1);
        TextRenderer.DrawText(e.Graphics, $"Right-click me\nLast: {_lastAction}", Font, ClientRectangle, Color.Black,
            TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
    }
}

// ── 5. Modal dialog — real second Form via ShowDialog, same PID as MainForm. Reuses the
//    StatusIndicator pattern from minimal-ownerdraw-winforms (not imported — that project is
//    pinned as a regression fixture — copied here to keep this app self-contained). ───────────
internal sealed class StatusIndicator : Control
{
    public StatusIndicator(string status)
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(160, 40);
        Text = status;
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.FillRectangle(Brushes.LightYellow, ClientRectangle);
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Color.Black,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

internal sealed class ModalDialogForm : Form
{
    public ModalDialogForm()
    {
        Text = "Modal Dialog";
        Width = 260;
        Height = 160;
        var indicator = new StatusIndicator("DialogSecret") { Name = "DialogStatus", Location = new Point(40, 50) };
        Controls.Add(indicator);
    }
}

internal sealed class MainForm : Form
{
    public MainForm()
    {
        Text = "OwnerDraw Gallery Fixture";
        Width = 420;
        Height = 520;

        var listBox = new OwnerDrawListBoxFixture(new[] { "Apple", "Banana", "Cherry" })
        {
            Name = "ListBox1",
            Location = new Point(30, 30),
        };

        var tree = new OwnerDrawTreeFixture { Name = "Tree1", Location = new Point(30, 120) };

        var combo = new OwnerDrawComboFixture { Name = "Combo1", Location = new Point(30, 260) };

        var contextMenu = new OwnerDrawContextMenuFixture { Name = "ContextMenu1", Location = new Point(30, 310) };

        var openDialogButton = new Button
        {
            Name = "OpenDialogButton",
            Text = "Open Dialog",
            Location = new Point(30, 380),
            Width = 160,
        };
        openDialogButton.Click += (_, _) =>
        {
            using var dialog = new ModalDialogForm();
            dialog.ShowDialog(this);
        };

        Controls.Add(listBox);
        Controls.Add(tree);
        Controls.Add(combo);
        Controls.Add(contextMenu);
        Controls.Add(openDialogButton);
    }
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
