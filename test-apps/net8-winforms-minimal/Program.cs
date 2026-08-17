namespace Net8WinformsMinimal;

// Minimal fixture proving the target is really CoreCLR, not Framework — see
// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md. Same shape as test-apps/winform-combo and
// test-apps/wpf-minimal (TextBox, Button, owner-drawn list) so the bridge's existing
// setValue/invoke/selectElement assertions carry over unchanged once the CoreCLR attach path
// is fully verified — only the runtime this exe loads (coreclr.dll via net8.0-windows) differs.

// Owner-drawn list following the bridge's generic reflection convention (ItemCount/GetItemText/
// SelectItem — see Reflector.TryGetOwnerDrawListItems in dotnet-bridge-agent-core, matched by
// member name only). AccessibleName blanked so plain UIA can't see the painted text at all,
// mirroring the WinForms/WPF fixtures' own "prove the bridge, not UIA, is reading this" setup.
public sealed class OwnerDrawListFixture : Control
{
    private const int RowHeight = 24;
    private readonly string[] _items = { "Apple", "Banana", "Cherry" };

    public int ItemCount => _items.Length;
    public int SelectedIndex { get; private set; } = -1;

    public OwnerDrawListFixture()
    {
        Name = "ListFixture";
        Size = new Size(160, RowHeight * _items.Length);
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        AccessibleName = string.Empty;
    }

    public string GetItemText(int index) => _items[index];

    public void SelectItem(int index)
    {
        SelectedIndex = index;
        Invalidate();
    }

    public Rectangle GetItemBounds(int index) => new(0, index * RowHeight, Width, RowHeight);

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        int index = e.Y / RowHeight;
        if (index >= 0 && index < _items.Length) SelectItem(index);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        for (int i = 0; i < _items.Length; i++)
        {
            var rowRect = new Rectangle(0, i * RowHeight, Width, RowHeight);
            using var backBrush = new SolidBrush(i == SelectedIndex ? Color.LightBlue : Color.White);
            e.Graphics.FillRectangle(backBrush, rowRect);
            TextRenderer.DrawText(e.Graphics, _items[i], Font, rowRect, Color.Black,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
        }
    }
}

public sealed class MainForm : Form
{
    public TextBox TxtInput { get; }
    public Button BtnClick { get; }
    public Label LblClickCount { get; }
    public OwnerDrawListFixture ListFixture { get; }

    private int _clickCount;

    public MainForm()
    {
        Text = "net8 WinForms Minimal Fixture (CoreCLR bridge target)";
        Width = 320;
        Height = 320;

        TxtInput = new TextBox { Name = "TxtInput", Left = 20, Top = 20, Width = 200, Height = 24 };
        LblClickCount = new Label { Name = "LblClickCount", Text = "Clicked: 0", Left = 20, Top = 100, Width = 200, Height = 24 };

        BtnClick = new Button { Name = "BtnClick", Text = "Click Me", Left = 20, Top = 60, Width = 100, Height = 28 };
        BtnClick.Click += (_, _) =>
        {
            _clickCount++;
            LblClickCount.Text = $"Clicked: {_clickCount}";
        };

        ListFixture = new OwnerDrawListFixture { Left = 20, Top = 140 };

        Controls.Add(TxtInput);
        Controls.Add(BtnClick);
        Controls.Add(LblClickCount);
        Controls.Add(ListFixture);
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        // The profiler's anchor candidate list (ProfilerCallback.cpp) tries
        // System.Windows.Forms.Application::Run first — this call is the reason this fixture
        // exists rather than reusing winform-combo directly (that one targets net48/clr.dll).
        Application.Run(new MainForm());
    }
}
