using System.Runtime.InteropServices;
using System.Text.Json;
using NovaUIAutomationServer.Java;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

/// <summary>
/// Fallback for legacy controls (Janus/ComponentOne-era ActiveX grids, custom-drawn
/// Win32 controls, etc.) that expose zero UIA children AND zero Win32 child windows.
/// Many of these still implement a hand-written IAccessible (MSAA) for screen-reader
/// compliance, exposing rows/cells as "simple children" — an integer childId with no
/// HWND and no IDispatch of its own. UIA's MSAA proxy doesn't surface those, and
/// EnumChildWindows can never see them either, since a simple child has no window at
/// all. This walks the raw IAccessible tree directly via AccessibleObjectFromWindow.
/// If accChildCount is 0 here too, the control paints its own content with no
/// accessibility tree either, and there is no structural data left to recover — use
/// the vision fallback (findByVision / analyzeScreen) instead.
/// </summary>
public static class AccessibilityCommands
{
    private const uint OBJID_CLIENT = unchecked((uint)-4);
    private static readonly Guid IID_IAccessible = new("618736E0-3C3D-11CF-810C-00AA00389B71");

    // Bounds recursion against controls that report a huge or cyclic accessible
    // tree (some legacy grids report every visible cell as a "row" child).
    private const int MaxDepth = 8;
    private const int MaxChildrenPerNode = 1000;

    [DllImport("oleacc.dll")]
    private static extern int AccessibleObjectFromWindow(
        IntPtr hwnd,
        uint dwId,
        ref Guid riid,
        [MarshalAs(UnmanagedType.IUnknown)] out object? ppvObject);

    // Vtable-order mirrors oleacc.idl's IAccessible exactly (IDispatch slots 0-6 are
    // implicit under InterfaceIsDual). This is the same shape tlbimp would generate
    // for the "Accessibility.IAccessible" interop type — declared by hand here so we
    // don't need a separate COM reference/assembly just for this one fallback.
    [ComImport]
    [Guid("618736E0-3C3D-11CF-810C-00AA00389B71")]
    [InterfaceType(ComInterfaceType.InterfaceIsDual)]
    private interface IAccessible
    {
        object? accParent { get; }
        int accChildCount { get; }
        object? accChild(object varChild);
        string? accName(object varChild);
        string? accValue(object varChild);
        string? accDescription(object varChild);
        object? accRole(object varChild);
        object? accState(object varChild);
        string? accHelp(object varChild);
        int accHelpTopic(out string? pszHelpFile, object varChild);
        string? accKeyboardShortcut(object varChild);
        object? accFocus { get; }
        object? accSelection { get; }
        string? accDefaultAction(object varChild);
        void accSelect(int flagsSelect, object varChild);
        void accLocation(out int pxLeft, out int pyTop, out int pcxWidth, out int pcyHeight, object varChild);
        object? accNavigate(int navDir, object varStart);
        object? accHitTest(int xLeft, int yTop);
        void accDoDefaultAction(object varChild);
        void set_accName(object varChild, string pszName);
        void set_accValue(object varChild, string pszValue);
    }

    public static object? GetAccessibleChildren(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        if (JavaAgentElement.IsJavaId(elementId))
        {
            throw new InvalidOperationException(
                "The MSAA (IAccessible) fallback does not apply to Java elements — JAB already exposes the full accessible tree via UIA.");
        }

        IntPtr hwnd;
        try
        {
            var element = state.GetElement(elementId);
            hwnd = element.CurrentNativeWindowHandle;
        }
        catch (Exception ex)
        {
            // Elements go stale constantly in this system (detached between find and
            // use, GC'd off the element table, RuntimeId no longer resolvable). That's
            // routine, not exceptional — degrade to unsupported instead of failing the
            // whole RPC call.
            return new
            {
                supported = false,
                reason = $"Could not resolve element or its native window handle: {ex.Message}",
            };
        }

        if (hwnd == IntPtr.Zero)
        {
            return new
            {
                supported = false,
                reason = "Element has no native window handle.",
            };
        }

        var riid = IID_IAccessible;
        var hr = AccessibleObjectFromWindow(hwnd, OBJID_CLIENT, ref riid, out var obj);
        if (hr != 0 || obj is not IAccessible root)
        {
            return new
            {
                supported = false,
                reason = $"AccessibleObjectFromWindow(OBJID_CLIENT, IID_IAccessible) failed with hr=0x{hr:X8}.",
            };
        }

        return new { supported = true, node = Describe(root, 0, 0) };
    }

    private static object Describe(IAccessible container, int childId, int depth)
    {
        object self = childId;

