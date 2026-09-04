using System.Diagnostics;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Xml;
using DesktopDriverServer.Diagnostics;

namespace DesktopDriverServer.DotNet;

/// <summary>
/// Client that communicates with the bridge DLL injected into the target CLR process.
/// Protocol: newline-delimited JSON-RPC over loopback TCP — same shape as JavaAgentService,
/// deliberately kept parallel for consistency between the two bridges.
/// </summary>
internal sealed class BridgeAgentService : IDisposable
{
    private TcpClient? _tcp;
    private StreamWriter? _writer;
    private StreamReader? _reader;
    private int _requestId;
    private readonly object _lock = new();
    private readonly Dictionary<string, BridgeAgentElement> _elements = new();

    /// <summary>
    /// When non-null, every RPC round trip is timed and recorded under
    /// <c>dotnetBridge.&lt;command&gt;</c>. Set by
    /// <see cref="State.SessionState.EnableDotnetBridge"/> only when the
    /// <c>perfMetrics</c> capability is on.
    /// </summary>
    internal PerfCounters? Perf { get; set; }

    // ── Connection ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Connects to the bridge started inside the process with the given PID.
    /// The bridge writes its TCP port to %TEMP%\appium-dotnet-bridge-{pid}.port at startup.
    /// </summary>
    public void Connect(int pid, int timeoutMs = 10000)
    {
        var portFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.port");
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);

        while (!File.Exists(portFile))
        {
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException(
                    $".NET bridge port file not found after {timeoutMs}ms: {portFile}. " +
                    "The bridge DLL may have failed to load or start inside the target process.");
            Thread.Sleep(200);
        }

        var portText = File.ReadAllText(portFile).Trim();
        if (!int.TryParse(portText, out var port))
            throw new InvalidOperationException($"Invalid port in bridge port file: '{portText}'");

