using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;
using System.Windows.Threading;

namespace AppiumDotNetBridgeCore;

/// <summary>
/// TCP JSON-RPC server — direct port of BridgeAgent.cpp's BridgeServer ref class. Same
/// newline-delimited protocol, same port-file handshake, so BridgeAgentService.cs on the host
/// side needs no changes to talk to either agent.
/// </summary>
internal static class BridgeServer
{
    public static void Run()
    {
        ElementRegistry.Pid = Environment.ProcessId;

        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;

        string portFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{ElementRegistry.Pid}.port");
        File.WriteAllText(portFile, port.ToString());

        while (true)
        {
            TcpClient client = listener.AcceptTcpClient();
            var thread = new Thread(HandleClient) { IsBackground = true };
            thread.Start(client);
        }
    }

    private static void HandleClient(object? clientObj)
    {
        var client = (TcpClient)clientObj!;
        try
        {
            var stream = client.GetStream();
            var reader = new StreamReader(stream, Encoding.UTF8);
            var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };

            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                string response = HandleLine(line);
                writer.WriteLine(response);
            }
        }
        catch (Exception)
        {
            // Client disconnected or malformed input — just close this connection.
        }
        finally
        {
            client.Close();
        }
    }

    private static string HandleLine(string line)
    {
        var request = Json.Parse(line) as Dictionary<string, object?>;
        object? idObj = request != null && request.TryGetValue("id", out var id) ? id : null;
        try
        {
            string? command = request != null && request.TryGetValue("command", out var c) ? c as string : null;
            var cmdParams = request != null && request.TryGetValue("params", out var p) ? p as Dictionary<string, object?> : null;

            // WPF enforces thread affinity on property reads too, not just mutation, so every
            // command marshals via the WPF dispatcher when present. No-op for WinForms/DevExpress
            // (Application.Current is null there). Fully qualified: "using System.Windows.Forms"
            // shadows "Application" with the WinForms one, which has no Current property.
            object? result;
            Dispatcher? wpfDispatcher = System.Windows.Application.Current?.Dispatcher;
            if (wpfDispatcher != null && !wpfDispatcher.CheckAccess())
                result = wpfDispatcher.Invoke(() => Dispatch(command, cmdParams));
            else
                result = Dispatch(command, cmdParams);

            var response = new Dictionary<string, object?> { ["id"] = idObj, ["result"] = result };
            return Json.Write(response);
        }
        catch (Exception ex)
        {
            var response = new Dictionary<string, object?> { ["id"] = idObj, ["error"] = ex.Message };
            return Json.Write(response);
        }
    }

    private static object? Dispatch(string? command, Dictionary<string, object?>? cmdParams)
    {
        if (command == "getWindowRoot")
        {
            double hwndVal = cmdParams != null && cmdParams.TryGetValue("hwnd", out var h) ? (double)h! : 0.0;
            object? root = Reflector.GetWindowRoot((long)hwndVal);
            return root == null ? null : ElementToResultDict(root);
        }
        if (command == "getChildren")
        {
            object target = RequireElement(cmdParams);
            var children = Reflector.GetChildren(target);
            var results = new List<object?>();
            foreach (var child in children)
                results.Add(ElementToResultDict(child));
            return results;
        }
        if (command == "getInfo")
        {
            object target = RequireElement(cmdParams);
            return Reflector.BuildInfo(target);
        }
        if (command == "findFirst" || command == "findAll")
        {
            string? rootId = cmdParams != null && cmdParams.TryGetValue("rootId", out var r) ? r as string : null;
            object? root = ElementRegistry.Get(rootId);
            if (root == null) return command == "findAll" ? new List<object?>() : null;
            object? condition = cmdParams != null && cmdParams.TryGetValue("condition", out var cond) ? cond : null;

            var matches = new List<string>();
            CollectMatches(root, condition, matches, command == "findFirst", 0);

            if (command == "findFirst")
                return matches.Count > 0 ? matches[0] : null;

            return new List<object?>(matches);
        }
        if (command == "getValue")
        {
            object target = RequireElement(cmdParams);
            var info = Reflector.BuildInfo(target);
            return info.TryGetValue("Value", out var v) ? v : (info.TryGetValue("Name", out var n) ? n : "");
        }
        if (command == "setValue")
        {
            object target = RequireElement(cmdParams);
            string value = cmdParams != null && cmdParams.TryGetValue("value", out var v) ? (string)v! : "";
            RunOnUiThread(target, UiThreadCommandKind.SetValue, value);
            return null;
        }
        if (command == "invoke")
        {
            object target = RequireElement(cmdParams);
            RunOnUiThread(target, UiThreadCommandKind.Invoke, null);
            return null;
        }
        if (command == "selectElement")
        {
            object target = RequireElement(cmdParams);
            RunOnUiThread(target, UiThreadCommandKind.Select, null);
            return null;
        }
        if (command == "expandElement")
        {
            object target = RequireElement(cmdParams);
            RunOnUiThread(target, UiThreadCommandKind.Expand, null);
            return null;
        }
        if (command == "requestFocus")
        {
            object target = RequireElement(cmdParams);
            RunOnUiThread(target, UiThreadCommandKind.RequestFocus, null);
            return null;
        }
        if (command == "getToggleState")
        {
            object target = RequireElement(cmdParams);
            var checkedProp = target.GetType().GetProperty("Checked");
            if (checkedProp != null)
            {
                object? val = checkedProp.GetValue(target);
                bool isChecked = val is bool b && b;
                return isChecked ? "On" : "Off";
            }
            return "Off";
        }
        if (command == "isAlive")
        {
            string? id = cmdParams != null && cmdParams.TryGetValue("id", out var i) ? i as string : null;
            return ElementRegistry.Get(id) != null;
        }

        throw new InvalidOperationException($"Unknown command: {command}");
    }

    private enum UiThreadCommandKind { Invoke, Select, Expand, SetValue, RequestFocus }

    // Marshals a mutating Reflector call onto the real UI thread when one can be found near the
    // target — mirrors BridgeAgent.cpp's RunOnUiThread. Falls back to running inline only when
    // neither a WinForms Control nor a WPF Dispatcher can be found for the target.
    private static void RunOnUiThread(object target, UiThreadCommandKind kind, string? value)
    {
        void Run()
        {
            switch (kind)
            {
                case UiThreadCommandKind.Invoke: Reflector.Invoke(target); break;
                case UiThreadCommandKind.Select: Reflector.Select(target); break;
                case UiThreadCommandKind.Expand: Reflector.Expand(target); break;
                case UiThreadCommandKind.SetValue: Reflector.SetValue(target, value ?? ""); break;
                case UiThreadCommandKind.RequestFocus:
                    if (target is Control ctrlTarget) ctrlTarget.Focus();
                    else if (target is System.Windows.UIElement elemTarget) elemTarget.Focus();
                    break;
            }
        }

        Control? ctrl = Reflector.FindUiThreadControl(target);
        if (ctrl != null && ctrl.IsHandleCreated && ctrl.InvokeRequired)
        {
            ctrl.Invoke(Run);
            return;
        }

        Dispatcher? dispatcher = Reflector.FindWpfDispatcher(target);
        if (dispatcher != null && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(Run);
            return;
        }

        Run();
    }

    private static object RequireElement(Dictionary<string, object?>? cmdParams)
    {
        string? id = cmdParams != null && cmdParams.TryGetValue("id", out var i) ? i as string : null;
        object? target = id != null ? ElementRegistry.Get(id) : null;
        if (target == null) throw new InvalidOperationException($"Unknown element id: {id}");
        return target;
    }

    private static Dictionary<string, object?> ElementToResultDict(object target)
    {
        string id = ElementRegistry.Save(target);
        var info = Reflector.BuildInfo(target);
        var result = new Dictionary<string, object?>(info) { ["id"] = id };
        return result;
    }

    // depth-capped recursive walk — same 100-level guard as the Framework agent and
    // JavaAgentService.BuildXmlRecursive on the host side.
    private static void CollectMatches(object node, object? condition, List<string> results, bool stopAtFirst, int depth)
    {
        if (depth > 100) return;
        if (Reflector.MatchesCondition(node, condition))
        {
            results.Add(ElementRegistry.Save(node));
            if (stopAtFirst) return;
        }
        foreach (var child in Reflector.GetChildren(node))
        {
            CollectMatches(child, condition, results, stopAtFirst, depth + 1);
            if (stopAtFirst && results.Count > 0) return;
        }
    }
}
