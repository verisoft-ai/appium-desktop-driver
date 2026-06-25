using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Xml;
using NovaUIAutomationServer.Protocol;

namespace NovaUIAutomationServer.Java;

/// <summary>
/// Client that communicates with the AppiumDesktopAgent running inside the target JVM.
/// Replaces JabService — no WindowsAccessBridge-64.dll required.
/// Protocol: newline-delimited JSON-RPC over loopback TCP.
/// </summary>
internal sealed class JavaAgentService : IDisposable
{
    private TcpClient? _tcp;
    private StreamWriter? _writer;
    private StreamReader? _reader;
    private int _requestId;
    private readonly object _lock = new();
    private readonly Dictionary<string, JavaAgentElement> _elements = new();

    // ── Connection ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Connects to the agent started by the JVM process with the given PID.
    /// The agent writes its TCP port to %TEMP%\appium-agent-{pid}.port at startup.
    /// </summary>
    public void Connect(int pid, int timeoutMs = 10000)
    {
        var portFile = Path.Combine(Path.GetTempPath(), $"appium-agent-{pid}.port");
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);

        while (!File.Exists(portFile))
        {
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException(
                    $"Java agent port file not found after {timeoutMs}ms: {portFile}. " +
                    "Ensure the app was launched with -javaagent:appium-desktop-agent.jar.");
            Thread.Sleep(200);
        }

        var portText = File.ReadAllText(portFile).Trim();
        if (!int.TryParse(portText, out var port))
            throw new InvalidOperationException($"Invalid port in agent file: '{portText}'");

