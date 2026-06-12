package io.verisoft.appium;

import java.awt.*;
import java.lang.ref.WeakReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class ComponentRegistry {

    private final String pid;
    private final ConcurrentHashMap<Integer, WeakReference<Component>> map = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    public ComponentRegistry(String pid) {
        this.pid = pid;
    }

    public String save(Component c) {
        int id = nextId.getAndIncrement();
        map.put(id, new WeakReference<>(c));
        return makeId(id);
    }

    public Component get(String elementId) {
        int id = parseId(elementId);
        WeakReference<Component> ref = map.get(id);
        if (ref == null) throw new IllegalArgumentException("Unknown element: " + elementId);
        Component c = ref.get();
        if (c == null) throw new IllegalStateException("Element GC'd: " + elementId);
        return c;
    }

    public boolean isAlive(String elementId) {
        try {
            int id = parseId(elementId);
            WeakReference<Component> ref = map.get(id);
            return ref != null && ref.get() != null;
        } catch (Exception e) {
            return false;
        }
    }

    public String makeId(int localId) {
        return "java:" + pid + ":" + localId;
    }

    private int parseId(String elementId) {
        // format: java:{pid}:{localId}
        String[] parts = elementId.split(":");
        if (parts.length != 3) throw new IllegalArgumentException("Bad element id: " + elementId);
        return Integer.parseInt(parts[2]);
    }
}
