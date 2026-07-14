package io.verisoft.appium;

import javax.accessibility.Accessible;
import java.awt.*;
import java.lang.ref.WeakReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class ComponentRegistry {

    private final String pid;
    private final ConcurrentHashMap<Integer, WeakReference<Object>> map = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    public ComponentRegistry(String pid) {
        this.pid = pid;
    }

    public String save(Component c) {
        int id = nextId.getAndIncrement();
        map.put(id, new WeakReference<>(c));
        return makeId(id);
    }

    /** Store a non-Component Accessible (e.g. virtual list items, table cells). */
    public String saveAccessible(Accessible a) {
        int id = nextId.getAndIncrement();
        map.put(id, new WeakReference<>(a));
        return makeId(id);
    }

    public Component get(String elementId) {
        Object obj = getRaw(elementId);
        if (!(obj instanceof Component))
            throw new IllegalStateException("Element is a virtual Accessible, not a Component: " + elementId);
        return (Component) obj;
    }

    /** Returns the stored object as Accessible. Works for both Component and virtual Accessible. */
    public Accessible getAccessible(String elementId) {
        Object obj = getRaw(elementId);
        if (obj instanceof Accessible) return (Accessible) obj;
        throw new IllegalStateException("Element is not Accessible: " + elementId);
    }

    public boolean isComponent(String elementId) {
        try {
            return getRaw(elementId) instanceof Component;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isAlive(String elementId) {
        try {
            int id = parseId(elementId);
            WeakReference<Object> ref = map.get(id);
            return ref != null && ref.get() != null;
        } catch (Exception e) {
            return false;
        }
    }

    public String makeId(int localId) {
        return "java:" + pid + ":" + localId;
    }

    private Object getRaw(String elementId) {
        int id = parseId(elementId);
        WeakReference<Object> ref = map.get(id);
        if (ref == null) throw new IllegalArgumentException("Unknown element: " + elementId);
        Object obj = ref.get();
        if (obj == null) throw new IllegalStateException("Element GC'd: " + elementId);
        return obj;
    }

    private int parseId(String elementId) {
        // format: java:{pid}:{localId}
        String[] parts = elementId.split(":");
        if (parts.length != 3) throw new IllegalArgumentException("Bad element id: " + elementId);
        return Integer.parseInt(parts[2]);
    }
}
