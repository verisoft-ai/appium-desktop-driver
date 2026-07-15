using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace WinformCombo;

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
        Height = 200;

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
