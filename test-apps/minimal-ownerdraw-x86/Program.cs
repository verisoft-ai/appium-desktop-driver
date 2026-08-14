#nullable enable
using System;
using System.Drawing;
using System.Windows.Forms;

namespace MinimalOwnerDrawX86;

// 32-bit twin of test-apps/minimal-ownerdraw-winforms/ — same StatusIndicator pattern, but built
// with PlatformTarget=x86 so it genuinely runs as a 32-bit (WOW64) process. Exists to prove the
// bridge's x86 injection path (BridgeInjectorX86Stub) end to end, not just that it compiles.
// See minimal-ownerdraw-winforms/Program.cs for why this specific pattern (plain Control subclass,
// manual paint, blanked AccessibleName) reproduces "invisible to UIA" without any 3rd-party dep.
internal sealed class StatusIndicator : Control
{
    public StatusIndicator()
    {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        Size = new Size(160, 40);
        Text = "Healthy"; // ground truth the bridge must read; never painted by the base class
        AccessibleName = string.Empty;
        AccessibleRole = AccessibleRole.None;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var color = Text switch
        {
            "Healthy" => Color.LightGreen,
            "Degraded" => Color.Khaki,
            _ => Color.LightCoral,
        };
        e.Graphics.FillRectangle(new SolidBrush(color), ClientRectangle);
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Color.Black,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

internal sealed class MainForm : Form
{
    public MainForm()
    {
        Text = "Minimal OwnerDraw Fixture (x86)";
        Width = 300;
        Height = 200;

        var indicator = new StatusIndicator { Name = "Status1", Location = new Point(60, 70) };
        Controls.Add(indicator);
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
