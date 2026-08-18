using System.Globalization;
using System.Text;

namespace AppiumDotNetBridgeCore;

/// <summary>
/// Hand-rolled JSON (no System.Text.Json dependency needed, but kept dependency-free anyway to
/// stay a byte-for-byte protocol match with BridgeAgent.cpp's own hand-rolled Json class — both
/// sides of the wire must agree on number/escape formatting). Parses into:
/// Dictionary&lt;string, object?&gt; (object), List&lt;object?&gt; (array), string, double (boxed),
/// bool (boxed), or null.
/// </summary>
internal static class Json
{
    public static object? Parse(string text)
    {
        int pos = 0;
        return ParseValue(text, ref pos);
    }

    public static string Write(object? value)
    {
        var sb = new StringBuilder();
        WriteValue(value, sb);
        return sb.ToString();
    }

    private static void SkipWs(string s, ref int pos)
    {
        while (pos < s.Length && char.IsWhiteSpace(s[pos])) pos++;
    }

    private static object? ParseValue(string s, ref int pos)
    {
        SkipWs(s, ref pos);
        if (pos >= s.Length) return null;
        char c = s[pos];
        if (c == '{') return ParseObject(s, ref pos);
        if (c == '[') return ParseArray(s, ref pos);
        if (c == '"') return ParseString(s, ref pos);
        if (s.Length - pos >= 4 && s.Substring(pos, 4) == "true") { pos += 4; return true; }
        if (s.Length - pos >= 5 && s.Substring(pos, 5) == "false") { pos += 5; return false; }
        if (s.Length - pos >= 4 && s.Substring(pos, 4) == "null") { pos += 4; return null; }
        return ParseNumber(s, ref pos);
    }

    private static Dictionary<string, object?> ParseObject(string s, ref int pos)
    {
        var dict = new Dictionary<string, object?>();
        pos++; // '{'
        SkipWs(s, ref pos);
        if (pos < s.Length && s[pos] == '}') { pos++; return dict; }
        while (true)
        {
            SkipWs(s, ref pos);
            string key = ParseString(s, ref pos);
            SkipWs(s, ref pos);
            pos++; // ':'
            object? val = ParseValue(s, ref pos);
            dict[key] = val;
            SkipWs(s, ref pos);
            if (pos < s.Length && s[pos] == ',') { pos++; continue; }
            if (pos < s.Length && s[pos] == '}') { pos++; break; }
            break;
        }
        return dict;
    }

    private static List<object?> ParseArray(string s, ref int pos)
    {
        var list = new List<object?>();
        pos++; // '['
        SkipWs(s, ref pos);
        if (pos < s.Length && s[pos] == ']') { pos++; return list; }
        while (true)
        {
            object? val = ParseValue(s, ref pos);
            list.Add(val);
            SkipWs(s, ref pos);
            if (pos < s.Length && s[pos] == ',') { pos++; continue; }
            if (pos < s.Length && s[pos] == ']') { pos++; break; }
            break;
        }
        return list;
    }

    private static string ParseString(string s, ref int pos)
    {
        var sb = new StringBuilder();
        pos++; // opening quote
        while (pos < s.Length && s[pos] != '"')
        {
            char c = s[pos];
            if (c == '\\' && pos + 1 < s.Length)
            {
                pos++;
                char esc = s[pos];
                switch (esc)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'u':
                        {
                            string hex = s.Substring(pos + 1, 4);
                            int code = Convert.ToInt32(hex, 16);
                            sb.Append((char)code);
                            pos += 4;
                            break;
                        }
                    default: sb.Append(esc); break;
                }
            }
            else
            {
                sb.Append(c);
            }
            pos++;
        }
        pos++; // closing quote
        return sb.ToString();
    }

    private static object ParseNumber(string s, ref int pos)
    {
        int start = pos;
        while (pos < s.Length && (char.IsDigit(s[pos]) || s[pos] == '-' || s[pos] == '+' || s[pos] == '.' || s[pos] == 'e' || s[pos] == 'E'))
            pos++;
        string numStr = s.Substring(start, pos - start);
        double.TryParse(numStr, NumberStyles.Float, CultureInfo.InvariantCulture, out double d);
        return d;
    }

    private static void WriteValue(object? value, StringBuilder sb)
    {
        switch (value)
        {
            case null: sb.Append("null"); return;
            case string s: WriteString(s, sb); return;
            case bool b: sb.Append(b ? "true" : "false"); return;
            case double d: sb.Append(Convert.ToString(d, CultureInfo.InvariantCulture)); return;
            case int i: sb.Append(Convert.ToString(i, CultureInfo.InvariantCulture)); return;
            case Dictionary<string, object?> dict:
                sb.Append('{');
                bool firstEntry = true;
                foreach (var kv in dict)
                {
                    if (!firstEntry) sb.Append(',');
                    firstEntry = false;
                    WriteString(kv.Key, sb);
                    sb.Append(':');
                    WriteValue(kv.Value, sb);
                }
                sb.Append('}');
                return;
            case System.Collections.IEnumerable list:
                sb.Append('[');
                bool firstItem = true;
                foreach (object? item in list)
                {
                    if (!firstItem) sb.Append(',');
                    firstItem = false;
                    WriteValue(item, sb);
                }
                sb.Append(']');
                return;
            default:
                WriteString(value.ToString() ?? "", sb);
                return;
        }
    }

    private static void WriteString(string s, StringBuilder sb)
    {
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }
}
