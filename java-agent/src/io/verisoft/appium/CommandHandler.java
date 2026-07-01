package io.verisoft.appium;

import javax.accessibility.*;
import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;
import java.util.List;

public class CommandHandler {

    public static String handle(String requestLine, ComponentRegistry registry) {
        int id = 0;
        try {
            Map<String, Object> req = Json.parseObject(requestLine);
            id = ((Number) req.get("id")).intValue();
            String command = (String) req.get("command");
            @SuppressWarnings("unchecked")
            Map<String, Object> params = req.containsKey("params")
                    ? (Map<String, Object>) req.get("params")
                    : new HashMap<>();

            Object result = dispatch(command, params, registry);
            return Json.response(id, result, null);
        } catch (Exception e) {
            return Json.response(id, null, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
    }

    private static Object dispatch(String command, Map<String, Object> params, ComponentRegistry registry) throws Exception {
        switch (command) {
            case "getWindowRoot":  return getWindowRoot(params, registry);
            case "getChildren":    return getChildren(params, registry);
            case "getInfo":        return getInfo(params, registry);
            case "findFirst":      return findFirst(params, registry);
            case "findAll":        return findAll(params, registry);
            case "getValue":       return getValue(params, registry);
            case "setValue":       return setValue(params, registry);
            case "invoke":         return invokeAction(params, registry);
            case "expandElement":  return expandElement(params, registry);
            case "selectElement":  return selectElement(params, registry);
            case "isAlive":        return registry.isAlive((String) params.get("id")); // works for both Component and virtual
            case "getToggleState": return getToggleState(params, registry);
            case "requestFocus":   return requestFocus(params, registry);
            default: throw new IllegalArgumentException("Unknown command: " + command);
        }
    }

    // ── Window root ────────────────────────────────────────────────────────────

    private static Object getWindowRoot(Map<String, Object> params, ComponentRegistry registry) {
        long targetHwnd = ((Number) params.get("hwnd")).longValue();
        String targetTitle = params.containsKey("title") ? (String) params.get("title") : "";

        List<Window> visible = new ArrayList<>();
        for (Window w : Window.getWindows()) {
            if (!w.isShowing()) continue;
            long hwnd = getHwnd(w);
            if (hwnd != 0 && hwnd == targetHwnd) {
                String id = registry.save(w);
                return buildInfo(w, id);
            }
            visible.add(w);
        }

        // HWND match failed (getHwnd returns 0 on Java 9+ due to module encapsulation).
        // Secondary: match by window title passed from the C# UIA layer.
        if (targetTitle != null && !targetTitle.isEmpty()) {
            for (Window w : visible) {
                String wTitle = getWindowTitle(w);
                if (targetTitle.equals(wTitle)) {
                    String id = registry.save(w);
                    return buildInfo(w, id);
                }
            }
        }

        // Tertiary: single visible window is unambiguous — agent runs in-process
        // so all windows belong to the target app.
        if (visible.size() == 1) {
            Window w = visible.get(0);
            String id = registry.save(w);
            return buildInfo(w, id);
        }

        if (visible.isEmpty()) {
            throw new IllegalStateException("No visible Java window found for hwnd=" + targetHwnd);
        }

        // Multiple visible windows, no match — include diagnostics.
        StringBuilder sb = new StringBuilder(
                "No Java window matched hwnd=" + targetHwnd + " title=\"" + targetTitle +
                "\" and multiple visible windows exist. Visible windows:");
        for (Window w : visible) {
            sb.append("\n  hwnd=").append(getHwnd(w))
              .append(" title=\"").append(getWindowTitle(w)).append("\"");
        }
        throw new IllegalStateException(sb.toString());
    }

    private static String getWindowTitle(Window w) {
        if (w instanceof java.awt.Frame) return ((java.awt.Frame) w).getTitle();
        if (w instanceof java.awt.Dialog) return ((java.awt.Dialog) w).getTitle();
        return w.getClass().getSimpleName();
    }

    private static long getHwnd(Component c) {
        try {
            // Component.getPeer() is package-private — use reflection
            Method getPeer = Component.class.getDeclaredMethod("getPeer");
            getPeer.setAccessible(true);
            Object peer = getPeer.invoke(c);
            if (peer == null) return 0L;
            // getHWnd is declared on WComponentPeer, not always on the leaf peer class
            // (e.g. WDialogPeer extends WWindowPeer extends WComponentPeer).
            // getDeclaredMethod only searches the immediate class, so traverse the
            // hierarchy to find the declaration.
            Class<?> cls = peer.getClass();
            Method getHWnd = null;
            while (cls != null) {
                try {
                    getHWnd = cls.getDeclaredMethod("getHWnd");
                    break;
                } catch (NoSuchMethodException ignored) {
                    cls = cls.getSuperclass();
                }
            }
            if (getHWnd == null) return 0L;
            getHWnd.setAccessible(true);
            Object result = getHWnd.invoke(peer);
            return result instanceof Long ? (Long) result : ((Number) result).longValue();
        } catch (Exception e) {
            return 0L;
        }
    }

    // ── Children ───────────────────────────────────────────────────────────────

    private static Object getChildren(Map<String, Object> params, ComponentRegistry registry) {
        String id = (String) params.get("id");
        List<Map<String, Object>> result = new ArrayList<>();

        AccessibleContext ac;
        if (registry.isComponent(id)) {
            Component parent = registry.get(id);
            ac = parent.getAccessibleContext();
        } else {
            Accessible parent = registry.getAccessible(id);
            ac = parent.getAccessibleContext();
        }

        if (ac == null) return result;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child == null) continue;
            if (child instanceof Component) {
                Component cc = (Component) child;
                String cid = registry.save(cc);
                result.add(buildInfo(cc, cid));
            } else {
                // Virtual child (e.g. JList items, table cells) — not a Component but still Accessible
                String cid = registry.saveAccessible(child);
                result.add(buildInfoFromAccessible(child, cid));
            }
        }
        return result;
    }