        var name = TryInvoke(() => container.accName(self));
        var role = RoleToString(TryInvoke(() => container.accRole(self)));
        var value = TryInvoke(() => container.accValue(self));
        var description = TryInvoke(() => container.accDescription(self));
        var state = StateToString(TryInvoke(() => container.accState(self)));
        var defaultAction = TryInvoke(() => container.accDefaultAction(self));

        int x = 0, y = 0, width = 0, height = 0;
        try
        {
            container.accLocation(out x, out y, out width, out height, self);
        }
        catch { /* not every simple child implements accLocation */ }

        var children = new List<object>();
        int childCount = 0;

        // Simple children (childId != 0) are leaves per the MSAA spec — a plain
        // integer childId has no accessible children of its own.
        if (childId == 0 && depth < MaxDepth)
        {
            childCount = TryInvoke(() => (int?)container.accChildCount) ?? 0;
            var iterationCount = Math.Min(childCount, MaxChildrenPerNode);

            for (var i = 1; i <= iterationCount; i++)
            {
                object? childObj = null;
                try
                {
                    childObj = container.accChild(i);
                }
                catch { /* index gap — skip */ }

                children.Add(childObj is IAccessible childAcc
                    ? Describe(childAcc, 0, depth + 1)
                    : Describe(container, i, depth + 1));
            }
        }

        return new
        {
            name,
            role,
            value,
            description,
            state,
            defaultAction,
            rect = new { x, y, width, height },
            childCount,
            truncated = childCount > MaxChildrenPerNode,
            children,
        };
    }

    private static T? TryInvoke<T>(Func<T?> fn)
    {
        try { return fn(); }
        catch { return default; }
    }

    // Subset of the standard MSAA ROLE_SYSTEM_* constants (oleacc.h). accRole can
    // also return a BSTR for custom roles, which we pass through as-is.
    private static readonly Dictionary<int, string> Roles = new()
    {
        [0x2B] = "CELL", [0x11] = "CLIENT", [0x12] = "COLUMN", [0x19] = "COLUMNHEADER",
        [0x08] = "DOCUMENT", [0x2F] = "GRAPHIC", [0x14] = "GRID", [0x21] = "GROUPING",
        [0x06] = "LIST", [0x22] = "LISTITEM", [0x0A] = "MENUITEM", [0x30] = "OUTLINE",
        [0x24] = "OUTLINEITEM", [0x12FE] = "PANE", [0x28] = "PROGRESSBAR", [0x18] = "ROW",
        [0x1A] = "ROWHEADER", [0x2E] = "SCROLLBAR", [0x2A] = "STATICTEXT", [0x29] = "STATUSBAR",
        [0x0C] = "PUSHBUTTON", [0x2C] = "TABLE", [0x27] = "TEXT", [0x20] = "TITLEBAR",
        [0x2C1] = "TOOLBAR", [0x27FE] = "WINDOW", [0x2B00] = "CELL",
    };

    private static object? RoleToString(object? roleVal)
    {
        if (roleVal is int i) return Roles.TryGetValue(i, out var name) ? name : $"ROLE_{i}";
        return roleVal;
    }

    // Subset of the standard MSAA STATE_SYSTEM_* bit flags (oleacc.h).
    private static readonly (int Flag, string Name)[] StateFlags =
    {
        (0x1, "UNAVAILABLE"), (0x2, "SELECTED"), (0x4, "FOCUSED"), (0x8, "PRESSED"),
        (0x10, "CHECKED"), (0x20, "MIXED"), (0x100, "READONLY"), (0x200, "HOTTRACKED"),
        (0x400, "DEFAULT"), (0x800, "EXPANDED"), (0x1000, "COLLAPSED"), (0x2000, "BUSY"),
        (0x4000, "FLOATING"), (0x8000, "MARQUEED"), (0x10000, "ANIMATED"),
        (0x20000, "INVISIBLE"), (0x40000, "OFFSCREEN"), (0x80000, "SIZEABLE"),
        (0x100000, "MOVEABLE"), (0x200000, "SELFVOICING"), (0x400000, "FOCUSABLE"),
        (0x800000, "SELECTABLE"), (0x1000000, "LINKED"), (0x4000000, "TRAVERSED"),
        (0x8000000, "MULTISELECTABLE"), (0x10000000, "EXTSELECTABLE"),
        (0x40000000, "PROTECTED"),
    };

    private static object? StateToString(object? stateVal)
    {
        if (stateVal is not int mask) return stateVal;
        if (mask == 0) return "NORMAL";

        var names = StateFlags.Where(f => (mask & f.Flag) != 0).Select(f => f.Name).ToList();
        return names.Count > 0 ? string.Join(",", names) : $"STATE_{mask}";
    }
}
