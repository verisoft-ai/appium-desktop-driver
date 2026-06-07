using System.Runtime.ExceptionServices;
using System.Windows.Forms;

namespace NovaUIAutomationServer.Jab;

/// <summary>
/// Hosts a dedicated STA thread with a running Windows message pump for the Java Access Bridge.
///
/// WAB requires two things that the server's main request loop cannot provide:
///   1. Windows_run() must be called on a thread that pumps Win32 messages.
///   2. All subsequent JabNative calls must originate from that same thread.
///
/// Without a message pump, WAB's hidden IPC window never receives the JVM's
/// WM_COPYDATA registration reply, so IsJavaWindow() always returns false.
/// </summary>
internal sealed class JabMessageThread : IDisposable
{
    private Control? _marshalTarget;
    private readonly ManualResetEventSlim _ready = new(false);
    private Exception? _startError;
    private bool _disposed;

    public void Start()
    {
        var thread = new Thread(() =>
        {
            try
            {
                JabNative.Windows_run();

                // A hidden Control created on this thread acts as the marshal target.
                // Control.Invoke posts a SendMessage to this HWND, which is processed
                // by the Application.Run() message loop below.
                _marshalTarget = new Control();
                _marshalTarget.CreateControl();
            }
            catch (Exception ex)
            {
                _startError = ex;
                _ready.Set();
                return;
            }

            // Signal ready only after the message loop is actually processing messages.
            // Application.Idle fires when the queue is first drained — i.e. Run() is live.
            EventHandler? idleHandler = null;
            idleHandler = (_, _) =>
            {
                Application.Idle -= idleHandler;
                _ready.Set();
            };
            Application.Idle += idleHandler;

            Application.Run(); // blocks; pumps Win32 messages until ExitThread()
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Name = "JabMessageThread";
        thread.Start();

        _ready.Wait();

        if (_startError != null)
            ExceptionDispatchInfo.Capture(_startError).Throw();
    }

    /// <summary>Synchronously invokes <paramref name="func"/> on the JAB message thread.</summary>
    public T Invoke<T>(Func<T> func)
    {
        if (_marshalTarget == null || !_marshalTarget.IsHandleCreated)
            throw new InvalidOperationException("JabMessageThread is not started.");

        T result = default!;
        Exception? ex = null;

        _marshalTarget.Invoke(new Action(() =>
        {
            try { result = func(); }
            catch (Exception e) { ex = e; }
        }));

        if (ex != null)
            ExceptionDispatchInfo.Capture(ex).Throw();

        return result;
    }

    public void Invoke(Action action) => Invoke<object?>(() => { action(); return null; });

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            if (_marshalTarget?.IsHandleCreated == true)
                _marshalTarget.Invoke(new Action(Application.ExitThread));
        }
        catch { }

        _ready.Dispose();
    }
}