    // ── Info ───────────────────────────────────────────────────────────────────

    private static Object getInfo(Map<String, Object> params, ComponentRegistry registry) {
        String id = (String) params.get("id");
        if (registry.isComponent(id)) {
            return buildInfo(registry.get(id), id);
        }
        return buildInfoFromAccessible(registry.getAccessible(id), id);
    }

    static Map<String, Object> buildInfo(Component c, String id) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", id);
        info.put("JavaClass", c.getClass().getName());
        info.put("JavaSimpleClass", c.getClass().getSimpleName());

        AccessibleContext ac = c.getAccessibleContext();
        if (ac != null) {
            info.put("Name", nullToEmpty(ac.getAccessibleName()));
            info.put("AutomationId", nullToEmpty(ac.getAccessibleName()));
            info.put("Description", nullToEmpty(ac.getAccessibleDescription()));
            AccessibleRole role = ac.getAccessibleRole();
            String roleStr = role != null ? role.toDisplayString(Locale.US) : "";
            info.put("ClassName", roleStr);
            info.put("LocalizedControlType", role != null ? role.toDisplayString() : "");

            AccessibleStateSet states = ac.getAccessibleStateSet();
            StringBuilder stateStr = new StringBuilder();
            if (states != null) {
                for (AccessibleState s : states.toArray()) {
                    if (stateStr.length() > 0) stateStr.append(",");
                    stateStr.append(s.toDisplayString(Locale.US).toLowerCase(Locale.US));
                }
            }
            info.put("States", stateStr.toString());
        } else {
            info.put("Name", "");
            info.put("AutomationId", "");
            info.put("Description", "");
            info.put("ClassName", c.getClass().getSimpleName());
            info.put("LocalizedControlType", "");
            info.put("States", "");
        }

        info.put("IsEnabled", c.isEnabled());
        info.put("IsOffscreen", !c.isShowing());

        // Bounds (screen coordinates)
        try {
            Point loc = c.getLocationOnScreen();
            Dimension size = c.getSize();
            info.put("x", loc.x);
            info.put("y", loc.y);
            info.put("width", size.width);
            info.put("height", size.height);
        } catch (IllegalComponentStateException e) {
            info.put("x", -1);
            info.put("y", -1);
            info.put("width", c.getWidth());
            info.put("height", c.getHeight());
        }

        // Child count
        int childCount = ac != null ? ac.getAccessibleChildrenCount() : 0;
        info.put("childCount", childCount);

        // Index in parent
        Container parent = c.getParent();
        if (parent != null) {
            info.put("IndexInParent", parent.getComponentZOrder(c));
        } else {
            info.put("IndexInParent", 0);
        }

