#nullable enable
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using DevExpress.XtraGrid;
using DevExpress.XtraGrid.Columns;
using DevExpress.XtraGrid.Views.Grid;
using DevExpress.XtraGrid.Views.Grid.ViewInfo;
using DevExpress.XtraGrid.Views.Base;
using DevExpress.Data;

namespace DevExpressGridOwnerDraw;

internal sealed class RowItem
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

// Minimal, purpose-built fixture (not a cloned DevExpress-Examples repo) for testing the .NET
// injection bridge. Two prior fixtures (a WPF TreeList, a WinForms XtraTreeList) both turned out
// to already be visible to plain UIA via DevExpress's own AccessibleObject support — this fixture
// exists to reproduce the actual "invisible to UIA" scenario the bridge targets. Confirmed
// empirically: plain UIA shows only a generic "Status row N" (and even "Id row N"/"Name row N" for
// genuinely *bound* columns) via the Name/Value/HelpText properties — DevExpress's XtraGrid
// AccessibleObject just doesn't surface real cell text to UIA, bound or unbound. The "Status"
// column's real value is wired via CustomUnboundColumnData (reachable through GridView's own API,
// e.g. GetRowCellValue — what the bridge's Reflector reads) and CustomDrawCell paints the same
// value manually (proving the render path is independent of whatever UIA does or doesn't see).
internal sealed class MainForm : Form
{
    private readonly GridControl _grid = new();
    private readonly GridView _view = new();

    // Deliberately not exposed via any bound column — this is what the "Status" column paints,
    // and it's the value a UIA-blind cell would need the bridge to read.
    private static readonly string[] StatusValues = { "Healthy", "Degraded", "Offline" };

    public MainForm()
    {
        Text = "DevExpress Grid OwnerDraw Fixture";
        Width = 500;
        Height = 350;

        var rows = new List<RowItem>
        {
            new() { Id = 1, Name = "Alpha" },
            new() { Id = 2, Name = "Bravo" },
            new() { Id = 3, Name = "Charlie" },
        };

        _grid.Dock = DockStyle.Fill;
        _grid.MainView = _view;
        _grid.DataSource = rows;
        _grid.Name = "MainGrid";

        _view.GridControl = _grid;
        _view.OptionsView.ShowGroupPanel = false;
        _view.OptionsBehavior.Editable = false;

        var idColumn = _view.Columns.AddField(nameof(RowItem.Id));
        idColumn.VisibleIndex = 0;
        idColumn.Caption = "Id";

        var nameColumn = _view.Columns.AddField(nameof(RowItem.Name));
        nameColumn.VisibleIndex = 1;
        nameColumn.Caption = "Name";

        var statusColumn = _view.Columns.AddField("colStatus");
        statusColumn.Caption = "Status";
        statusColumn.UnboundType = UnboundColumnType.String;
        statusColumn.VisibleIndex = 2;
        statusColumn.Visible = true;

        _view.CustomUnboundColumnData += OnCustomUnboundColumnData;
        _view.CustomDrawCell += OnCustomDrawCell;

        Controls.Add(_grid);

        Shown += (_, _) =>
        {
            var t = new System.Windows.Forms.Timer { Interval = 1500 };
            t.Tick += (_, _) =>
            {
                t.Stop();
                var val1 = _view.GetRowCellValue(0, statusColumn);
                var val2 = _view.GetRowCellValue(0, "colStatus");
                var val3 = _view.GetRowCellDisplayText(0, statusColumn);
                System.IO.File.AppendAllText(
                    System.IO.Path.Combine(System.IO.Path.GetTempPath(), "devexpress-loadtest-debug.log"),
                    $"byColumn='{val1}' byFieldName='{val2}' displayText='{val3}'\n");
            };
            t.Start();
        };
    }

    private void OnCustomUnboundColumnData(object? sender, CustomColumnDataEventArgs e)
    {
        System.IO.File.AppendAllText(
            System.IO.Path.Combine(System.IO.Path.GetTempPath(), "devexpress-unbound-debug.log"),
            $"col={e.Column.Name} isGetData={e.IsGetData} rowIdx={e.ListSourceRowIndex} thread={System.Threading.Thread.CurrentThread.ManagedThreadId}\n");
        if (e.Column.FieldName != "colStatus" || e.IsGetData is false) return;
        e.Value = StatusValues[e.ListSourceRowIndex % StatusValues.Length];
        System.IO.File.AppendAllText(
            System.IO.Path.Combine(System.IO.Path.GetTempPath(), "devexpress-unbound-debug.log"),
            $"  set e.Value='{e.Value}'\n");
    }

    private void OnCustomDrawCell(object? sender, RowCellCustomDrawEventArgs e)
    {
        if (e.Column.FieldName != "colStatus") return;

        string status = StatusValues[e.RowHandle % StatusValues.Length];
        e.Cache.FillRectangle(System.Drawing.Brushes.White, e.Bounds);
        e.Cache.DrawString(status, e.Appearance.Font, System.Drawing.Brushes.Black, e.Bounds,
            new StringFormat { LineAlignment = StringAlignment.Center });
        e.Handled = true;
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
