using System.Runtime.InteropServices;
using System.Text;

namespace NovaUIAutomationServer.Jab;

/// <summary>
/// P/Invoke bindings for WindowsAccessBridge-64.dll.
/// Structs and signatures match the Java Access Bridge 2.0 API (64-bit).
/// DLL is installed to System32 when 'jabswitch -enable' is run with a 64-bit JRE.
/// </summary>
internal static class JabNative
{
    private const string Dll = "WindowsAccessBridge-64.dll";

    // String buffer sizes from the JAB API header
    private const int MaxStringSize = 1024;
    private const int ShortStringSize = 256;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal class AccessibleContextInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = MaxStringSize)]  public string name = "";
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = MaxStringSize)]  public string description = "";
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = ShortStringSize)] public string role = "";
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = ShortStringSize)] public string role_en_US = "";
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = ShortStringSize)] public string states = "";
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = ShortStringSize)] public string states_en_US = "";
        public int indexInParent;
        public int childrenCount;
        public int x;
        public int y;
        public int width;
        public int height;
        public int accessibleComponent;
        public int accessibleAction;
        public int accessibleSelection;
        public int accessibleText;
        public int accessibleInterfaces;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct AccessibleActionInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = ShortStringSize)]
        public string name;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal class AccessibleActions
    {
        public int actionsCount;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
        public AccessibleActionInfo[] actionInfo = new AccessibleActionInfo[256];
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct AccessibleActionsToDo
    {
        public int actionsCount;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public AccessibleActionInfo[] actions;
    }

    [DllImport(Dll, EntryPoint = "Windows_run", CallingConvention = CallingConvention.Cdecl)]
    internal static extern void Windows_run();

    [DllImport(Dll, EntryPoint = "isJavaWindow", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool IsJavaWindow(IntPtr hwnd);

    [DllImport(Dll, EntryPoint = "getAccessibleContextFromHWND", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetAccessibleContextFromHWND(IntPtr hwnd, out int vmid, out long ac);

    [DllImport(Dll, EntryPoint = "getAccessibleContextInfo", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetAccessibleContextInfo(int vmid, long ac, [Out] AccessibleContextInfo info);

    [DllImport(Dll, EntryPoint = "getAccessibleChildFromContext", CallingConvention = CallingConvention.Cdecl)]
    internal static extern long GetAccessibleChildFromContext(int vmid, long ac, int i);

    [DllImport(Dll, EntryPoint = "getAccessibleParentFromContext", CallingConvention = CallingConvention.Cdecl)]
    internal static extern long GetAccessibleParentFromContext(int vmid, long ac);

    [DllImport(Dll, EntryPoint = "getAccessibleActions", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetAccessibleActions(int vmid, long ac, [Out] AccessibleActions actions);

    [DllImport(Dll, EntryPoint = "doAccessibleActions", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DoAccessibleActions(int vmid, long ac, ref AccessibleActionsToDo actionsToDo, out int failure);

    [DllImport(Dll, EntryPoint = "setTextContents", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetTextContents(int vmid, long ac, [MarshalAs(UnmanagedType.LPWStr)] string text);

    [DllImport(Dll, EntryPoint = "getVirtualAccessibleName", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetVirtualAccessibleName(int vmid, long ac, StringBuilder name, int len);

    [DllImport(Dll, EntryPoint = "releaseJavaObject", CallingConvention = CallingConvention.Cdecl)]
    internal static extern void ReleaseJavaObject(int vmid, long javaObject);
}