        _tcp = new TcpClient();
        _tcp.Connect("127.0.0.1", port);
        var stream = _tcp.GetStream();
        _writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
        _reader = new StreamReader(stream, Encoding.UTF8);
    }

    // ── Element cache ──────────────────────────────────────────────────────────

    public string Save(JavaAgentElement el)
    {
        lock (_lock)
        {
            _elements[el.Id] = el;
        }
        return el.Id;
    }

    public JavaAgentElement GetById(string id)
    {
        lock (_lock)
        {
            if (_elements.TryGetValue(id, out var cached)) return cached;
        }
        // Fetch fresh info from agent
        var info = Call("getInfo", new { id });
        if (info == null) throw new KeyNotFoundException($"Java element not found: {id}");
        var el = new JavaAgentElement(id, ParseInfo(info.Value));
        lock (_lock) { _elements[id] = el; }
        return el;
    }

    public Dictionary<string, object?>? GetFreshInfo(JavaAgentElement el)
    {
        var result = Call("getInfo", new { id = el.Id });
        if (result == null) return null;
        var info = ParseInfo(result.Value);
        el.Info = info;
        lock (_lock) { _elements[el.Id] = el; }
        return info;
    }

    public bool IsAlive(string id)
    {
        var result = Call("isAlive", new { id });
        if (result == null) return false;
        return result.Value.ValueKind == JsonValueKind.True;
    }

    // ── Window root ────────────────────────────────────────────────────────────

    public JavaAgentElement? GetWindowRoot(IntPtr hwnd)
    {
        var result = Call("getWindowRoot", new { hwnd = (long) hwnd });
        if (result == null) return null;
        return SaveFromResult(result.Value);
    }

    // ── Find ───────────────────────────────────────────────────────────────────

    public string? FindFirst(JavaAgentElement root, ConditionDto condition, string scope)
    {
        var condJson = JsonSerializer.SerializeToElement(condition);
        var result = Call("findFirst", new
        {
            rootId = root.Id,
            condition = condJson,
            scope = scope.ToLowerInvariant()
        });
        if (result == null || result.Value.ValueKind == JsonValueKind.Null) return null;
        return result.Value.GetString();
    }

    public string[] FindAll(JavaAgentElement root, ConditionDto condition, string scope)
    {
        var condJson = JsonSerializer.SerializeToElement(condition);
        var result = Call("findAll", new
        {
            rootId = root.Id,
            condition = condJson,
            scope = scope.ToLowerInvariant()
        });
        if (result == null || result.Value.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        return result.Value.EnumerateArray()
            .Select(e => e.GetString() ?? "")
            .Where(s => s.Length > 0)
            .ToArray();
    }

    // ── Property access ────────────────────────────────────────────────────────

    public object? GetProperty(JavaAgentElement el, string property)
    {
        var info = el.Info;
        var key = FindKey(info, property);
        if (key == null) return "";

        var val = info[key];
        if (val == null) return "";
        return val;
    }

    public string GetText(JavaAgentElement el)
    {
        var result = Call("getValue", new { id = el.Id });
        if (result == null || result.Value.ValueKind == JsonValueKind.Null) return "";
        return result.Value.GetString() ?? "";
    }

    public object GetRect(JavaAgentElement el)
    {
        var info = el.Info;
        return new
        {
            x = GetDouble(info, "x"),
            y = GetDouble(info, "y"),
            width = GetDouble(info, "width"),
            height = GetDouble(info, "height"),
        };
    }

    public string GetTagName(JavaAgentElement el)
    {
        var cls = GetString(el.Info, "ClassName") ?? "";
        return NormalizeTagName(cls);
    }

    public string GetToggleState(JavaAgentElement el)
    {
        var result = Call("getToggleState", new { id = el.Id });
        return result?.GetString() ?? "Off";
    }

    // ── Interaction ────────────────────────────────────────────────────────────

    public void SetValue(JavaAgentElement el, string value)
    {
        Call("setValue", new { id = el.Id, value });
    }

    public void Invoke(JavaAgentElement el)
    {
        Call("invoke", new { id = el.Id });
        Thread.Sleep(50);
    }

    public void Select(JavaAgentElement el)
    {
        Call("selectElement", new { id = el.Id });
        Thread.Sleep(50);
    }

    public void RequestFocus(JavaAgentElement el)
    {
        Call("requestFocus", new { id = el.Id });
    }

    /// <summary>
    /// Tries to expand the element via AccessibleAction[0].
    /// Throws InvalidOperationException with message "JAB_NO_EXPAND_ACTION" when the element
    /// has no accessible action — caller should fall back to keyboard (ALT+Down).
    /// </summary>
    public void Expand(JavaAgentElement el)
    {
        Call("expandElement", new { id = el.Id });
        Thread.Sleep(50);
    }

    // ── Page source XML ────────────────────────────────────────────────────────

    public void BuildXml(JavaAgentElement node, XmlDocument doc, XmlElement? parent)
    {
        BuildXmlRecursive(node, doc, parent, 0);
    }

    private void BuildXmlRecursive(JavaAgentElement node, XmlDocument doc, XmlElement? parent, int depth)
    {
        if (depth > 100) return;
        try
        {
            var info = node.Info;
            var tagName = NormalizeTagName(GetString(info, "ClassName") ?? "Element");

            var el = doc.CreateElement(tagName);
            el.SetAttribute("Name", GetString(info, "Name") ?? "");
            el.SetAttribute("AutomationId", GetString(info, "AutomationId") ?? "");
            el.SetAttribute("ClassName", GetString(info, "ClassName") ?? "");
            el.SetAttribute("JavaClass", GetString(info, "JavaClass") ?? "");
            el.SetAttribute("JavaSimpleClass", GetString(info, "JavaSimpleClass") ?? "");
            el.SetAttribute("LocalizedControlType", GetString(info, "LocalizedControlType") ?? "");
            el.SetAttribute("HelpText", GetString(info, "Description") ?? "");
            el.SetAttribute("States", GetString(info, "States") ?? "");
            el.SetAttribute("x", GetString(info, "x") ?? "0");
            el.SetAttribute("y", GetString(info, "y") ?? "0");
            el.SetAttribute("width", GetString(info, "width") ?? "0");
            el.SetAttribute("height", GetString(info, "height") ?? "0");
            el.SetAttribute("IsEnabled", GetString(info, "IsEnabled") ?? "False");
            el.SetAttribute("IsOffscreen", GetString(info, "IsOffscreen") ?? "False");
            el.SetAttribute("IndexInParent", GetString(info, "IndexInParent") ?? "0");
            el.SetAttribute("RuntimeId", node.Id);

            if (parent == null) doc.AppendChild(el);
            else parent.AppendChild(el);

            // Fetch children
            var childrenResult = Call("getChildren", new { id = node.Id });
            if (childrenResult?.ValueKind == JsonValueKind.Array)
            {
                foreach (var childJson in childrenResult.Value.EnumerateArray())
                {
                    var child = SaveFromResult(childJson);
                    if (child != null) BuildXmlRecursive(child, doc, el, depth + 1);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[JavaAgent] BuildXml error at depth {depth}: {ex.Message}");
        }
    }

    // ── RPC ────────────────────────────────────────────────────────────────────

    private JsonElement? Call(string command, object @params)
    {
        lock (_lock)
        {
            if (_writer == null || _reader == null)
                throw new InvalidOperationException("Java agent not connected.");

            int id = ++_requestId;
            var request = new
            {
                id,
                command,
                @params
            };
            var json = JsonSerializer.Serialize(request);
            _writer.WriteLine(json);

            var response = _reader.ReadLine()
                ?? throw new IOException("Java agent closed connection.");

            var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("error", out var errorEl))
                throw new InvalidOperationException($"Java agent error: {errorEl.GetString()}");

            if (doc.RootElement.TryGetProperty("result", out var resultEl))
                return resultEl.Clone();

            return null;
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private JavaAgentElement? SaveFromResult(JsonElement json)
    {
        if (json.ValueKind != JsonValueKind.Object) return null;
        if (!json.TryGetProperty("id", out var idEl)) return null;
        var id = idEl.GetString();
        if (string.IsNullOrEmpty(id)) return null;

        var info = ParseInfo(json);
        var el = new JavaAgentElement(id, info);
        lock (_lock) { _elements[id] = el; }
        return el;
    }

    private static Dictionary<string, object?> ParseInfo(JsonElement json)
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in json.EnumerateObject())
        {
            dict[prop.Name] = prop.Value.ValueKind switch
            {
                JsonValueKind.String => prop.Value.GetString(),
                JsonValueKind.True => (object) true,
                JsonValueKind.False => (object) false,
                JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? (object) l : prop.Value.GetDouble(),
                JsonValueKind.Null => null,
                _ => prop.Value.GetRawText(),
            };
        }
        return dict;
    }

    private static string? FindKey(Dictionary<string, object?> info, string property)
    {
        // Case-insensitive key lookup
        var lower = property.ToLowerInvariant();
        foreach (var key in info.Keys)
        {
            if (key.ToLowerInvariant() == lower) return key;
        }
        return null;
    }

    private static string? GetString(Dictionary<string, object?> info, string key)
    {
        var k = FindKey(info, key);
        return k != null && info[k] != null ? info[k]!.ToString() : null;
    }

    private static double GetDouble(Dictionary<string, object?> info, string key)
    {
        var s = GetString(info, key);
        return s != null && double.TryParse(s, out var d) ? d : 0.0;
    }

    private static string NormalizeTagName(string role)
    {
        if (string.IsNullOrWhiteSpace(role)) return "Element";
        var parts = role.Split(' ', '-', '_');
        var sb = new StringBuilder();
        foreach (var p in parts)
            if (p.Length > 0)
                sb.Append(char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant());
        var result = sb.ToString();
        if (result.Length == 0 || !char.IsLetter(result[0])) result = "E" + result;
        return result;
    }

    public void Dispose()
    {
        try { _writer?.Dispose(); } catch { }
        try { _reader?.Dispose(); } catch { }
        try { _tcp?.Close(); } catch { }
        lock (_lock) { _elements.Clear(); }
    }
}
