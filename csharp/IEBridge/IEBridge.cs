using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using mshtml;

// net481 lacks IsExternalInit — polyfill enables 'record' and 'init' setters
namespace System.Runtime.CompilerServices { internal static class IsExternalInit { } }

// querySelector / querySelectorAll not exposed in the shipped PIA — declare manually.
[ComImport, Guid("30510417-98B5-11CF-BB82-00AA00BDCE0B"),
 InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
interface IHTMLDocument6
{
    [DispId(1104)] IHTMLElement  querySelector(string selectors);
    [DispId(1105)] IHTMLDOMChildrenCollection querySelectorAll(string selectors);
}

class Program
{
    static uint WM_HTML_GETOBJECT;
    const uint SMTO_ABORTIFHUNG = 0x0002;
    const uint SMTO_TIMEOUT_MS  = 5000;

    static readonly Guid IID_IHTMLDocument2 =
        new Guid("332C4425-26CB-11D0-B483-00C04FD90119");

    static readonly Dictionary<string, IHTMLElement> _elems = new();
    static int _elemSeq = 0;

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

    // Parses a flat (no nested objects) JSON object into string→string.
    static Dictionary<string, string> JsonParseFlat(string json)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        int i = 0;
        SkipWs(json, ref i);
        if (i >= json.Length || json[i] != '{') return result;
        i++; // skip {
        while (i < json.Length)
        {
            SkipWs(json, ref i);
            if (i >= json.Length || json[i] == '}') break;
            if (json[i] == ',') { i++; continue; }
            if (json[i] != '"') { i++; continue; }
            string key = ReadString(json, ref i);
            SkipWs(json, ref i);
            if (i >= json.Length || json[i] != ':') continue;
            i++; // skip :
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
        i++; // skip opening "
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
                    case '"':  sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/':  sb.Append('/'); break;
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
                            {
                                sb.Append((char)cp);
                            }
                            i += 4;
                        }
                        break;
                    default: sb.Append(esc); break;
                }
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }

    static string ReadValue(string s, ref int i)
    {
        if (i >= s.Length) return "";
        if (s[i] == '"') return ReadString(s, ref i);
        if (s[i] == '{' || s[i] == '[')
        {
            // Skip nested — we don't need nested objects in requests
            char open = s[i], close = open == '{' ? '}' : ']';
            int depth = 0;
            var sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                sb.Append(c);
                if (c == '"') { i--; sb.Length--; sb.Append(ReadString(s, ref i)); }
                else if (c == open) depth++;
                else if (c == close) { depth--; if (depth == 0) break; }
            }
            return sb.ToString();
        }
        // number / boolean / null
        int start = i;
        while (i < s.Length && s[i] != ',' && s[i] != '}' && s[i] != ']') i++;
        return s.Substring(start, i - start).Trim();
    }

    // JSON string escaping
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
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20)
                        sb.AppendFormat("\\u{0:x4}", (int)c);
                    else
                        sb.Append(c);
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

    static IHTMLDocument2? GetDocument(IntPtr topHwnd)
    {
        IntPtr ieServer = IntPtr.Zero;
        EnumChildWindows(topHwnd, (hwnd, _) =>
        {
            var buf = new StringBuilder(64);
            GetClassName(hwnd, buf, 64);
            if (buf.ToString() == "Internet Explorer_Server")
            {
                ieServer = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

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

        return (hr == 0 && raw is IHTMLDocument2 doc) ? doc : null;
    }

    // ── Element registry ────────────────────────────────────────

    static string Register(IHTMLElement el)
    {
        string id = $"ie-{++_elemSeq}";
        _elems[id] = el;
        return id;
    }

    static IHTMLElement? Resolve(string id)
    {
        if (!_elems.TryGetValue(id, out var el)) return null;
        try { _ = el.tagName; return el; }
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

        var doc = GetDocument(new IntPtr(req.Hwnd));
        if (doc == null) return ErrJson(seq, "IE_DOCUMENT_NOT_FOUND");

        return req.Cmd switch
        {
            "getTitle"            => OkJson(seq, "title",   doc.title),
            "getUrl"              => OkJson(seq, "url",     doc.url),
            "getSource"           => OkJson(seq, "source",  (doc as IHTMLDocument3)?.documentElement?.outerHTML ?? ""),
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

    static string FindById(int seq, IHTMLDocument2 doc, string id)
    {
        var doc3 = doc as IHTMLDocument3;
        if (doc3 == null) return ErrJson(seq, "IE_DOCUMENT_NOT_FOUND");
        var el = doc3.getElementById(id) as IHTMLElement;
        return el == null ? ErrJson(seq, "NO_SUCH_ELEMENT") : OkJson(seq, "elementId", Register(el));
    }

    static string FindByCss(int seq, IHTMLDocument2 doc, string css, bool multi)
    {
        if (!(doc is IHTMLDocument6 doc6))
            return ErrJson(seq, "QUERY_SELECTOR_UNSUPPORTED");
        if (multi)
        {
            var list = doc6.querySelectorAll(css);
            var ids  = new List<string>();
            for (int i = 0; i < list.length; i++)
                ids.Add(Register((IHTMLElement)list.item(i)));
            return OkJsonList(seq, "elementIds", ids);
        }
        var single = doc6.querySelector(css) as IHTMLElement;
        return single == null ? ErrJson(seq, "NO_SUCH_ELEMENT") : OkJson(seq, "elementId", Register(single));
    }

    static string FindByXpath(int seq, IHTMLDocument2 doc, string xpath, bool multi)
    {
        string escaped = JsEscape(xpath);
        var win = doc.parentWindow as IHTMLWindow2;
        if (win == null) return ErrJson(seq, "IE_NO_WINDOW");

        if (multi)
        {
            string script =
                $"(function(){{" +
                $"var s=document.evaluate({escaped},document,null,5,null);" +
                $"for(var i=0;i<s.snapshotLength;i++){{" +
                $"s.snapshotItem(i).setAttribute('__ieb',i);" +
                $"}}" +
                $"}})();";
            try { win.execScript(script, "JScript"); }
            catch (Exception ex) { return ErrJson(seq, ex.Message); }

            var doc6 = doc as IHTMLDocument6;
            if (doc6 == null) return ErrJson(seq, "QUERY_SELECTOR_UNSUPPORTED");
            var tagged = doc6.querySelectorAll("[__ieb]");
            var ids = new List<string>();
            for (int i = 0; i < tagged.length; i++)
            {
                var el = (IHTMLElement)tagged.item(i);
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
            try { win.execScript(script, "JScript"); }
            catch (Exception ex) { return ErrJson(seq, ex.Message); }

            var doc6 = doc as IHTMLDocument6;
            if (doc6 == null) return ErrJson(seq, "QUERY_SELECTOR_UNSUPPORTED");
            var tagged = doc6.querySelector("[__ieb_s]") as IHTMLElement;
            if (tagged == null) return ErrJson(seq, "NO_SUCH_ELEMENT");
            tagged.removeAttribute("__ieb_s", 0);
            return OkJson(seq, "elementId", Register(tagged));
        }
    }

    // ── Interactions ────────────────────────────────────────────

    static string ClickEl(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try { el.click(); return OkJson(seq); }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string GetVal(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        string? val = null;
        if (el is IHTMLInputElement inp)         val = inp.value;
        else if (el is IHTMLTextAreaElement ta)  val = ta.value;
        return val != null ? OkJson(seq, "value", val) : ErrJson(seq, "ELEMENT_NOT_INTERACTABLE");
    }

    static string SetVal(int seq, string id, string v)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        try
        {
            if (el is IHTMLInputElement inp)         inp.value = v;
            else if (el is IHTMLTextAreaElement ta)  ta.value  = v;
            else return ErrJson(seq, "ELEMENT_NOT_INTERACTABLE");
            return OkJson(seq);
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string GetText(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        return OkJson(seq, "text", el.innerText ?? "");
    }

    static string GetAttr(int seq, string id, string name)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        return OkJson(seq, "value", el.getAttribute(name, 0)?.ToString());
    }

    static string IsDisplayed(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        if (el is IHTMLElement2 el2)
        {
            var style = el2.currentStyle;
            bool hidden = style?.display == "none" || style?.visibility == "hidden";
            return OkJsonBool(seq, "value", !hidden);
        }
        return OkJsonBool(seq, "value", true);
    }

    static string IsEnabled(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        var disabled = el.getAttribute("disabled", 0);
        var disStr = disabled?.ToString();
        return OkJsonBool(seq, "value", disStr == null || disStr == "");
    }

    static string IsSelected(int seq, string id)
    {
        var el = Resolve(id);
        if (el == null) return ErrJson(seq, "STALE_ELEMENT_REFERENCE");
        bool sel = false;
        if (el is IHTMLInputElement inp2)
        {
            var t = inp2.type?.ToLower();
            sel = (t == "checkbox" || t == "radio") && inp2.@checked == true;
        }
        else if (el is IHTMLOptionElement opt)
        {
            sel = opt.selected == true;
        }
        return OkJsonBool(seq, "value", sel);
    }

    static string Navigate(int seq, IHTMLDocument2 doc, string url)
    {
        FlushElements();
        (doc.parentWindow as IHTMLWindow2)?.navigate(url);
        return OkJson(seq);
    }

    static string ExecScript(int seq, IHTMLDocument2 doc, string script)
    {
        try
        {
            var win = doc.parentWindow as IHTMLWindow2;
            win?.execScript(script, "JScript");
            return OkJson(seq, "result", null);
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }
}
