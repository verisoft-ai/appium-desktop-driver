package io.verisoft.appium;

import javax.accessibility.Accessible;
import java.awt.*;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Maps opaque element ids to the live Swing {@link Component} / virtual {@link Accessible}
 * they refer to.
 *
 * <p>Handles are held with <b>strong</b> references. An earlier version used
 * {@code WeakReference}, but virtual JAB wrappers (e.g. {@code AccessibleJTableCell},
 * list items) are throwaway objects created fresh on every {@code getAccessibleChild()}
 * call — nothing else in the JVM keeps them alive, so GC reclaimed them almost
 * immediately. A later {@code getInfo}/{@code getProperty} then failed with
 * "Element GC'd", which surfaced to the driver as an unexplained find failure or an
 * empty attribute (see TableRow/TableColumn coming back "").
 *
 * <p>Two safeguards keep the strong map from growing without bound over a long
 * session:
 * <ul>
 *   <li><b>Dedup</b> — saving the same object twice returns its existing id
 *       (identity comparison), so repeated {@code findAll} scans of the same tree
 *       don't mint a new id per element per call.</li>
 *   <li><b>LRU cap</b> — the map is bounded to {@link #MAX_ENTRIES}; the
 *       least-recently-used entry is evicted when the cap is exceeded. An evicted
 *       id behaves exactly like a GC'd one did before (lookup throws), which the
 *       driver already tolerates by re-finding the element.</li>
 * </ul>
 */
public class ComponentRegistry {

    /** Upper bound on live handles. Large enough for any real UI tree; small enough to bound memory. */
    static final int MAX_ENTRIES = 100_000;

    private final String pid;

    /** id -> live object. access-order LinkedHashMap so eviction drops the least-recently-used entry. */
    private final LinkedHashMap<Integer, Object> map = new LinkedHashMap<Integer, Object>(1024, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Integer, Object> eldest) {
            if (size() <= MAX_ENTRIES) {
                return false;
            }
            reverse.remove(eldest.getValue());
            return true;
        }
    };

    /** object -> id, by identity, so re-saving the same object reuses its id instead of leaking. */
    private final IdentityHashMap<Object, Integer> reverse = new IdentityHashMap<Object, Integer>();

    private final AtomicInteger nextId = new AtomicInteger(1);

    public ComponentRegistry(String pid) {
        this.pid = pid;
    }

    public String save(Component c) {
        return makeId(intern(c));
    }

    /** Store a non-Component Accessible (e.g. virtual list items, table cells). */
    public String saveAccessible(Accessible a) {
        return makeId(intern(a));
    }

    private synchronized int intern(Object obj) {
        Integer existing = reverse.get(obj);
        if (existing != null) {
            map.get(existing); // touch for LRU access-order
            return existing;
        }
        int id = nextId.getAndIncrement();
        map.put(id, obj);
        reverse.put(obj, id);
        return id;
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
            synchronized (this) {
                return map.containsKey(id);
            }
        } catch (Exception e) {
            return false;
        }
    }

    public String makeId(int localId) {
        return "java:" + pid + ":" + localId;
    }

    private Object getRaw(String elementId) {
        int id = parseId(elementId);
        Object obj;
        synchronized (this) {
            obj = map.get(id); // touch for LRU access-order
        }
        if (obj == null) throw new IllegalStateException("Element not in registry (evicted or never saved): " + elementId);
        return obj;
    }

    private int parseId(String elementId) {
        // format: java:{pid}:{localId}
        String[] parts = elementId.split(":");
        if (parts.length != 3) throw new IllegalArgumentException("Bad element id: " + elementId);
        return Integer.parseInt(parts[2]);
    }
}
