using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

// net481 lacks IsExternalInit — polyfill enables 'record' and 'init' setters
namespace System.Runtime.CompilerServices { internal static class IsExternalInit { } }

class Program
{
    static uint WM_HTML_GETOBJECT;
    const uint SMTO_ABORTIFHUNG = 0x0002;
    const uint SMTO_TIMEOUT_MS  = 5000;

    // IHTMLDocument2 — used only to QI the COM pointer out of ObjectFromLresult
    static readonly Guid IID_IHTMLDocument2 =
        new Guid("332C4425-26CB-11D0-B483-00C04FD90119");

    static readonly Dictionary<string, dynamic> _elems = new();
    static int _elemSeq = 0;

    // Held in a static field so the GC does not collect the delegate while
    // the unmanaged EnumChildWindows call is in progress.
    static readonly EnumChildProc _findIEServer = FindIEServerCallback;
    static IntPtr _ieServerFound;

    static bool FindIEServerCallback(IntPtr hwnd, IntPtr lp)
    {
        var buf = new StringBuilder(64);
        GetClassName(hwnd, buf, 64);
        if (buf.ToString() == "Internet Explorer_Server") { _ieServerFound = hwnd; return false; }
        return true;
    }

    [STAThread]
    static void Main()
    {
        WM_HTML_GETOBJECT = RegisterWindowMessage("WM_HTML_GETOBJECT");

        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            int seq = 0;
            try
            {
                var req = ParseRequest(line, out seq);
                var resp = Dispatch(req, seq);
                Console.WriteLine(resp);
                Console.Out.Flush();
            }
            catch (Exception ex)
            {
                Console.WriteLine(ErrJson(seq, ex.Message));
                Console.Out.Flush();
            }
        }
    }

    // ── P/Invoke ────────────────────────────────────────────────

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern uint RegisterWindowMessage(string msg);

    delegate bool EnumChildProc(IntPtr hwnd, IntPtr lp);

    [DllImport("user32.dll")]
    static extern bool EnumChildWindows(IntPtr hwnd, EnumChildProc fn, IntPtr lp);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SendMessageTimeout(
        IntPtr hWnd, uint Msg,
        IntPtr wParam, IntPtr lParam,
        uint fuFlags, uint uTimeout,
        out IntPtr lpdwResult);

    [DllImport("oleacc.dll")]
    static extern int ObjectFromLresult(
        IntPtr lResult,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        IntPtr wParam,
        [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hWnd, StringBuilder buf, int maxCount);

    // ── Minimal JSON ────────────────────────────────────────────

    record Req(int Seq, string Cmd, long Hwnd,
               string? Value, string? ElementId, string? Name,
               string? Script, string? Args);

    static string? Get(Dictionary<string, string> d, string key)
        => d.TryGetValue(key, out var v) ? v : null;

    static Req ParseRequest(string json, out int seq)
    {
        seq = 0;
        var d = JsonParseFlat(json);
        int.TryParse(Get(d, "seq"), out seq);
        long.TryParse(Get(d, "hwnd"), out long hwnd);
        return new Req(
            seq,
            Get(d, "cmd") ?? "",
            hwnd,
            Get(d, "value"),
            Get(d, "elementId"),
            Get(d, "name"),
            Get(d, "script"),
            Get(d, "args")
        );
    }

    static Dictionary<string, string> JsonParseFlat(string json)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        int i = 0;
        SkipWs(json, ref i);
        if (i >= json.Length || json[i] != '{') return result;
        i++;
        while (i < json.Length)
        {
            SkipWs(json, ref i);
            if (i >= json.Length || json[i] == '}') break;
            if (json[i] == ',') { i++; continue; }
            if (json[i] != '"') { i++; continue; }
            string key = ReadString(json, ref i);
            SkipWs(json, ref i);
            if (i >= json.Length || json[i] != ':') continue;
            i++;
            SkipWs(json, ref i);
            string val = ReadValue(json, ref i);
            result[key] = val;
        }
        return result;
    }

    static void SkipWs(string s, ref int i)
    {
        while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
    }

    static string ReadString(string s, ref int i)
    {
        if (i >= s.Length || s[i] != '"') return "";
        i++;
        var sb = new StringBuilder();
        while (i < s.Length)
        {
            char c = s[i++];
            if (c == '"') break;
            if (c == '\\' && i < s.Length)
            {
                char esc = s[i++];
                switch (esc)
                {
                    case '"':  sb.Append('"');  break;
                    case '\\': sb.Append('\\'); break;
                    case '/':  sb.Append('/');  break;
                    case 'n':  sb.Append('\n'); break;
                    case 'r':  sb.Append('\r'); break;
                    case 't':  sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 <= s.Length)
                        {
                            string hex = s.Substring(i, 4);
                            if (int.TryParse(hex,
                                System.Globalization.NumberStyles.HexNumber,
                                null, out int cp))
                                sb.Append((char)cp);
                            i += 4;
                        }
                        break;
                    default: sb.Append(esc); break;
                }
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }

    static string ReadValue(string s, ref int i)
    {
        if (i >= s.Length) return "";
        if (s[i] == '"') return ReadString(s, ref i);
        if (s[i] == '{' || s[i] == '[')
        {
            char open = s[i], close = open == '{' ? '}' : ']';
            int depth = 0;
            var sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                sb.Append(c);
                if (c == '"') { i--; sb.Length--; sb.Append(ReadString(s, ref i)); }
                else if (c == open)  depth++;
                else if (c == close) { depth--; if (depth == 0) break; }
            }
            return sb.ToString();
        }
        int start = i;
        while (i < s.Length && s[i] != ',' && s[i] != '}' && s[i] != ']') i++;
        return s.Substring(start, i - start).Trim();
    }

    static string JsEscape(string? s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n");  break;
                case '\r': sb.Append("\\r");  break;
                case '\t': sb.Append("\\t");  break;
                default:
                    if (c < 0x20) sb.AppendFormat("\\u{0:x4}", (int)c);
                    else          sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    static string OkJson(int seq)
        => $"{{\"seq\":{seq},\"ok\":true}}";

    static string OkJson(int seq, string key, string? val)
        => $"{{\"seq\":{seq},\"ok\":true,{JsEscape(key)}:{JsEscape(val)}}}";

    static string OkJsonBool(int seq, string key, bool val)
        => $"{{\"seq\":{seq},\"ok\":true,{JsEscape(key)}:{(val ? "true" : "false")}}}";

    static string OkJsonList(int seq, string key, List<string> ids)
    {
        var sb = new StringBuilder();
        sb.Append($"{{\"seq\":{seq},\"ok\":true,{JsEscape(key)}:[");
        for (int k = 0; k < ids.Count; k++)
        {
            if (k > 0) sb.Append(',');
            sb.Append(JsEscape(ids[k]));
        }
        sb.Append("]}");
        return sb.ToString();
    }

    static string ErrJson(int seq, string msg)
        => $"{{\"seq\":{seq},\"ok\":false,\"error\":{JsEscape(msg)}}}";

    // ── Document acquisition ────────────────────────────────────

    static dynamic? GetDocument(IntPtr topHwnd)
    {
        _ieServerFound = IntPtr.Zero;
        EnumChildWindows(topHwnd, _findIEServer, IntPtr.Zero);
        IntPtr ieServer = _ieServerFound;

        if (ieServer == IntPtr.Zero) return null;

        IntPtr lResult;
        IntPtr rc = SendMessageTimeout(
            ieServer, WM_HTML_GETOBJECT,
            IntPtr.Zero, IntPtr.Zero,
            SMTO_ABORTIFHUNG, SMTO_TIMEOUT_MS,
            out lResult);

        if (rc == IntPtr.Zero || lResult == IntPtr.Zero) return null;

        int hr = ObjectFromLresult(lResult, IID_IHTMLDocument2,
            IntPtr.Zero, out object raw);

        return hr == 0 ? (dynamic)raw : null;
    }

    // ── Element registry ────────────────────────────────────────

    static string Register(dynamic el)
    {
        string id = $"ie-{++_elemSeq}";
        _elems[id] = el;
        return id;
    }

    static dynamic? Resolve(string id)
    {
        if (!_elems.TryGetValue(id, out var el)) return null;
        try { _ = (string)el.tagName; return el; }
        catch { _elems.Remove(id); return null; }
    }

    static void FlushElements() => _elems.Clear();

    // ── Dispatcher ──────────────────────────────────────────────

    static string Dispatch(Req req, int seq)
    {
        if (req.Cmd == "clearElements")
        {
            FlushElements();
            return OkJson(seq);
        }

        dynamic? doc = GetDocument(new IntPtr(req.Hwnd));
        if (doc == null) return ErrJson(seq, "IE_DOCUMENT_NOT_FOUND");

        return req.Cmd switch
        {
            "getTitle"            => OkJson(seq, "title",  (string)doc.title),
            "getUrl"              => OkJson(seq, "url",    (string)doc.url),
            "getSource"           => GetSource(seq, doc),
            "navigate"            => Navigate(seq, doc, req.Value!),
            "findElementById"     => FindById(seq, doc, req.Value!),
            "findElementsByCss"   => FindByCss(seq, doc, req.Value!, multi: false),
            "findElementsCssAll"  => FindByCss(seq, doc, req.Value!, multi: true),
            "findElementByXpath"  => FindByXpath(seq, doc, req.Value!, multi: false),
            "findElementsByXpath" => FindByXpath(seq, doc, req.Value!, multi: true),
            "click"               => ClickEl(seq, req.ElementId!),
            "getValue"            => GetVal(seq, req.ElementId!),
            "setValue"            => SetVal(seq, req.ElementId!, req.Value!),
            "clear"               => SetVal(seq, req.ElementId!, ""),
            "getText"             => GetText(seq, req.ElementId!),
            "getAttribute"        => GetAttr(seq, req.ElementId!, req.Name!),
            "isDisplayed"         => IsDisplayed(seq, req.ElementId!),
            "isEnabled"           => IsEnabled(seq, req.ElementId!),
            "isSelected"          => IsSelected(seq, req.ElementId!),
            "executeScript"       => ExecScript(seq, doc, req.Script!),
            _                     => ErrJson(seq, $"UNKNOWN_CMD:{req.Cmd}")
        };
    }

    // ── Find ────────────────────────────────────────────────────

    static string GetSource(int seq, dynamic doc)
    {
        try { return OkJson(seq, "source", (string)doc.documentElement.outerHTML); }
        catch { return OkJson(seq, "source", ""); }
    }

    static string FindById(int seq, dynamic doc, string id)
    {
        try
        {
            dynamic el = doc.getElementById(id);
            if (el == null) return ErrJson(seq, "NO_SUCH_ELEMENT");
            return OkJson(seq, "elementId", Register(el));
        }
        catch { return ErrJson(seq, "NO_SUCH_ELEMENT"); }
    }

    static string FindByCss(int seq, dynamic doc, string css, bool multi)
    {
        try
        {
            if (multi)
            {
                dynamic list;
                try { list = doc.querySelectorAll(css); }
                catch (Exception ex) { return ErrJson(seq, $"QSA_FAILED: {ex.Message}"); }

                int len;
                try { len = (int)list.length; }
                catch (Exception ex) { return ErrJson(seq, $"LIST_LENGTH_FAILED: {ex.Message}"); }

                var ids = new List<string>();
                for (int i = 0; i < len; i++)
                {
                    dynamic el;
                    try { el = list[i]; }
                    catch (Exception ex) { return ErrJson(seq, $"LIST_ITEM_{i}_FAILED: {ex.Message}"); }
                    ids.Add(Register(el));
                }
                return OkJsonList(seq, "elementIds", ids);
            }
            dynamic single = doc.querySelector(css);
            if (single == null) return ErrJson(seq, "NO_SUCH_ELEMENT");
            return OkJson(seq, "elementId", Register(single));
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string FindByXpath(int seq, dynamic doc, string xpath, bool multi)
    {
        string escaped = JsEscape(xpath);
        try
        {
            dynamic win = doc.parentWindow;
            if (multi)
            {
                string script =
                    $"(function(){{" +
                    $"var s=document.evaluate({escaped},document,null,5,null);" +
                    $"for(var i=0;i<s.snapshotLength;i++){{" +
                    $"s.snapshotItem(i).setAttribute('__ieb',i);" +
                    $"}}" +
                    $"}})();";
                win.execScript(script, "JScript");

                dynamic tagged = doc.querySelectorAll("[__ieb]");
                var ids = new List<string>();
                int len = (int)tagged.length;
                for (int i = 0; i < len; i++)
                {
                    dynamic el = tagged[i];
                    el.removeAttribute("__ieb", 0);
                    ids.Add(Register(el));
                }
                return OkJsonList(seq, "elementIds", ids);
            }
            else
            {
                string script =
                    $"(function(){{" +
                    $"var n=document.evaluate({escaped},document,null,9,null).singleNodeValue;" +
                    $"if(n&&n.setAttribute)n.setAttribute('__ieb_s','1');" +
                    $"}})();";
                win.execScript(script, "JScript");

                dynamic tagged = doc.querySelector("[__ieb_s]");
                if (tagged == null) return ErrJson(seq, "NO_SUCH_ELEMENT");
                tagged.removeAttribute("__ieb_s", 0);
                return OkJson(seq, "elementId", Register(tagged));
            }
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    // ── Interactions ────────────────────────────────────────────

    static string ClickEl(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try { el.click(); return OkJson(seq); }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string GetVal(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            string tag = ((string)el.tagName).ToLower();
            if (tag == "input" || tag == "textarea")
                return OkJson(seq, "value", (string)el.value);
            return ErrJson(seq, "ELEMENT_NOT_INTERACTABLE");
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string SetVal(int seq, string id, string v)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            string tag = ((string)el.tagName).ToLower();
            if (tag == "input" || tag == "textarea") { el.value = v; return OkJson(seq); }
            return ErrJson(seq, "ELEMENT_NOT_INTERACTABLE");
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string GetText(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try { return OkJson(seq, "text", (string)(el.innerText ?? "")); }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string GetAttr(int seq, string id, string name)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try { return OkJson(seq, "value", el.getAttribute(name, 0)?.ToString()); }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string IsDisplayed(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            dynamic style = el.currentStyle;
            bool hidden = (string)style.display == "none"
                       || (string)style.visibility == "hidden";
            return OkJsonBool(seq, "value", !hidden);
        }
        catch { return OkJsonBool(seq, "value", true); }
    }

    static string IsEnabled(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            var disabled = el.getAttribute("disabled", 0);
            var disStr = disabled?.ToString();
            return OkJsonBool(seq, "value", disStr == null || disStr == "");
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string IsSelected(int seq, string id)
    {
        dynamic? el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            string tag = ((string)el.tagName).ToLower();
            bool sel = false;
            if (tag == "input")
            {
                string type = ((string)(el.type ?? "")).ToLower();
                sel = (type == "checkbox" || type == "radio") && el.@checked == true;
            }
            else if (tag == "option")
            {
                sel = el.selected == true;
            }
            return OkJsonBool(seq, "value", sel);
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string Navigate(int seq, dynamic doc, string url)
    {
        FlushElements();
        try { doc.parentWindow.navigate(url); }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
        return OkJson(seq);
    }

    static string ExecScript(int seq, dynamic doc, string script)
    {
        try
        {
            doc.parentWindow.execScript(script, "JScript");
            return OkJson(seq, "result", null);
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }
}
