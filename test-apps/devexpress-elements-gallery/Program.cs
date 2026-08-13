#nullable enable
using System;
using System.Collections.Generic;
using System.Windows.Forms;
using DevExpress.XtraGrid;
using DevExpress.XtraGrid.Views.Grid;
using DevExpress.XtraTreeList;
using DevExpress.XtraEditors;

namespace DevExpressElementsGallery;

// Real DevExpress-specific fixtures, as opposed to test-apps/ownerdraw-gallery's generic
// convention-based controls. Each of these 4 shapes was empirically verified this session to be
// genuinely invisible (or, for the grid, its group rows specifically) to plain UIA — confirmed via
// throwaway probes before this fixture was written, per this repo's established discipline (see
// devexpress-grid-ownerdraw/Program.cs's own header for why that verification step matters).
//
// Two DevExpress-specific candidates were probed and dropped because they turned out to already
// be UIA-visible: BarManager/PopupMenu with plain-text captions (UIA exposes the real caption
// directly as the popup button's Name), and SchedulerControl appointments (UIA exposes the real
// subject and full appointment detail directly). Neither needed the bridge, so neither is here.

// ── TreeList: unbound, custom-drawn "Status" column — mirrors devexpress-grid-ownerdraw's
//    Status column exactly. Root nodes each get one child, both collapsed by default so the
//    expand/select bridge paths are exercised, not just read.
internal static class TreeListSection
{
    private static readonly string[] StatusValues = { "Healthy", "Degraded" };

    public static TreeList Build()
    {
        var tree = new TreeList { Name = "ElementsTree", Dock = DockStyle.Fill };
        tree.OptionsBehavior.Editable = false;

        var nameColumn = new DevExpress.XtraTreeList.Columns.TreeListColumn
        { Caption = "Name", FieldName = "Name", VisibleIndex = 0, Visible = true };
        tree.Columns.Add(nameColumn);

        var statusColumn = new DevExpress.XtraTreeList.Columns.TreeListColumn
        {
            Caption = "Status",
            FieldName = "colStatus",
            VisibleIndex = 1,
            Visible = true,
        };
        tree.Columns.Add(statusColumn);

        // CustomUnboundColumnData is for layering an extra unbound column over a real bound data
        // source (as devexpress-grid-ownerdraw does) — it doesn't apply the same way to a tree
        // populated purely via AppendNode with no DataSource at all (confirmed empirically: the
        // event never fires in that mode). SetRowCellValue stores the real value directly on the
        // node instead; GetRowCellValue reads it back exactly like a bound column would, and
        // CustomDrawNodeCell paints it independently of whatever a data-bound column's default
        // renderer would show, keeping the "real value != what UIA sees" story intact.
        tree.CustomDrawNodeCell += (sender, e) =>
        {
            if (e.Column.FieldName != "colStatus") return;
            string status = (string?)tree.GetRowCellValue(e.Node, statusColumn) ?? "";
            e.Cache.FillRectangle(System.Drawing.Brushes.White, e.Bounds);
            e.Cache.DrawString(status, tree.Font, System.Drawing.Brushes.Black, e.Bounds,
                new System.Drawing.StringFormat { LineAlignment = System.Drawing.StringAlignment.Center });
            e.Handled = true;
        };

        var rootA = tree.AppendNode(new object[] { "Root A", null }, -1);
        tree.SetRowCellValue(rootA, statusColumn, StatusValues[rootA.Id % StatusValues.Length]);
        var childA1 = tree.AppendNode(new object[] { "Child A1", null }, rootA);
        tree.SetRowCellValue(childA1, statusColumn, StatusValues[childA1.Id % StatusValues.Length]);
        var rootB = tree.AppendNode(new object[] { "Root B", null }, -1);
        tree.SetRowCellValue(rootB, statusColumn, StatusValues[rootB.Id % StatusValues.Length]);
        var childB1 = tree.AppendNode(new object[] { "Child B1", null }, rootB);
        tree.SetRowCellValue(childB1, statusColumn, StatusValues[childB1.Id % StatusValues.Length]);

        return tree;
    }
}

// ── ComboBoxEdit: dropdown items paint a different string than their bound ToString() value.
//    RealValue is what the bridge reads by convention; the shown/bound text is what plain UIA
//    would see if it looked at the item at all.
internal sealed class ComboRealItem
{
    private readonly string _shown;
    public string RealValue { get; }

    public ComboRealItem(string shown, string realValue)
    {
        _shown = shown;
        RealValue = realValue;
    }

    public override string ToString() => _shown;
}

