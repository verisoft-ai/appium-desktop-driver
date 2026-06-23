package io.verisoft.appium;

import javax.accessibility.*;
import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
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
            case "isAlive":        return registry.isAlive((String) params.get("id"));
            case "getToggleState": return getToggleState(params, registry);
            default: throw new IllegalArgumentException("Unknown command: " + command);
        }
    }

    // ── Window root ────────────────────────────────────────────────────────────

    private static Object getWindowRoot(Map<String, Object> params, ComponentRegistry registry) {
        long targetHwnd = ((Number) params.get("hwnd")).longValue();

        for (Window w : Window.getWindows()) {
            if (!w.isShowing()) continue;
            long hwnd = getHwnd(w);
            if (hwnd == targetHwnd) {
                String id = registry.save(w);
                return buildInfo(w, id);
            }
        }
        throw new IllegalStateException("No visible Java window found for hwnd=" + targetHwnd);
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
        Component parent = registry.get((String) params.get("id"));
        List<Map<String, Object>> result = new ArrayList<>();
        AccessibleContext ac = parent.getAccessibleContext();
        if (ac == null) return result;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child instanceof Component) {
                Component cc = (Component) child;
                String cid = registry.save(cc);
                result.add(buildInfo(cc, cid));
            }
        }
        return result;
    }

    // ── Info ───────────────────────────────────────────────────────────────────

    private static Object getInfo(Map<String, Object> params, ComponentRegistry registry) {
        Component c = registry.get((String) params.get("id"));
        return buildInfo(c, (String) params.get("id"));
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

    // ── Find ───────────────────────────────────────────────────────────────────

    private static Object findFirst(Map<String, Object> params, ComponentRegistry registry) {
        Component root = registry.get((String) params.get("rootId"));
        @SuppressWarnings("unchecked")
        Map<String, Object> condition = (Map<String, Object>) params.get("condition");
        String scope = (String) params.getOrDefault("scope", "descendants");

        if ("element".equals(scope)) {
            return matchesCondition(root, condition) ? (Object) params.get("rootId") : null;
        }
        if ("children".equals(scope)) {
            return findInDirectChildren(root, condition, registry);
        }
        boolean includeSelf = "subtree".equals(scope);
        return findFirstRecursive(root, condition, includeSelf, registry, 0);
    }

    private static Object findAll(Map<String, Object> params, ComponentRegistry registry) {
        Component root = registry.get((String) params.get("rootId"));
        @SuppressWarnings("unchecked")
        Map<String, Object> condition = (Map<String, Object>) params.get("condition");
        String scope = (String) params.getOrDefault("scope", "descendants");

        List<String> results = new ArrayList<>();
        if ("element".equals(scope)) {
            if (matchesCondition(root, condition)) results.add((String) params.get("rootId"));
            return results;
        }
        if ("children".equals(scope)) {
            collectDirectChildren(root, condition, registry, results);
            return results;
        }
        boolean includeSelf = "subtree".equals(scope);
        findAllRecursive(root, condition, includeSelf, registry, results, 0);
        return results;
    }

    private static String findInDirectChildren(Component parent, Map<String, Object> condition, ComponentRegistry registry) {
        AccessibleContext ac = parent.getAccessibleContext();
        if (ac == null) return null;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) return registry.save(cc);
            }
        }
        return null;
    }

    private static void collectDirectChildren(Component parent, Map<String, Object> condition, ComponentRegistry registry, List<String> results) {
        AccessibleContext ac = parent.getAccessibleContext();
        if (ac == null) return;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (child instanceof Component) {
                Component cc = (Component) child;
                if (matchesCondition(cc, condition)) results.add(registry.save(cc));
            }
        }
    }

    private static String findFirstRecursive(Component node, Map<String, Object> condition,
            boolean includeSelf, ComponentRegistry registry, int depth) {
        if (depth > 100) return null;
        if (includeSelf && matchesCondition(node, condition)) {
            return registry.save(node);
        }
        AccessibleContext ac = node.getAccessibleContext();
        if (ac == null) return null;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (!(child instanceof Component)) continue;
            Component cc = (Component) child;
            if (matchesCondition(cc, condition)) return registry.save(cc);
            String found = findFirstRecursive(cc, condition, false, registry, depth + 1);
            if (found != null) return found;
        }
        return null;
    }

    private static void findAllRecursive(Component node, Map<String, Object> condition,
            boolean includeSelf, ComponentRegistry registry, List<String> results, int depth) {
        if (depth > 100) return;
        if (includeSelf && matchesCondition(node, condition)) {
            results.add(registry.save(node));
        }
        AccessibleContext ac = node.getAccessibleContext();
        if (ac == null) return;
        int count = ac.getAccessibleChildrenCount();
        for (int i = 0; i < count; i++) {
            Accessible child = ac.getAccessibleChild(i);
            if (!(child instanceof Component)) continue;
            Component cc = (Component) child;
            if (matchesCondition(cc, condition)) results.add(registry.save(cc));
            findAllRecursive(cc, condition, false, registry, results, depth + 1);
        }
    }

    // ── Condition matching ─────────────────────────────────────────────────────

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

    // ── Text access ────────────────────────────────────────────────────────────

    private static Object getValue(Map<String, Object> params, ComponentRegistry registry) {
        Component c = registry.get((String) params.get("id"));
        return getComponentText(c);
    }

    static String getComponentText(Component c) {
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
        Component c = registry.get((String) params.get("id"));

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
        Component c = registry.get((String) params.get("id"));
        AccessibleContext ac = c.getAccessibleContext();
        if (ac == null) return "Off";
        AccessibleStateSet states = ac.getAccessibleStateSet();
        if (states == null) return "Off";
        if (states.contains(AccessibleState.INDETERMINATE)) return "Indeterminate";
        if (states.contains(AccessibleState.CHECKED)) return "On";
        if (states.contains(AccessibleState.SELECTED)) return "On";
        return "Off";
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static String nullToEmpty(String s) {
        return s != null ? s : "";
    }
}
