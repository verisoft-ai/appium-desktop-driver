#nullable enable
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Windows.Automation;
using System.Windows.Automation.Provider;

namespace WinformCombo;

// Fabricated raw UIA provider proving the driver's uuid fallback
// (NovaUIAutomationServer SessionState.SaveElementAndReturnId) for elements
// with no native RuntimeId. Plain WinForms controls always get one from
// Windows' built-in MSAA-to-UIA bridge (verified empirically — every stock
// control here returns a real 2-part id), so there's no way to hit that
// fallback with an ordinary control. This item is a UIA fragment with no
// backing HWND of its own — nothing auto-derives a RuntimeId for it, so
// GetRuntimeId() below returns exactly what we tell it to: null.
internal sealed class NoRuntimeIdItemProvider : IRawElementProviderSimple, IRawElementProviderFragment
{
    private readonly Control _host;
    private readonly NoRuntimeIdHostProvider _root;

    public NoRuntimeIdItemProvider(Control host, NoRuntimeIdHostProvider root)
    {
        _host = host;
        _root = root;
    }

    public ProviderOptions ProviderOptions => ProviderOptions.ServerSideProvider;

    public object? GetPatternProvider(int patternId) => null;

    public object? GetPropertyValue(int propertyId)
    {
        if (propertyId == AutomationElementIdentifiers.NameProperty.Id) return "No RuntimeId Item";
        if (propertyId == AutomationElementIdentifiers.AutomationIdProperty.Id) return "noRuntimeIdItem";
        if (propertyId == AutomationElementIdentifiers.ControlTypeProperty.Id) return ControlType.Text.Id;
        if (propertyId == AutomationElementIdentifiers.IsContentElementProperty.Id) return true;
        if (propertyId == AutomationElementIdentifiers.IsControlElementProperty.Id) return true;
        return null;
    }

    public IRawElementProviderSimple? HostRawElementProvider => null;

    public System.Windows.Rect BoundingRectangle
    {
        get
        {
            var r = _host.RectangleToScreen(_host.ClientRectangle);
            return new System.Windows.Rect(r.Left, r.Top, r.Width, r.Height);
        }
    }

    public IRawElementProviderSimple[]? GetEmbeddedFragmentRoots() => null;

    public int[]? GetRuntimeId() => null;

    public IRawElementProviderFragment? Navigate(NavigateDirection direction) => null;

    public void SetFocus() { }

    public IRawElementProviderFragmentRoot FragmentRoot => _root;
}

// Root of the raw provider — this one keeps GetRuntimeId() == null too, but
// that's the *normal*, spec-compliant case (an HWND-backed fragment root
// lets UIA auto-derive its id from the window handle). Only the child item
// above is the fabricated no-runtime-id case under test.
internal sealed class NoRuntimeIdHostProvider : IRawElementProviderSimple, IRawElementProviderFragment, IRawElementProviderFragmentRoot
{
    private readonly Control _host;
    private readonly NoRuntimeIdItemProvider _item;

    public NoRuntimeIdHostProvider(Control host)
    {
        _host = host;
        _item = new NoRuntimeIdItemProvider(host, this);
    }

    public ProviderOptions ProviderOptions => ProviderOptions.ServerSideProvider;

    public object? GetPatternProvider(int patternId) => null;

    public object? GetPropertyValue(int propertyId)
    {
        if (propertyId == AutomationElementIdentifiers.NameProperty.Id) return "NoRuntimeIdHost";
        if (propertyId == AutomationElementIdentifiers.AutomationIdProperty.Id) return "noRuntimeIdHost";
        if (propertyId == AutomationElementIdentifiers.ControlTypeProperty.Id) return ControlType.Pane.Id;
        return null;
    }

    public IRawElementProviderSimple? HostRawElementProvider =>
        AutomationInteropProvider.HostProviderFromHandle(_host.Handle);

    public System.Windows.Rect BoundingRectangle
    {
        get
        {
            var r = _host.RectangleToScreen(_host.ClientRectangle);
            return new System.Windows.Rect(r.Left, r.Top, r.Width, r.Height);
        }
    }

    public IRawElementProviderSimple[]? GetEmbeddedFragmentRoots() => null;

    public int[]? GetRuntimeId() => null;

    public IRawElementProviderFragment? Navigate(NavigateDirection direction) =>
        direction is NavigateDirection.FirstChild or NavigateDirection.LastChild ? _item : null;

    public void SetFocus() { }

    public IRawElementProviderFragment? ElementProviderFromPoint(double x, double y) => _item;

    public IRawElementProviderFragment? GetFocus() => null;

    public IRawElementProviderFragmentRoot FragmentRoot => this;
}