internal static class ComboSection
{
    public static ComboBoxEdit Build()
    {
        var combo = new ComboBoxEdit { Name = "ElementsCombo", Width = 220 };
        var items = new object[]
        {
            new ComboRealItem("shownRed", "RealRed"),
            new ComboRealItem("shownGreen", "RealGreen"),
            new ComboRealItem("shownBlue", "RealBlue"),
        };
        combo.Properties.Items.AddRange(items);
        combo.EditValue = items[0];

        combo.Properties.DrawItem += (sender, e) =>
        {
            if (e.Index < 0) return;
            var item = combo.Properties.Items[e.Index] as ComboRealItem;
            e.Cache.FillRectangle(System.Drawing.Brushes.White, e.Bounds);
            e.Cache.DrawString(item?.RealValue ?? "", combo.Font, System.Drawing.Brushes.Black, e.Bounds,
                new System.Drawing.StringFormat { LineAlignment = System.Drawing.StringAlignment.Center });
            e.Handled = true;
        };

        return combo;
    }
}

// ── TokenEdit: TokenEditToken.Value already differs from Description (a real DevExpress API
//    split, not a fixture convention) — Description is the bound placeholder UIA sees,
//    Value is what CustomDrawTokenText paints and what the bridge reads.
internal static class TokenSection
{
    private static readonly string[] RealTokenValues = { "AlphaReal", "BravoReal" };

    public static TokenEdit Build()
    {
        var token = new TokenEdit { Name = "ElementsToken", Width = 300 };
        token.Properties.Tokens.Add(new DevExpress.XtraEditors.TokenEditToken("shownA", RealTokenValues[0]));
        token.Properties.Tokens.Add(new DevExpress.XtraEditors.TokenEditToken("shownB", RealTokenValues[1]));
        token.EditValue = string.Join(",", RealTokenValues);

        token.Properties.CustomDrawTokenText += (sender, e) =>
        {
            string real = e.Value?.ToString() ?? "";
            e.Cache.DrawString(real, token.Font, System.Drawing.Brushes.Black, e.Bounds,
                new System.Drawing.StringFormat
                {
                    LineAlignment = System.Drawing.StringAlignment.Center,
                    Alignment = System.Drawing.StringAlignment.Center
                });
            e.Handled = true;
        };

        return token;
    }
}

// ── Grid with a grouped column: plain UIA only ever shows a generic "Group Row" placeholder for
//    the group header, never the real group value or item count — confirmed via probe. Separate
//    GridControl instance from devexpress-grid-ownerdraw (that one stays pinned/untouched as a
//    flat-row regression fixture).
internal sealed class GroupRowItem
{
    public string Category { get; set; } = "";
    public int Amount { get; set; }
}

internal static class GroupGridSection
{
    public static GridControl Build()
    {
        var grid = new GridControl { Name = "ElementsGroupGrid", Dock = DockStyle.Fill };
        var view = new GridView { GridControl = grid };
        grid.MainView = view;

        var rows = new List<GroupRowItem>
        {
            new() { Category = "Fruit", Amount = 10 },
            new() { Category = "Fruit", Amount = 20 },
            new() { Category = "Veg", Amount = 5 },
        };
        grid.DataSource = rows;

        var categoryColumn = view.Columns.AddField(nameof(GroupRowItem.Category));
        categoryColumn.Caption = "Category";
        categoryColumn.VisibleIndex = 0;
        categoryColumn.GroupIndex = 0;

        var amountColumn = view.Columns.AddField(nameof(GroupRowItem.Amount));
        amountColumn.Caption = "Amount";
        amountColumn.VisibleIndex = 1;

        grid.ForceInitialize();
        grid.CreateControl();
        return grid;
    }
}

internal sealed class MainForm : Form
{
    public MainForm()
    {
        Text = "DevExpress Elements Gallery";
        Width = 700;
        Height = 500;

        var tabs = new TabControl { Dock = DockStyle.Fill };

        var treeTab = new TabPage("TreeList");
        treeTab.Controls.Add(TreeListSection.Build());
        tabs.TabPages.Add(treeTab);

        var comboTab = new TabPage("Combo");
        var comboHost = new Panel { Dock = DockStyle.Fill };
        var combo = ComboSection.Build();
        combo.Location = new System.Drawing.Point(20, 20);
        comboHost.Controls.Add(combo);
        comboTab.Controls.Add(comboHost);
        tabs.TabPages.Add(comboTab);

        var tokenTab = new TabPage("Token");
        var tokenHost = new Panel { Dock = DockStyle.Fill };
        var token = TokenSection.Build();
        token.Location = new System.Drawing.Point(20, 20);
        tokenHost.Controls.Add(token);
        tokenTab.Controls.Add(tokenHost);
        tabs.TabPages.Add(tokenTab);

        var groupGridTab = new TabPage("GroupGrid");
        groupGridTab.Controls.Add(GroupGridSection.Build());
        tabs.TabPages.Add(groupGridTab);

        Controls.Add(tabs);
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
