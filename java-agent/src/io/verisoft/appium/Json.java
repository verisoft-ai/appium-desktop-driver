package io.verisoft.appium;

import java.util.*;

/**
 * Minimal JSON parser and serializer — no external dependencies.
 * Handles the subset needed for agent IPC: objects, arrays, strings, numbers, booleans, null.
 */
public class Json {

    // ── Serialization ─────────────────────────────────────────────────────────

    public static String stringify(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String) {
            sb.append('"');
            escapeString(sb, (String) value);
            sb.append('"');
        } else if (value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Number) {
            sb.append(value);
        } else if (value instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) value).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append('"');
                escapeString(sb, String.valueOf(e.getKey()));
                sb.append("\":");
                write(sb, e.getValue());
            }
            sb.append('}');
        } else if (value instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
        } else if (value instanceof Object[]) {
            sb.append('[');
            boolean first = true;
            for (Object item : (Object[]) value) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
        } else {
            sb.append('"');
            escapeString(sb, value.toString());
            sb.append('"');
        }
    }

    private static void escapeString(StringBuilder sb, String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
    }

    public static String response(int id, Object result, String error) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        if (error != null) {
            map.put("error", error);
        } else {
            map.put("result", result);
        }
        return stringify(map);
    }

    // ── Parsing ────────────────────────────────────────────────────────────────

    public static Map<String, Object> parseObject(String json) {
        Parser p = new Parser(json.trim());
        Object v = p.parseValue();
        if (!(v instanceof Map)) throw new IllegalArgumentException("Expected JSON object");
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) v;
        return result;
    }

    private static class Parser {
        final String src;
        int pos;

        Parser(String src) { this.src = src; }

        Object parseValue() {
            skipWs();
            if (pos >= src.length()) throw new IllegalArgumentException("Unexpected end of input");
            char c = src.charAt(pos);
            if (c == '{') return parseObject();
            if (c == '[') return parseArray();
            if (c == '"') return parseString();
            if (c == 't') { pos += 4; return Boolean.TRUE; }
            if (c == 'f') { pos += 5; return Boolean.FALSE; }
            if (c == 'n') { pos += 4; return null; }
            return parseNumber();
        }

        Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            skipWs();
            if (peek() == '}') { pos++; return map; }
            while (true) {
                String key = parseString();
                skipWs(); expect(':');
                Object val = parseValue();
                map.put(key, val);
                skipWs();
                char next = src.charAt(pos++);
                if (next == '}') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or '}' at " + pos);
            }
            return map;
        }

        List<Object> parseArray() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skipWs();
            if (peek() == ']') { pos++; return list; }
            while (true) {
                list.add(parseValue());
                skipWs();
                char next = src.charAt(pos++);
                if (next == ']') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or ']' at " + pos);
            }
            return list;
        }

        String parseString() {
            skipWs(); expect('"');
            StringBuilder sb = new StringBuilder();
            while (pos < src.length()) {
                char c = src.charAt(pos++);
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    char esc = src.charAt(pos++);
                    switch (esc) {
                        case '"': sb.append('"'); break;
                        case '\\': sb.append('\\'); break;
                        case '/': sb.append('/'); break;
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'u':
                            String hex = src.substring(pos, pos + 4); pos += 4;
                            sb.append((char) Integer.parseInt(hex, 16));
                            break;
                        default: sb.append(esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            throw new IllegalArgumentException("Unterminated string");
        }

        Number parseNumber() {
            int start = pos;
            if (peek() == '-') pos++;
            while (pos < src.length() && (Character.isDigit(src.charAt(pos)) || src.charAt(pos) == '.' || src.charAt(pos) == 'e' || src.charAt(pos) == 'E' || src.charAt(pos) == '+' || src.charAt(pos) == '-')) pos++;
            String num = src.substring(start, pos);
            if (num.contains(".") || num.contains("e") || num.contains("E")) return Double.parseDouble(num);
            try { return Long.parseLong(num); } catch (NumberFormatException e) { return Double.parseDouble(num); }
        }

        void skipWs() { while (pos < src.length() && src.charAt(pos) <= ' ') pos++; }
        char peek() { skipWs(); return pos < src.length() ? src.charAt(pos) : 0; }
        void expect(char c) { skipWs(); if (src.charAt(pos) != c) throw new IllegalArgumentException("Expected '" + c + "' at " + pos + " got '" + src.charAt(pos) + "'"); pos++; }
    }
}
