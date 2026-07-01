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

    // HRESULT for RPC_S_SERVER_UNAVAILABLE — thrown when the IE tab process
    // is mid-replacement (LCIE hands off from old to new content process).
    const int RPC_SERVER_UNAVAILABLE = unchecked((int)0x800706BA);
    const int MAX_DOC_RETRIES        = 5;
    const int DOC_RETRY_DELAY_MS     = 1500;

    static string Dispatch(Req req, int seq)
    {
        if (req.Cmd == "clearElements")
        {
            FlushElements();
            return OkJson(seq);
        }

        // IE11 LCIE replaces its tab process after initial load. The old
        // Internet_Explorer_Server window briefly lingers while the new one
        // starts, causing either RPC_SERVER_UNAVAILABLE (old process dying)
        // or IE_DOCUMENT_NOT_FOUND (window gone). Retry with a short delay
        // to let the new tab process finish initialising.
        for (int attempt = 0; attempt < MAX_DOC_RETRIES; attempt++)
        {
            dynamic? doc = GetDocument(new IntPtr(req.Hwnd));
            if (doc == null)
            {
                if (attempt < MAX_DOC_RETRIES - 1)
                {
                    System.Threading.Thread.Sleep(DOC_RETRY_DELAY_MS);
                    continue;
                }
                return ErrJson(seq, "IE_DOCUMENT_NOT_FOUND");
            }

            try
            {
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
            catch (System.Runtime.InteropServices.COMException ex)
                when (ex.HResult == RPC_SERVER_UNAVAILABLE && attempt < MAX_DOC_RETRIES - 1)
            {
                System.Threading.Thread.Sleep(DOC_RETRY_DELAY_MS);
            }
        }

        return ErrJson(seq, "IE_DOCUMENT_NOT_FOUND");
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

    // IDocumentSelector (querySelector/querySelectorAll) and StaticNodeList have no
    // cross-process COM proxy in IE11. Solution: run the selector entirely inside IE
    // via execScript, write matched elements' sourceIndex values to a hidden store node,
    // then retrieve each element with doc.all.item(idx) — O(5+k) COM calls regardless
    // of page size (k = number of matched elements).
    //
    // findScript may also set window.__ieb_err to a non-empty string to surface
    // diagnostic information when no results are found.
    static string FindBySourceIndex(int seq, dynamic doc, dynamic win, string findScript, bool multi)
    {
        string storeId  = $"__ieb_{seq}";
        string storeEsc = JsEscape(storeId);

        win.execScript(
            $"(function(){{" +
            $"window.__ieb_idx=[];" +
            $"window.__ieb_err='';" +
            $"{findScript}" +
            $"var b=document.body||document.documentElement;" +
            $"var s=document.createElement('span');" +
            $"s.id={storeEsc};s.style.display='none';" +
            $"s.setAttribute('data-ieb',window.__ieb_idx.join(','));" +
            $"s.setAttribute('data-ieb-err',window.__ieb_err||'');" +
            $"b.appendChild(s);" +
            $"delete window.__ieb_idx;" +
            $"delete window.__ieb_err;" +
            $"}})();",
            "JScript");

        dynamic store = doc.getElementById(storeId);
        if (store == null)
            return multi ? OkJsonList(seq, "elementIds", new List<string>()) : ErrJson(seq, "NO_SUCH_ELEMENT");

        string raw    = (string)(store.getAttribute("data-ieb",     0) ?? "");
        string errMsg = (string)(store.getAttribute("data-ieb-err", 0) ?? "");

        win.execScript(
            $"(function(){{var s=document.getElementById({storeEsc});if(s)s.parentNode.removeChild(s);}})();",
            "JScript");

        // Surface diagnostic error when there are no results so callers can see exactly why.
        if (!string.IsNullOrEmpty(errMsg) && string.IsNullOrEmpty(raw))
            return ErrJson(seq, $"DIAG: {errMsg}");

        if (string.IsNullOrEmpty(raw))
            return multi ? OkJsonList(seq, "elementIds", new List<string>()) : ErrJson(seq, "NO_SUCH_ELEMENT");

        dynamic all = doc.all;
        var ids = new List<string>();
        foreach (string part in raw.Split(','))
        {
            if (!int.TryParse(part.Trim(), out int idx)) continue;
            try { ids.Add(Register((dynamic)all.item(idx, 0))); }
            catch { }
            if (!multi && ids.Count > 0) break;
        }

        return multi
            ? OkJsonList(seq, "elementIds", ids)
            : (ids.Count > 0 ? OkJson(seq, "elementId", ids[0]) : ErrJson(seq, "NO_SUCH_ELEMENT"));
    }

    static string FindByCss(int seq, dynamic doc, string css, bool multi)
    {
        try
        {
            if (!multi)
            {
                dynamic single = doc.querySelector(css);
                if (single == null) return ErrJson(seq, "NO_SUCH_ELEMENT");
                return OkJson(seq, "elementId", Register(single));
            }
            string escaped   = JsEscape(css);
            string findScript = $"var els=document.querySelectorAll({escaped});for(var i=0;i<els.length;i++)window.__ieb_idx.push(els[i].sourceIndex);";
            return FindBySourceIndex(seq, doc, doc.parentWindow, findScript, multi: true);
        }
        catch (Exception ex) { return ErrJson(seq, ex.Message); }
    }

    static string FindByXpath(int seq, dynamic doc, string xpath, bool multi)
    {
        try
        {
            string escaped = JsEscape(xpath);
            // Primary: DOM-based XPath subset — works in all IE document modes, no document.evaluate needed.
            // Handles: //tag  //tag[@attr="val"]  //tag[contains(text(),"...")]
            //          //tag[contains(@attr,"...")]  //tag[@attr]
            // Fallback to document.evaluate for patterns the parser cannot handle (IE11 standards mode only).
            string findScript =
                "(function(){" +
                "  var xpath=" + escaped + ";" +
                "  var multi=" + (multi ? "true" : "false") + ";" +
                "  function matchPred(el,pred){" +
                "    if(!pred) return true;" +
                "    var m;" +
                // @attr="val" or @attr='val'
                "    m=/^@([\\w-]+)=[\"']([^\"']*)[\"']$/.exec(pred);" +
                "    if(m) return el.getAttribute(m[1])===m[2];" +
                // contains(text(),"...") or contains(text(),'...')
                "    m=/^contains\\(text\\(\\),[\"']([^\"']*)[\"']\\)$/.exec(pred);" +
                "    if(m){var t=el.innerText||el.textContent||'';return t.indexOf(m[1])!==-1;}" +
                // contains(@attr,"...")
                "    m=/^contains\\(@([\\w-]+),[\"']([^\"']*)[\"']\\)$/.exec(pred);" +
                "    if(m) return (el.getAttribute(m[1])||'').indexOf(m[2])!==-1;" +
                // @attr (existence)
                "    m=/^@([\\w-]+)$/.exec(pred);" +
                "    if(m) return el.getAttribute(m[1])!==null;" +
                "    return null;" + // null signals unsupported predicate
                "  }" +
                "  var m=/^\\/\\/([a-zA-Z*][a-zA-Z0-9_-]*)(?:\\[(.+?)\\])?$/.exec(xpath);" +
                "  if(!m){" +
                // Pattern not handled by DOM parser — try document.evaluate (IE11 standards mode only)
                "    if(typeof document.evaluate!=='undefined'){" +
                "      var rt=multi?7:9,xr;" +
                "      try{xr=document.evaluate(xpath,document,null,rt,null);}catch(e){window.__ieb_err='evaluate threw: '+e.message;return;}" +
                "      if(rt===9){var n=xr.singleNodeValue;if(n&&typeof n.sourceIndex!=='undefined')window.__ieb_idx.push(n.sourceIndex);}" +
                "      else if(typeof xr.snapshotLength!=='undefined'){for(var i=0;i<xr.snapshotLength;i++){var n=xr.snapshotItem(i);if(n&&typeof n.sourceIndex!=='undefined')window.__ieb_idx.push(n.sourceIndex);}}" +
                "    } else {window.__ieb_err='xpath pattern not supported and document.evaluate unavailable: '+xpath;}" +
                "    return;" +
                "  }" +
                "  var tag=m[1]==='*'?null:m[1],pred=m[2]||null;" +
                "  var nodes=tag?document.getElementsByTagName(tag):document.getElementsByTagName('*');" +
                "  for(var i=0;i<nodes.length;i++){" +
                "    var el=nodes[i];" +
                "    var r=matchPred(el,pred);" +
                "    if(r===null){window.__ieb_err='predicate not supported: '+pred;return;}" +
                "    if(r&&typeof el.sourceIndex!=='undefined'){" +
                "      window.__ieb_idx.push(el.sourceIndex);" +
                "      if(!multi) return;" +
                "    }" +
                "  }" +
                "})();";

            return FindBySourceIndex(seq, doc, doc.parentWindow, findScript, multi);
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