        return info;
    }

    static Map<String, Object> buildInfoFromAccessible(Accessible a, String id) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("id", id);
        info.put("JavaClass", a.getClass().getName());
        info.put("JavaSimpleClass", a.getClass().getSimpleName());

        AccessibleContext ac = a.getAccessibleContext();
        if (ac != null) {
            info.put("Name", nullToEmpty(ac.getAccessibleName()));
            info.put("AutomationId", nullToEmpty(ac.getAccessibleName()));
            info.put("Description", nullToEmpty(ac.getAccessibleDescription()));
            AccessibleRole role = ac.getAccessibleRole();
            String roleStr = role != null ? role.toDisplayString(Locale.US) : "";
            info.put("ClassName", roleStr);
            info.put("LocalizedControlType", role != null ? role.toDisplayString() : "");

            AccessibleStateSet states = ac.getAccessibleStateSet();
            StringBuilder stateStr = new StringBuilder();
            if (states != null) {
                for (AccessibleState s : states.toArray()) {
                    if (stateStr.length() > 0) stateStr.append(",");
                    stateStr.append(s.toDisplayString(Locale.US).toLowerCase(Locale.US));
                }
            }
            info.put("States", stateStr.toString());

            boolean enabled = states != null && states.contains(AccessibleState.ENABLED);
            info.put("IsEnabled", enabled);

            // Bounds via AccessibleComponent
            AccessibleComponent comp = ac.getAccessibleComponent();
            if (comp != null) {
                try {
                    Point loc = comp.getLocationOnScreen();
                    Dimension size = comp.getSize();
                    info.put("x", loc.x);
                    info.put("y", loc.y);
                    info.put("width", size.width);
                    info.put("height", size.height);
                    info.put("IsOffscreen", false);
                } catch (Exception e) {
                    info.put("x", -1);
                    info.put("y", -1);
                    info.put("width", 0);
                    info.put("height", 0);
                    info.put("IsOffscreen", true);
                }
            } else {
                info.put("x", -1);
                info.put("y", -1);
                info.put("width", 0);
                info.put("height", 0);
                info.put("IsOffscreen", true);
            }

            info.put("childCount", ac.getAccessibleChildrenCount());
            info.put("IndexInParent", ac.getAccessibleIndexInParent());
        } else {
            info.put("Name", "");
            info.put("AutomationId", "");
            info.put("Description", "");
            info.put("ClassName", "");
            info.put("LocalizedControlType", "");
            info.put("States", "");
            info.put("IsEnabled", false);
            info.put("IsOffscreen", true);
            info.put("x", -1);
            info.put("y", -1);
            info.put("width", 0);
            info.put("height", 0);
            info.put("childCount", 0);
            info.put("IndexInParent", 0);
        }

        return info;
    }

    // ── Find ───────────────────────────────────────────────────────────────────

    private static Object findFirst(Map<String, Object> params, ComponentRegistry registry) {
        String rootId = (String) params.get("rootId");
        @SuppressWarnings("unchecked")
        Map<String, Object> condition = (Map<String, Object>) params.get("condition");
        String scope = (String) params.getOrDefault("scope", "descendants");

        if (registry.isComponent(rootId)) {
            Component root = registry.get(rootId);
            if ("element".equals(scope)) {
                return matchesCondition(root, condition) ? rootId : null;
            }
            if ("children".equals(scope)) {
                return findInDirectChildren(root.getAccessibleContext(), condition, registry);
            }
            boolean includeSelf = "subtree".equals(scope);
            Accessible rootAsAccessible = (root instanceof Accessible) ? (Accessible) root : null;
            return findFirstRecursive(root.getAccessibleContext(), includeSelf ? rootAsAccessible : null,
                    rootId, condition, registry, 0);
        } else {
            Accessible root = registry.getAccessible(rootId);
            AccessibleContext ac = root.getAccessibleContext();
            if ("element".equals(scope)) {
                return matchesAccessible(root, condition) ? rootId : null;
            }
            if ("children".equals(scope)) {
                return findInDirectChildren(ac, condition, registry);
            }
            boolean includeSelf = "subtree".equals(scope);
            return findFirstRecursive(ac, includeSelf ? root : null, rootId, condition, registry, 0);
        }
    }

    private static Object findAll(Map<String, Object> params, ComponentRegistry registry) {
        String rootId = (String) params.get("rootId");
        @SuppressWarnings("unchecked")
        Map<String, Object> condition = (Map<String, Object>) params.get("condition");
        String scope = (String) params.getOrDefault("scope", "descendants");

        List<String> results = new ArrayList<>();
        if (registry.isComponent(rootId)) {
            Component root = registry.get(rootId);
            if ("element".equals(scope)) {
                if (matchesCondition(root, condition)) results.add(rootId);
                return results;
            }
            if ("children".equals(scope)) {
                collectDirectChildren(root.getAccessibleContext(), condition, registry, results);
                return results;
            }
            boolean includeSelf = "subtree".equals(scope);
            Accessible rootAsAccessible = (root instanceof Accessible) ? (Accessible) root : null;
            findAllRecursive(root.getAccessibleContext(), includeSelf ? rootAsAccessible : null,
                    rootId, condition, registry, results, 0);
        } else {
            Accessible root = registry.getAccessible(rootId);
            AccessibleContext ac = root.getAccessibleContext();
            if ("element".equals(scope)) {
                if (matchesAccessible(root, condition)) results.add(rootId);
                return results;
            }
            if ("children".equals(scope)) {
                collectDirectChildren(ac, condition, registry, results);
                return results;
            }
            boolean includeSelf = "subtree".equals(scope);
            findAllRecursive(ac, includeSelf ? root : null, rootId, condition, registry, results, 0);
        }
        return results;
    }

    private static String findInDirectChildren(AccessibleContext ac, Map<String, Object> condition, ComponentRegistry registry) {
        if (ac == null) return null;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child == null) continue;
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) return registry.save(cc);
            } else {
                if (matchesAccessible(child, condition)) return registry.saveAccessible(child);
            }
        }
        return null;
    }

    private static void collectDirectChildren(AccessibleContext ac, Map<String, Object> condition, ComponentRegistry registry, List<String> results) {
        if (ac == null) return;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child == null) continue;
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) results.add(registry.save(cc));
            } else {
                if (matchesAccessible(child, condition)) results.add(registry.saveAccessible(child));
            }
        }
    }

    /**
     * @param ac          AccessibleContext of the node being searched
     * @param selfNode    non-null when includeSelf=true for this level
     * @param selfId      registry id of selfNode (used when selfNode matches)
     */
    private static String findFirstRecursive(AccessibleContext ac, Accessible selfNode, String selfId,
            Map<String, Object> condition, ComponentRegistry registry, int depth) {
        if (depth > 100) return null;
        if (selfNode != null) {
            boolean matches = (selfNode instanceof Component)
                    ? matchesCondition((Component) selfNode, condition)
                    : matchesAccessible(selfNode, condition);
            if (matches) return selfId;
        }
        if (ac == null) return null;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child == null) continue;
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) return registry.save(cc);
                String found = findFirstRecursive(cc.getAccessibleContext(), null, null,
                        condition, registry, depth + 1);
                if (found != null) return found;
            } else {
                if (matchesAccessible(child, condition)) return registry.saveAccessible(child);
                AccessibleContext childAc = child.getAccessibleContext();
                String found = findFirstRecursive(childAc, null, null, condition, registry, depth + 1);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void findAllRecursive(AccessibleContext ac, Accessible selfNode, String selfId,
            Map<String, Object> condition, ComponentRegistry registry, List<String> results, int depth) {
        if (depth > 100) return;
        if (selfNode != null) {
            boolean matches = (selfNode instanceof Component)
                    ? matchesCondition((Component) selfNode, condition)
                    : matchesAccessible(selfNode, condition);
            if (matches) results.add(selfId);
        }
        if (ac == null) return;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child == null) continue;
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) results.add(registry.save(cc));
                findAllRecursive(cc.getAccessibleContext(), null, null, condition, registry, results, depth + 1);
            } else {
                if (matchesAccessible(child, condition)) results.add(registry.saveAccessible(child));
                findAllRecursive(child.getAccessibleContext(), null, null, condition, registry, results, depth + 1);
            }
        }
    }

    // ── Condition matching ─────────────────────────────────────────────────────

    /** Matches a virtual (non-Component) Accessible against a condition. */
    static boolean matchesAccessible(Accessible a, Map<String, Object> condition) {
        if (condition == null) return true;
        String type = (String) condition.get("type");
        if (type == null || "true".equals(type)) return true;
        if ("false".equals(type)) return false;

        if ("not".equals(type)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> inner = (Map<String, Object>) condition.get("condition");
            return !matchesAccessible(a, inner);
        }
        if ("and".equals(type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conditions = (List<Map<String, Object>>) condition.get("conditions");
            if (conditions == null) return true;
            for (Map<String, Object> sub : conditions) {
                if (!matchesAccessible(a, sub)) return false;
            }
            return true;
        }
        if ("or".equals(type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conditions = (List<Map<String, Object>>) condition.get("conditions");
            if (conditions == null) return false;
            for (Map<String, Object> sub : conditions) {
                if (matchesAccessible(a, sub)) return true;
            }
            return false;
        }
        if ("property".equals(type)) {
            String prop = (String) condition.get("property");
            Object valObj = condition.get("value");
            String value = valObj instanceof String ? (String) valObj : String.valueOf(valObj);
            return matchesAccessibleProperty(a, prop, value);
        }
        return false;
    }

    private static boolean matchesAccessibleProperty(Accessible a, String property, String value) {
        AccessibleContext ac = a.getAccessibleContext();
        String prop = property.toLowerCase(Locale.US);
        switch (prop) {
            case "name":
            case "automationid": {
                String name = ac != null ? nullToEmpty(ac.getAccessibleName()) : "";
                return name.equals(value);
            }
            case "description":
            case "helptext": {
                String desc = ac != null ? nullToEmpty(ac.getAccessibleDescription()) : "";
                return desc.equals(value);
            }
            case "controltype":
            case "classname":
            case "localizedcontroltype": {
                if (ac == null) return false;
                AccessibleRole role = ac.getAccessibleRole();
                if (role == null) return false;
                if ("controltype".equals(prop)) {
                    String javaRole = uiaControlTypeToJavaRole(value);
                    return javaRole != null && role.toDisplayString(Locale.US).equalsIgnoreCase(javaRole);
                }
                String roleNorm = role.toDisplayString(Locale.US).toLowerCase(Locale.US).replaceAll("[\\s\\-_]+", "");
                String valueNorm = value.toLowerCase(Locale.US).replaceAll("[\\s\\-_]+", "");
                return roleNorm.equals(valueNorm);
            }
            case "javaclass":
                return a.getClass().getName().equals(value);
            case "javasimpleclass":
                return a.getClass().getSimpleName().equals(value);
            case "isenabled": {
                if (ac == null) return false;
                AccessibleStateSet states = ac.getAccessibleStateSet();
                boolean enabled = states != null && states.contains(AccessibleState.ENABLED);
                return enabled == parseBool(value);
            }
            case "indexinparent": {
                if (ac == null) return false;
                return String.valueOf(ac.getAccessibleIndexInParent()).equals(value);
            }
            default:
                return false;
        }
    }

    static boolean matchesCondition(Component c, Map<String, Object> condition) {
        if (condition == null) return true;
        String type = (String) condition.get("type");
        if (type == null || "true".equals(type)) return true;
        if ("false".equals(type)) return false;

        if ("not".equals(type)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> inner = (Map<String, Object>) condition.get("condition");
            return !matchesCondition(c, inner);
        }
        if ("and".equals(type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conditions = (List<Map<String, Object>>) condition.get("conditions");
            if (conditions == null) return true;
            for (Map<String, Object> sub : conditions) {
                if (!matchesCondition(c, sub)) return false;
            }
            return true;
        }
        if ("or".equals(type)) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conditions = (List<Map<String, Object>>) condition.get("conditions");
            if (conditions == null) return false;
            for (Map<String, Object> sub : conditions) {
                if (matchesCondition(c, sub)) return true;
            }
            return false;
        }
        if ("property".equals(type)) {
            String prop = (String) condition.get("property");
            Object valObj = condition.get("value");
            String value = valObj instanceof String ? (String) valObj : String.valueOf(valObj);
            return matchesProperty(c, prop, value);
        }
        return false;
    }

    private static boolean matchesProperty(Component c, String property, String value) {
        Map<String, Object> info = buildInfo(c, "");
        String prop = property.toLowerCase(Locale.US);

        switch (prop) {
            case "javaclass":
                return c.getClass().getName().equals(value);
            case "javasimpleclass":
                return c.getClass().getSimpleName().equals(value);
            case "name":
            case "automationid": {
                AccessibleContext ac = c.getAccessibleContext();
                String name = ac != null ? nullToEmpty(ac.getAccessibleName()) : "";
                return name.equals(value);
            }
            case "description":
            case "helptext": {
                AccessibleContext ac = c.getAccessibleContext();
                String desc = ac != null ? nullToEmpty(ac.getAccessibleDescription()) : "";
                return desc.equals(value);
            }
            case "controltype": {
                // Map UIA ControlType name → Java AccessibleRole display string, then match.
                String javaRole = uiaControlTypeToJavaRole(value);
                if (javaRole == null) return false;
                AccessibleContext ac = c.getAccessibleContext();
                if (ac == null) return false;
                AccessibleRole role = ac.getAccessibleRole();
                if (role == null) return false;
                return role.toDisplayString(Locale.US).equalsIgnoreCase(javaRole);
            }
            case "classname":
            case "localizedcontroltype": {
                // Normalize spaces/dashes/underscores so "root pane" matches "RootPane".
                AccessibleContext ac = c.getAccessibleContext();
                if (ac == null) return false;
                AccessibleRole role = ac.getAccessibleRole();
                if (role == null) return false;
                String roleNorm = role.toDisplayString(Locale.US).toLowerCase(Locale.US).replaceAll("[\\s\\-_]+", "");
                String valueNorm = value.toLowerCase(Locale.US).replaceAll("[\\s\\-_]+", "");
                return roleNorm.equals(valueNorm);
            }
            case "isenabled":
                return c.isEnabled() == parseBool(value);
            case "isoffscreen":
                return (!c.isShowing()) == parseBool(value);
            case "indexinparent": {
                Container parent = c.getParent();
                if (parent == null) return "0".equals(value);
                return String.valueOf(parent.getComponentZOrder(c)).equals(value);
            }
            default:
                return false;
        }
    }

    private static String uiaControlTypeToJavaRole(String uiaType) {
        switch (uiaType.toLowerCase(Locale.US)) {
            case "edit":          return "text";
            case "button":        return "push button";
            case "checkbox":      return "check box";
            case "combobox":      return "combo box";
            case "list":          return "list";
            case "listitem":      return "list item";
            case "text":          return "label";
            case "tree":          return "tree";
            case "treeitem":      return "tree node";
            case "pane":          return "panel";
            case "window":        return "frame";
            case "dialog":        return "dialog";
            case "menu":          return "menu";
            case "menubar":       return "menu bar";
            case "menuitem":      return "menu item";
            case "radiobutton":   return "radio button";
            case "slider":        return "slider";
            case "spinner":       return "spinbox";
            case "progressbar":   return "progress bar";
            case "table":         return "table";
            case "toolbar":       return "tool bar";
            case "tab":           return "page tab list";
            case "tabitem":       return "page tab";
            case "scrollbar":     return "scroll bar";
            case "separator":     return "separator";
            case "group":         return "panel";
            case "image":         return "icon";
            case "hyperlink":     return "hyperlink";
            default:              return null;
        }
    }

    private static boolean parseBool(String v) {
        return "true".equalsIgnoreCase(v) || "1".equals(v);
    }

    // ── Expand (open popup / dropdown) ────────────────────────────────────────

    private static Object expandElement(Map<String, Object> params, ComponentRegistry registry) throws Exception {
        String id = (String) params.get("id");
        AccessibleContext ac;
        if (registry.isComponent(id)) {
            ac = registry.get(id).getAccessibleContext();
        } else {
            ac = registry.getAccessible(id).getAccessibleContext();
        }
        if (ac == null) throw new RuntimeException("Element has no AccessibleContext — cannot expand");

        AccessibleAction aa = ac.getAccessibleAction();
        if (aa == null || aa.getAccessibleActionCount() == 0) {
            throw new RuntimeException("JAB_NO_EXPAND_ACTION");
        }

        final String[] error = {null};
        SwingUtilities.invokeAndWait(() -> {
            try { aa.doAccessibleAction(0); }
            catch (Exception e) { error[0] = e.getMessage(); }
        });
        if (error[0] != null) throw new RuntimeException("expand failed: " + error[0]);
        return null;
    }

    // ── Select (combo box / list item) ────────────────────────────────────────

    private static Object selectElement(Map<String, Object> params, ComponentRegistry registry) throws Exception {
        String id = (String) params.get("id");

        if (registry.isComponent(id)) {
            return invokeAction(params, registry);
        }

        Accessible a = registry.getAccessible(id);
        AccessibleContext itemAc = a.getAccessibleContext();
        if (itemAc == null) throw new RuntimeException("No AccessibleContext on virtual item: " + id);
        int index = itemAc.getAccessibleIndexInParent();
        if (index < 0) throw new RuntimeException("Virtual item has no valid index in parent: " + id);

        JList<?> jList = findOwningList(a);
        if (jList != null) {
            JComboBox<?> combo = findOwningCombo(jList);
            if (combo != null) {
                final JComboBox<?> finalCombo = combo;
                SwingUtilities.invokeAndWait(() -> {
                    finalCombo.setSelectedIndex(index);
                    finalCombo.setPopupVisible(false);
                });
                return null;
            }
            final JList<?> finalList = jList;
            SwingUtilities.invokeAndWait(() -> finalList.setSelectedIndex(index));
            return null;
        }

        // Fallback: invoke AccessibleAction[0]
        return invokeAction(params, registry);
    }

    private static JList<?> findOwningList(Accessible a) {
        AccessibleContext ac = a.getAccessibleContext();
        Accessible parent = ac != null ? ac.getAccessibleParent() : null;
        while (parent != null) {
            if (parent instanceof JList) return (JList<?>) parent;
            AccessibleContext pac = parent.getAccessibleContext();
            parent = pac != null ? pac.getAccessibleParent() : null;
        }
        return null;
    }

    private static JComboBox<?> findOwningCombo(JList<?> list) {
        // Lightweight popup: combo is a direct AWT ancestor
        Container ancestor = SwingUtilities.getAncestorOfClass(JComboBox.class, list);
        if (ancestor instanceof JComboBox) return (JComboBox<?>) ancestor;
        // Heavy-weight popup: popup is a separate window; walk via BasicComboPopup back-reference
        Container parent = list.getParent();
        while (parent != null) {
            try {
                Field f = parent.getClass().getDeclaredField("comboBox");
                f.setAccessible(true);
                Object val = f.get(parent);
                if (val instanceof JComboBox) return (JComboBox<?>) val;
            } catch (Exception ignored) {}
            parent = parent.getParent();
        }
        return null;
    }

    // ── Text access ────────────────────────────────────────────────────────────

    private static Object getValue(Map<String, Object> params, ComponentRegistry registry) {
        String id = (String) params.get("id");
        if (registry.isComponent(id)) {
            return getComponentText(registry.get(id));
        }
        Accessible a = registry.getAccessible(id);
        AccessibleContext ac = a.getAccessibleContext();
        if (ac != null) {
            AccessibleText at = ac.getAccessibleText();
            if (at != null && at.getCharCount() > 0) {
                AccessibleEditableText aet = ac.getAccessibleEditableText();
                if (aet != null) {
                    try { return aet.getTextRange(0, at.getCharCount()); } catch (Exception ignored) {}
                }
                // text read failed — name is not the value
                return "";
            }
            String name = ac.getAccessibleName();
            if (name != null && !name.isEmpty()) return name;
        }
        return "";
    }

    static String getComponentText(Component c) {
        // JComboBox: return the selected item's string, not the component name
        if (c instanceof JComboBox) {
            Object selected = ((JComboBox<?>) c).getSelectedItem();
            return selected != null ? selected.toString() : "";
        }
        AccessibleContext ac = c.getAccessibleContext();
        if (ac != null) {
            AccessibleText at = ac.getAccessibleText();
            if (at != null) {
                int count = at.getCharCount();
                if (count > 0) {
                    String text = at.getAtIndex(AccessibleText.WORD, 0);
                    // Use full text via EditableText if available
                    AccessibleEditableText aet = ac.getAccessibleEditableText();
                    if (aet != null) {
                        try {
                            return aet.getTextRange(0, count);
                        } catch (Exception ignored) {}
                    }
                    // Fallback: getText via reflection on JTextComponent
                    try {
                        Method m = c.getClass().getMethod("getText");
                        return String.valueOf(m.invoke(c));
                    } catch (Exception ignored) {}
                    return text;
                }
                return "";
            }
        }
        // Try reflection on any component with getText()
        try {
            Method m = c.getClass().getMethod("getText");
            Object result = m.invoke(c);
            return result != null ? String.valueOf(result) : "";
        } catch (Exception ignored) {}
        // Fall back to accessible name
        if (ac != null) return nullToEmpty(ac.getAccessibleName());
        return "";
    }

    // ── setValue ───────────────────────────────────────────────────────────────

    private static Object setValue(Map<String, Object> params, ComponentRegistry registry) throws Exception {
        Component c = registry.get((String) params.get("id"));
        String value = (String) params.get("value");

        final String[] error = {null};
        SwingUtilities.invokeAndWait(() -> {
            try {
                // Prefer AccessibleEditableText
                AccessibleContext ac = c.getAccessibleContext();
                if (ac != null) {
                    AccessibleEditableText aet = ac.getAccessibleEditableText();
                    if (aet != null) {
                        int len = aet.getCharCount();
                        if (len > 0) aet.delete(0, len);
                        aet.insertTextAtIndex(0, value);
                        return;
                    }
                }
                // Fallback: setText via reflection
                Method setText = c.getClass().getMethod("setText", String.class);
                setText.invoke(c, value);
            } catch (Exception e) {
                error[0] = e.getMessage();
            }
        });
        if (error[0] != null) throw new RuntimeException("setValue failed: " + error[0]);
        return null;
    }

    // ── invoke ─────────────────────────────────────────────────────────────────

    private static Object invokeAction(Map<String, Object> params, ComponentRegistry registry) throws Exception {
        String id = (String) params.get("id");

        if (!registry.isComponent(id)) {
            // Virtual Accessible (e.g. list item) — fire AccessibleAction[0]
            Accessible a = registry.getAccessible(id);
            final String[] error = {null};
            SwingUtilities.invokeAndWait(() -> {
                try {
                    AccessibleContext ac = a.getAccessibleContext();
                    if (ac != null) {
                        AccessibleAction aa = ac.getAccessibleAction();
                        if (aa != null && aa.getAccessibleActionCount() > 0) {
                            aa.doAccessibleAction(0);
                            return;
                        }
                    }
                    error[0] = "Virtual element has no AccessibleAction";
                } catch (Exception e) {
                    error[0] = e.getMessage();
                }
            });
            if (error[0] != null) throw new RuntimeException("invoke failed: " + error[0]);
            return null;
        }

        Component c = registry.get(id);
        final String[] error = {null};
        SwingUtilities.invokeAndWait(() -> {
            try {
                AccessibleContext ac = c.getAccessibleContext();
                if (ac != null) {
                    AccessibleAction aa = ac.getAccessibleAction();
                    if (aa != null && aa.getAccessibleActionCount() > 0) {
                        aa.doAccessibleAction(0);
                        return;
                    }
                }
                // Fallback: doClick() via reflection
                try {
                    Method doClick = c.getClass().getMethod("doClick");
                    doClick.invoke(c);
                } catch (NoSuchMethodException ignored) {
                    // Fire action event directly
                    c.dispatchEvent(new ActionEvent(c, ActionEvent.ACTION_PERFORMED, ""));
                }
            } catch (Exception e) {
                error[0] = e.getMessage();
            }
        });
        if (error[0] != null) throw new RuntimeException("invoke failed: " + error[0]);
        return null;
    }

    // ── toggle state ───────────────────────────────────────────────────────────

    private static Object getToggleState(Map<String, Object> params, ComponentRegistry registry) {
        String id = (String) params.get("id");
        AccessibleContext ac;
        if (registry.isComponent(id)) {
            ac = registry.get(id).getAccessibleContext();
        } else {
            ac = registry.getAccessible(id).getAccessibleContext();
        }
        if (ac == null) return "Off";
        AccessibleStateSet states = ac.getAccessibleStateSet();
        if (states == null) return "Off";
        if (states.contains(AccessibleState.INDETERMINATE)) return "Indeterminate";
        if (states.contains(AccessibleState.CHECKED)) return "On";
        if (states.contains(AccessibleState.SELECTED)) return "On";
        return "Off";
    }

    // ── Focus ──────────────────────────────────────────────────────────────────

    private static Object requestFocus(Map<String, Object> params, ComponentRegistry registry) throws Exception {
        String id = (String) params.get("id");
        Component c;
        if (registry.isComponent(id)) {
            c = registry.get(id);
        } else {
            // Virtual elements can't own focus — focus nearest Component ancestor (e.g. the JList)
            Accessible a = registry.getAccessible(id);
            c = findNearestComponentAncestor(a);
            if (c == null) return null;
        }
        SwingUtilities.invokeAndWait(c::requestFocusInWindow);
        return null;
    }

    private static Component findNearestComponentAncestor(Accessible a) {
        AccessibleContext ac = a.getAccessibleContext();
        Accessible parent = ac != null ? ac.getAccessibleParent() : null;
        while (parent != null) {
            if (parent instanceof Component) return (Component) parent;
            AccessibleContext pac = parent.getAccessibleContext();
            parent = pac != null ? pac.getAccessibleParent() : null;
        }
        return null;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static String nullToEmpty(String s) {
        return s != null ? s : "";
    }
}
