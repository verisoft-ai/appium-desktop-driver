#nullable enable
using System;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;

namespace WpfDataGridTemplate;

// No-DevExpress-dependency permanent fixture for the .NET bridge's WPF grid path, following the
// same discipline as test-apps/devexpress-grid-ownerdraw/ (bound columns visible, one column
// genuinely UIA-blind) but self-contained — a plain System.Windows.Controls.DataGrid with a
// DataGridTemplateColumn whose cell content is a custom FrameworkElement that paints its own text
// via OnRender and returns a null AutomationPeer (same convention as
// test-apps/wpf-minimal/Program.cs's OwnerDrawListFixture). Proves the .NET bridge reads real WPF
// grid-cell content that plain UIA genuinely cannot see, without depending on the DevExpress
// toolchain/license the way test-apps/devexpress-grid-ownerdraw/ does.

internal sealed class RowItem
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "";
}

// OnRender-painted cell content with a suppressed AutomationPeer — genuinely invisible to plain
// UIA, unlike a real DataGridTemplateColumn TextBlock (which WPF's own DataGridCellAutomationPeer
// would surface). The "Text" property name is deliberate: it's what
// dotnet-bridge-agent/BridgeAgent.cpp's Reflector::BuildInfo generic FrameworkElement branch
// already reflects for, so this fixture needs zero new bridge code.
internal sealed class StatusCellFixture : FrameworkElement
{
    public static readonly DependencyProperty StatusProperty = DependencyProperty.Register(
        nameof(Status), typeof(string), typeof(StatusCellFixture),
        new FrameworkPropertyMetadata("", FrameworkPropertyMetadataOptions.AffectsRender));

    public string Status
    {
        get => (string)GetValue(StatusProperty);
        set => SetValue(StatusProperty, value);
    }

    public string Text => Status;

    public StatusCellFixture()
    {
        Width = 140;
        Height = 24;
    }

    protected override void OnRender(DrawingContext dc)
    {
        var backColor = Status switch
        {
            "Healthy" => Brushes.LightGreen,
            "Degraded" => Brushes.Khaki,
            _ => Brushes.LightCoral,
        };
        dc.DrawRectangle(backColor, null, new Rect(0, 0, Width, Height));
        var formatted = new FormattedText(
            Status, CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
            new Typeface("Segoe UI"), 13, Brushes.Black, VisualTreeHelper.GetDpi(this).PixelsPerDip);
        dc.DrawText(formatted, new Point(6, (Height - formatted.Height) / 2));
    }

    protected override AutomationPeer? OnCreateAutomationPeer() => null;
}

internal sealed class MainWindow : Window
{
    private static readonly string[] StatusValues = { "Healthy", "Degraded", "Offline" };

    public DataGrid Grid { get; }

    public MainWindow()
    {
        Title = "WPF DataGrid Template Fixture";
        Width = 500;
        Height = 320;

        var rows = new ObservableCollection<RowItem>
        {
            new() { Id = 1, Name = "Alpha", Status = StatusValues[0] },
            new() { Id = 2, Name = "Bravo", Status = StatusValues[1] },
            new() { Id = 3, Name = "Charlie", Status = StatusValues[2] },
        };

        Grid = new DataGrid
        {
            Name = "MainGrid",
            ItemsSource = rows,
            AutoGenerateColumns = false,
            CanUserAddRows = false,
            IsReadOnly = true,
        };

        Grid.Columns.Add(new DataGridTextColumn { Header = "Id", Binding = new Binding(nameof(RowItem.Id)) });
        Grid.Columns.Add(new DataGridTextColumn { Header = "Name", Binding = new Binding(nameof(RowItem.Name)) });

        var statusColumn = new DataGridTemplateColumn { Header = "Status" };
        var factory = new FrameworkElementFactory(typeof(StatusCellFixture));
        factory.SetBinding(StatusCellFixture.StatusProperty, new Binding(nameof(RowItem.Status)));
        statusColumn.CellTemplate = new DataTemplate { VisualTree = factory };
        Grid.Columns.Add(statusColumn);

        Content = Grid;
    }
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        var app = new Application();
        app.Run(new MainWindow());
    }
}