public class NoRuntimeIdHost : Control
{
    private const int WM_GETOBJECT = 0x003D;
    private const string LabelText = "NO RUNTIMEID ITEM (fabricated, empty RuntimeId)";

    private readonly NoRuntimeIdHostProvider _provider;

    public NoRuntimeIdHost()
    {
        Name = "noRuntimeIdHost";
        Size = new Size(360, 30);
        BackColor = Color.LightYellow;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        _provider = new NoRuntimeIdHostProvider(this);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        using var border = new Pen(Color.DarkOrange, 2);
        e.Graphics.DrawRectangle(border, 1, 1, Width - 3, Height - 3);
        TextRenderer.DrawText(e.Graphics, LabelText, Font, ClientRectangle, Color.Black,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_GETOBJECT)
        {
            m.Result = AutomationInteropProvider.ReturnRawElementProvider(Handle, m.WParam, m.LParam, _provider);
            return;
        }
        base.WndProc(ref m);
    }
}

// Minimal repro for the SendInput KEYEVENTF_EXTENDEDKEY bug (see
// lib/winapi/user32.ts isExtendedKeyVk / EXTENDED_KEYS).
//
// Empirically, on this OS build, an unflagged VK_DOWN SendInput event while
// NumLock is ON is not redelivered as VK_NUMPAD2 — it is dropped before any
// WM_KEYDOWN/WM_CHAR/WM_SYSKEYDOWN reaches this process's message queue at
// all (verified by tracing every keyboard message type unconditionally: none
// arrive). That matches the original bug report better than a "types a
// stray 2" theory would: the dropdown just silently never opened, no
// unexpected character ever appeared anywhere. The lParam-extended-bit
// check below is kept as defensive alternative-manifestation handling
// (documented Windows behavior on other configurations/OS builds), but the
// counter staying at 0 is what this repro actually demonstrates.
//
// Uses an application-wide IMessageFilter rather than Form.WndProc — a
// WM_KEYDOWN goes to whichever control currently has focus (the TextBox),
// not to the top-level Form's own window, so Form.WndProc alone would never
// see it. The message filter sees every message before it's dispatched to
// any window, matching how a real low-level keyboard hook would observe it.
public class KeyDownFilter : IMessageFilter
{
    private const int WM_KEYDOWN = 0x0100;
    private const int VK_DOWN = 0x28;
    private const int VK_NUMLOCK = 0x90;
    private const int EXTENDED_KEY_BIT = 1 << 24;

    [DllImport("user32.dll")]
    private static extern short GetKeyState(int nVirtKey);

    private readonly MainForm _form;

    public KeyDownFilter(MainForm form)
    {
        _form = form;
    }

    public bool PreFilterMessage(ref Message m)
    {
        if (m.Msg != WM_KEYDOWN || m.WParam.ToInt64() != VK_DOWN)
        {
            return false;
        }

        bool extended = (m.LParam.ToInt64() & EXTENDED_KEY_BIT) != 0;
        bool numLockOn = (GetKeyState(VK_NUMLOCK) & 1) != 0;

        // Legacy WinForms/MFC idiom: only trust wParam as "the real arrow
        // key" if the extended bit is set OR NumLock is off (numpad keys
        // behave as navigation anyway when NumLock is off, so there's no
        // ambiguity to resolve in that case). Otherwise treat it as if the
        // numpad-2 key had been pressed. See the class comment — on this OS
        // build the message never reaches here at all in that case, so this
        // branch is defensive rather than the primary observed behavior.
        if (!extended && numLockOn)
        {
            _form.AppendLog("2");
        }
        else
        {
            _form.IncrementRealDownCount();
        }

        return true; // swallow — don't let the TextBox move its own cursor
    }
}

public class MainForm : Form
{
    public TextBox TxtLog { get; }
    public Label LblRealDownCount { get; }

    private int _realDownCount;

    public MainForm()
    {
        Text = "Extended-Key Repro";
        Width = 420;
        Height = 240;

        TxtLog = new TextBox
        {
            Name = "txtLog",
            Left = 20,
            Top = 20,
            Width = 360,
            Height = 60,
            Multiline = true,
        };

        LblRealDownCount = new Label
        {
            Name = "lblRealDownCount",
            Left = 20,
            Top = 100,
            Width = 360,
            Height = 30,
            Text = "Real Down received: 0",
        };

        Controls.Add(TxtLog);
        Controls.Add(LblRealDownCount);
        Controls.Add(new NoRuntimeIdHost { Left = 20, Top = 140 });

        Application.AddMessageFilter(new KeyDownFilter(this));
    }

    public void AppendLog(string text) => TxtLog.AppendText(text);

    public void IncrementRealDownCount()
    {
        _realDownCount++;
        LblRealDownCount.Text = $"Real Down received: {_realDownCount}";
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
