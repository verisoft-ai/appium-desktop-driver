#nullable enable
using System;
using System.Windows;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace WpfMinimal;

// Minimal fixture for the .NET bridge's WPF Dispatcher-marshaling fix (see
// dotnet-bridge-agent/BridgeAgent.cpp Reflector::FindWpfDispatcher / BridgeServer::RunOnUiThread).
// Plays the same role for WPF that test-apps/minimal-ownerdraw-winforms/ played for the original
// WinForms marshaling fix in commit 556c382 — no DevExpress dependency, real WPF thread affinity
// (unlike WinForms, WPF throws outright when a DependencyObject is touched off its owning
// Dispatcher, so this fixture proves the fix rather than merely exercising it).

// Owner-drawn list following the bridge's generic reflection convention (ItemCount/GetItemText/
// SelectItem — see Reflector::TryGetOwnerDrawListItems, matched by member name only, already
// framework-agnostic). OnCreateAutomationPeer returns null so plain UIA can't see the painted
// text at all — the WPF equivalent of blanking AccessibleName on the WinForms fixtures.
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
        Title = "WPF Minimal Fixture";
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
