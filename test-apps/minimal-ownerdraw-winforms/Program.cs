#nullable enable
using System;
using System.Drawing;
using System.Windows.Forms;

namespace MinimalOwnerDraw;

// Minimal fixture for the .NET injection bridge: one control, no third-party dependency, no
// license. A plain Control subclass never auto-renders Text (only Label/Button do that), so
// painting it manually is enough to reproduce "custom-drawn, invisible to UIA" without any
// DevExpress-style framework. AccessibleName is blanked so UIA can't fall back to Text either.
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
        Text = "Minimal OwnerDraw Fixture";
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
