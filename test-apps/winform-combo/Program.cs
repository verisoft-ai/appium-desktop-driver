using System;
using System.Windows.Forms;

namespace WinformCombo;

// Reproduces a real-world bug report: a plain WinForms ComboBox (DropDownList style)
// exposes ExpandCollapsePattern to the managed UIA2 client (System.Windows.Automation)
// but not to raw UIA3 COM interop — Expand() fails with "does not support
// ExpandCollapsePattern" over UIA3, forcing a managed-UIA2 fallback. See
// lib/commands/extension.ts patternExpand / expandViaManagedUia2.
public class MainForm : Form
{
    public ComboBox CmbCategories { get; }

    public MainForm()
    {
        Text = "Winform Combo Test";
        Width = 420;
        Height = 140;

        CmbCategories = new ComboBox
        {
            Name = "cmbCategories",
            DropDownStyle = ComboBoxStyle.DropDownList,
            Left = 20,
            Top = 20,
            Width = 300,
        };
        CmbCategories.Items.AddRange(new object[] { "Books", "Electronics", "Groceries", "Toys" });
        CmbCategories.SelectedIndex = 0;

        Controls.Add(CmbCategories);
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