        _tcp = new TcpClient();
        _tcp.Connect("127.0.0.1", port);
        var stream = _tcp.GetStream();
        _writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
        _reader = new StreamReader(stream, Encoding.UTF8);
    }

    // ── Element cache ──────────────────────────────────────────────────────────

    public string Save(BridgeAgentElement el)
    {
        lock (_lock)
        {
            _elements[el.Id] = el;
        }
        return el.Id;
    }

    public BridgeAgentElement GetById(string id)
    {
        lock (_lock)
        {
            if (_elements.TryGetValue(id, out var cached)) return cached;
        }
        var info = Call("getInfo", new { id });
        if (info == null) throw new KeyNotFoundException($".NET bridge element not found: {id}");
        var el = new BridgeAgentElement(id, ParseInfo(info.Value));
        lock (_lock) { _elements[id] = el; }
        return el;
    }

    public Dictionary<string, object?>? GetFreshInfo(BridgeAgentElement el)
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

    public BridgeAgentElement? GetWindowRoot(IntPtr hwnd, string title = "")
    {
        var result = Call("getWindowRoot", new { hwnd = (long)hwnd, title });
        if (result == null) return null;
        return SaveFromResult(result.Value);
    }

    // ── Find ───────────────────────────────────────────────────────────────────

    public string? FindFirst(BridgeAgentElement root, object condition, string scope)
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

    public string[] FindAll(BridgeAgentElement root, object condition, string scope)
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

    /// <summary>
    /// "evaluateXPath" for a .NET bridge subtree. The bridge's reflected tree is
    /// materialised into an <see cref="XmlDocument"/> (same traversal
    /// <see cref="BuildXml"/> uses for page source) and the whole expression is run
    /// through System.Xml.XPath here on the host — a complete XPath 1.0 engine, so
    /// axes / positional & filter predicates / count() / string functions are all
    /// handled. Replaces the old path where bridge XPath leaned on
    /// BridgeServer.CollectMatches, which only ever did a descendant scan and
    /// ignored the requested scope entirely.
    ///
    /// Tag names come from the reflected type name via <see cref="NormalizeTagName"/>
    /// — language-neutral, so a node test agrees across locales just like real UIA.
    /// </summary>
    public object? EvaluateXPath(BridgeAgentElement root, string expression, bool multiple)
    {
        var doc = new XmlDocument();
        var nodes = new Dictionary<string, string>(); // __bridgeNodeId -> element id
        var counter = 0;

        // Same dumpTree fast path as page source (see BuildXml).
        var dump = TryDumpTree(root);
        XmlElement? rootXml = dump != null
            ? BuildXPathNodeFromDump(dump.Value, doc, nodes, ref counter, 0)
            : BuildXPathNode(root, doc, nodes, ref counter, 0);
        doc.AppendChild(rootXml ?? doc.CreateElement("DummyRoot"));

        var ids = DesktopDriverServer.Commands.XPathEvaluator.Evaluate(
            doc, null, "__bridgeNodeId", expression, multiple,
            nodeId => nodes.TryGetValue(nodeId, out var elId) ? elId : null);

        return multiple ? ids.ToArray() : (ids.Count > 0 ? (object)ids[0] : null);
    }

    private XmlElement CreateXPathElement(
        XmlDocument doc, Dictionary<string, object?> info, string id,
        Dictionary<string, string> nodes, ref int counter)
    {
        var el = doc.CreateElement(NormalizeTagName(GetString(info, "ClassName") ?? "Element"));

        var nodeId = "n" + counter++;
        el.SetAttribute("__bridgeNodeId", nodeId);
        nodes[nodeId] = id;

        void A(string name, string? value)
        {
            try { el.SetAttribute(name, XPathSanitize(value ?? "")); } catch { }
        }

        A("Name", GetString(info, "Name"));
        A("AutomationId", GetString(info, "AutomationId"));
        A("ClassName", GetString(info, "ClassName"));
        A("LocalizedControlType", GetString(info, "LocalizedControlType"));
        A("HelpText", GetString(info, "Description"));
        A("Value", GetString(info, "Value"));
        A("x", GetString(info, "x") ?? "0");
        A("y", GetString(info, "y") ?? "0");
        A("width", GetString(info, "width") ?? "0");
        A("height", GetString(info, "height") ?? "0");
        A("IsEnabled", (GetString(info, "IsEnabled") ?? "false").ToLowerInvariant());
        A("IsOffscreen", (GetString(info, "IsOffscreen") ?? "false").ToLowerInvariant());
        A("RuntimeId", id);

        var text = XPathSanitize(GetString(info, "Name") ?? "");
        if (text.Length > 0) el.AppendChild(doc.CreateTextNode(text));
        return el;
    }

    private XmlElement? BuildXPathNodeFromDump(
        JsonElement node, XmlDocument doc, Dictionary<string, string> nodes, ref int counter, int depth)
    {
        if (depth > 100 || node.ValueKind != JsonValueKind.Object) return null;
        XmlElement el;
        try
        {
            var (id, info) = SaveDumpNode(node);
            el = CreateXPathElement(doc, info, id, nodes, ref counter);
        }
        catch
        {
            return null;
        }

        if (node.TryGetProperty("children", out var kids) && kids.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in kids.EnumerateArray())
            {
                var childXml = BuildXPathNodeFromDump(child, doc, nodes, ref counter, depth + 1);
                if (childXml != null) el.AppendChild(childXml);
            }
        }
        return el;
    }

    private XmlElement? BuildXPathNode(
        BridgeAgentElement node, XmlDocument doc, Dictionary<string, string> nodes, ref int counter, int depth)
    {
        if (depth > 100) return null;
        XmlElement el;
        try
        {
            el = CreateXPathElement(doc, node.Info, node.Id, nodes, ref counter);
        }
        catch
        {
            return null;
        }

        try
        {
            var childrenResult = Call("getChildren", new { id = node.Id });
            if (childrenResult?.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in childrenResult.Value.EnumerateArray().Select(SaveFromResult))
                {
                    if (child == null) continue;
                    var childXml = BuildXPathNode(child, doc, nodes, ref counter, depth + 1);
                    if (childXml != null) el.AppendChild(childXml);
                }
            }
        }
        catch { }

        return el;
    }

    private static string XPathSanitize(string s)
    {
        if (string.IsNullOrEmpty(s)) return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (ch == '\t' || ch == '\n' || ch == '\r' ||
                (ch >= 0x20 && ch <= 0xD7FF) || (ch >= 0xE000 && ch <= 0xFFFD))
            {
                sb.Append(ch);
            }
        }
        return sb.ToString();
    }

    // ── Property access ────────────────────────────────────────────────────────

    public object? GetProperty(BridgeAgentElement el, string property)
    {
        return el.Info.TryGetValue(property, out var val) && val != null ? val : "";
    }

    public string GetText(BridgeAgentElement el)
    {
        var result = Call("getValue", new { id = el.Id });
        if (result == null || result.Value.ValueKind == JsonValueKind.Null) return "";
        return result.Value.GetString() ?? "";
    }

    public object GetRect(BridgeAgentElement el)
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

    public string GetTagName(BridgeAgentElement el)
    {
        var cls = GetString(el.Info, "ClassName") ?? "";
        return NormalizeTagName(cls);
    }

    public string GetToggleState(BridgeAgentElement el)
    {
        var result = Call("getToggleState", new { id = el.Id });
        return result?.GetString() ?? "Off";
    }

    // ── Interaction ────────────────────────────────────────────────────────────

    public void SetValue(BridgeAgentElement el, string value)
    {
        Call("setValue", new { id = el.Id, value });
    }

    public void Invoke(BridgeAgentElement el)
    {
        Call("invoke", new { id = el.Id });
        Thread.Sleep(50);
    }

    public void Select(BridgeAgentElement el)
    {
        Call("selectElement", new { id = el.Id });
        Thread.Sleep(50);
    }

    public void RequestFocus(BridgeAgentElement el)
    {
        Call("requestFocus", new { id = el.Id });
    }

    public void Expand(BridgeAgentElement el)
    {
        Call("expandElement", new { id = el.Id });
        Thread.Sleep(50);
    }

    // ── Page source XML ────────────────────────────────────────────────────────

    public void BuildXml(BridgeAgentElement node, XmlDocument doc, XmlElement? parent)
    {
        // One "dumpTree" RPC walks the whole subtree agent-side and returns it nested,
        // instead of one getChildren RPC (and one JsonDocument.Parse) per node. Falls
        // back to the per-node path if the injected bridge is older.
        var dump = TryDumpTree(node);
        if (dump != null)
        {
            BuildXmlFromDump(dump.Value, doc, parent, 0);
            return;
        }
        BuildXmlRecursive(node, doc, parent, 0);
    }

    /// <summary>One RPC: the whole subtree under <paramref name="root"/> as a nested node.</summary>
    private JsonElement? TryDumpTree(BridgeAgentElement root)
    {
        if (Environment.GetEnvironmentVariable("BRIDGE_NO_DUMPTREE") == "1") return null; // perf A/B only
        try
        {
            var result = Call("dumpTree", new { id = root.Id });
            if (result?.ValueKind == JsonValueKind.Object) return result;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DotnetBridge] dumpTree unavailable, falling back to per-node walk: {ex.Message}");
        }
        return null;
    }

    private XmlElement CreatePageSourceElement(XmlDocument doc, Dictionary<string, object?> info, string id)
    {
        var el = doc.CreateElement(NormalizeTagName(GetString(info, "ClassName") ?? "Element"));
        el.SetAttribute("Name", GetString(info, "Name") ?? "");
        el.SetAttribute("AutomationId", GetString(info, "AutomationId") ?? "");
        el.SetAttribute("ClassName", GetString(info, "ClassName") ?? "");
        el.SetAttribute("LocalizedControlType", GetString(info, "LocalizedControlType") ?? "");
        el.SetAttribute("HelpText", GetString(info, "Description") ?? "");
        el.SetAttribute("Value", GetString(info, "Value") ?? "");
        el.SetAttribute("x", GetString(info, "x") ?? "0");
        el.SetAttribute("y", GetString(info, "y") ?? "0");
        el.SetAttribute("width", GetString(info, "width") ?? "0");
        el.SetAttribute("height", GetString(info, "height") ?? "0");
        el.SetAttribute("IsEnabled", GetString(info, "IsEnabled") ?? "False");
        el.SetAttribute("IsOffscreen", GetString(info, "IsOffscreen") ?? "False");
        el.SetAttribute("RuntimeId", id);
        return el;
    }

    private void BuildXmlFromDump(JsonElement node, XmlDocument doc, XmlElement? parent, int depth)
    {
        if (depth > 100 || node.ValueKind != JsonValueKind.Object) return;
        try
        {
            var (id, info) = SaveDumpNode(node);
            var el = CreatePageSourceElement(doc, info, id);
            if (parent == null) doc.AppendChild(el);
            else parent.AppendChild(el);

            if (node.TryGetProperty("children", out var kids) && kids.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in kids.EnumerateArray())
                {
                    BuildXmlFromDump(child, doc, el, depth + 1);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DotnetBridge] BuildXmlFromDump error at depth {depth}: {ex.Message}");
        }
    }

    private void BuildXmlRecursive(BridgeAgentElement node, XmlDocument doc, XmlElement? parent, int depth)
    {
        if (depth > 100) return;
        try
        {
            var el = CreatePageSourceElement(doc, node.Info, node.Id);
            if (parent == null) doc.AppendChild(el);
            else parent.AppendChild(el);

            var childrenResult = Call("getChildren", new { id = node.Id });
            if (childrenResult?.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in childrenResult.Value.EnumerateArray().Select(SaveFromResult))
                {
                    if (child != null) BuildXmlRecursive(child, doc, el, depth + 1);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DotnetBridge] BuildXml error at depth {depth}: {ex.Message}");
        }
    }

    // ── RPC ────────────────────────────────────────────────────────────────────

    private JsonElement? Call(string command, object @params)
    {
        lock (_lock)
        {
            if (_writer == null || _reader == null)
                throw new InvalidOperationException(".NET bridge not connected.");

            int id = ++_requestId;
            var request = new { id, command, @params };
            var json = JsonSerializer.Serialize(request);

            var perf = Perf;
            var sw = perf != null ? Stopwatch.StartNew() : null;

            _writer.WriteLine(json);

            var response = _reader.ReadLine()
                ?? throw new IOException(".NET bridge closed connection.");

            if (sw != null)
            {
                sw.Stop();
                perf!.Record($"dotnetBridge.{command}", sw.Elapsed.TotalMilliseconds);
            }

            var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("error", out var errorEl))
                throw new InvalidOperationException($".NET bridge error: {errorEl.GetString()}");

            if (doc.RootElement.TryGetProperty("result", out var resultEl))
                return resultEl.Clone();

            return null;
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private BridgeAgentElement? SaveFromResult(JsonElement json)
    {
        if (json.ValueKind != JsonValueKind.Object) return null;
        if (!json.TryGetProperty("id", out var idEl)) return null;
        var id = idEl.GetString();
        if (string.IsNullOrEmpty(id)) return null;

        var info = ParseInfo(json);
        var el = new BridgeAgentElement(id, info);
        lock (_lock) { _elements[id] = el; }
        return el;
    }

    /// <summary>
    /// Registers one node from a <c>dumpTree</c> response (which carries a nested
    /// <c>children</c> array we skip here) and returns its id + info.
    /// </summary>
    private (string id, Dictionary<string, object?> info) SaveDumpNode(JsonElement json)
    {
        var id = json.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        if (string.IsNullOrEmpty(id))
            throw new InvalidOperationException("dumpTree node has no id");

        var info = ParseInfo(json, skipKey: "children");
        var el = new BridgeAgentElement(id, info);
        lock (_lock) { _elements[id] = el; }
        return (id, info);
    }

    private static Dictionary<string, object?> ParseInfo(JsonElement json, string? skipKey = null)
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in json.EnumerateObject())
        {
            if (skipKey != null && prop.NameEquals(skipKey)) continue;
            dict[prop.Name] = prop.Value.ValueKind switch
            {
                JsonValueKind.String => prop.Value.GetString(),
                JsonValueKind.True => (object)true,
                JsonValueKind.False => (object)false,
                JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? (object)l : prop.Value.GetDouble(),
                JsonValueKind.Null => null,
                _ => prop.Value.GetRawText(),
            };
        }
        return dict;
    }

    // info dictionaries are built with StringComparer.OrdinalIgnoreCase, so a direct
    // TryGetValue is already the case-insensitive lookup — no need to scan keys.
    private static string? GetString(Dictionary<string, object?> info, string key)
    {
        return info.TryGetValue(key, out var v) && v != null ? v.ToString() : null;
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
                sb.Append(char.ToUpperInvariant(p[0]) + p[1..]);
        var result = sb.ToString();
        if (result.Length == 0 || !char.IsLetter(result[0])) result = "E" + result;
        // Reflected type names can still carry XML-illegal chars (generic `` `1 ``,
        // nested `+`, `<>` from anonymous types). An invalid name makes
        // CreateElement throw and drops the node + its whole subtree.
        try { System.Xml.XmlConvert.VerifyName(result); } catch { return "Element"; }
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
