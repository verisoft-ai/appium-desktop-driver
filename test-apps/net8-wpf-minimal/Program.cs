#nullable enable
using System;
using System.Windows;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace Net8WpfMinimal;

// CoreCLR (.NET 8) twin of test-apps/wpf-minimal (which targets net48/clr.dll) and sibling of
// test-apps/net8-winforms-minimal (which targets this same coreclr.dll but exercises the profiler's
// only anchor candidate, Control.WndProc). This fixture deliberately has NO System.Windows.Forms
// reference, so it reproduces the anchor-discovery gap the WinForms fixture can't: a real .NET 8
// process that never loads System.Windows.Forms.dll at all.

// Owner-drawn list following the bridge's generic reflection convention (ItemCount/GetItemText/
// SelectItem — see Reflector.TryGetOwnerDrawListItems in dotnet-bridge-agent-core, matched by
// member name only). OnCreateAutomationPeer returns null so plain UIA can't see the painted text,
// mirroring wpf-minimal's own "prove the bridge, not UIA, is reading this" setup.
internal sealed class OwnerDrawListFixture : FrameworkElement
{
    private const double RowHeight = 24;
    private readonly string[] _items = { "Apple", "Banana", "Cherry" };

    public int ItemCount => _items.Length;
    public int SelectedIndex { get; private set; } = -1;

    public OwnerDrawListFixture()
    {
        Width = 160;
        Height = RowHeight * _items.Length;
        Focusable = true;
    }

    public string GetItemText(int index) => _items[index];

    public void SelectItem(int index)
    {
        SelectedIndex = index;
        InvalidateVisual();
    }

    protected override void OnMouseDown(MouseButtonEventArgs e)
    {
        base.OnMouseDown(e);
        int index = (int)(e.GetPosition(this).Y / RowHeight);
        if (index >= 0 && index < _items.Length)
        {
            SelectItem(index);
        }
    }

    protected override void OnRender(DrawingContext dc)
    {
        var typeface = new Typeface("Segoe UI");
        for (int i = 0; i < _items.Length; i++)
        {
            var rowRect = new Rect(0, i * RowHeight, Width, RowHeight);
            dc.DrawRectangle(i == SelectedIndex ? Brushes.LightBlue : Brushes.White, null, rowRect);
            var formatted = new FormattedText(
                _items[i], System.Globalization.CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                typeface, 14, Brushes.Black, VisualTreeHelper.GetDpi(this).PixelsPerDip);
            dc.DrawText(formatted, new Point(6, rowRect.Top + (RowHeight - formatted.Height) / 2));
        }
    }

    protected override AutomationPeer? OnCreateAutomationPeer() => null;
}

internal sealed class MainWindow : Window
{
    public TextBox TxtInput { get; }
    public Button BtnClick { get; }
    public TextBlock LblClickCount { get; }
    public OwnerDrawListFixture ListFixture { get; }

    private int _clickCount;

    public MainWindow()
    {
        Title = "net8 WPF Minimal Fixture (CoreCLR bridge target)";
        Width = 320;
        Height = 320;

        TxtInput = new TextBox { Name = "TxtInput", Width = 200, Height = 24, Margin = new Thickness(20, 20, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };

        BtnClick = new Button { Name = "BtnClick", Content = "Click Me", Width = 100, Height = 28, Margin = new Thickness(20, 60, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
        BtnClick.Click += (_, _) =>
        {
            _clickCount++;
            LblClickCount.Text = $"Clicked: {_clickCount}";
        };

        LblClickCount = new TextBlock { Name = "LblClickCount", Text = "Clicked: 0", Margin = new Thickness(20, 100, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };

        ListFixture = new OwnerDrawListFixture { Name = "ListFixture", Margin = new Thickness(20, 140, 0, 0), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };

        var root = new Grid();
        root.Children.Add(TxtInput);
        root.Children.Add(BtnClick);
        root.Children.Add(LblClickCount);
        root.Children.Add(ListFixture);
        Content = root;
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
