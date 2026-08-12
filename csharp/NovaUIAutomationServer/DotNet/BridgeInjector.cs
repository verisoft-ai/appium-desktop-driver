using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace NovaUIAutomationServer.DotNet;

/// <summary>
/// Injects appium-dotnet-bridge.dll into a running .NET Framework process via classic Win32
/// injection (LoadLibrary + CreateRemoteThread), then starts the bridge's TCP listener via a
/// second CreateRemoteThread call into the DLL's exported BridgeStart entry point.
///
/// Unlike the Java Swing bridge, .NET has no cooperative attach API (nothing like
/// com.sun.tools.attach) — this is real injection, not a JVM-sanctioned mechanism.
/// </summary>
internal static class BridgeInjector
{
    private const uint PROCESS_ALL_ACCESS = 0x001F0FFF;
    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RESERVE = 0x2000;
    private const uint MEM_RELEASE = 0x8000;
    private const uint PAGE_READWRITE = 0x04;
    private const uint INFINITE = 0xFFFFFFFF;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out UIntPtr lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize,
        IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, out uint lpThreadId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeThread(IntPtr hThread, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string procName);

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static void InjectFromHwnd(IntPtr hwnd, string bridgeDll)
    {
        GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0)
            throw new InvalidOperationException($"Could not resolve PID from window handle 0x{hwnd:X}.");
        InjectFromPid((int)pid, bridgeDll);
    }

    public static void InjectFromPid(int pid, string bridgeDll)
    {
        var framework = DetectClrFramework(pid);
        if (framework == ClrFramework.CoreClr)
            throw new InvalidOperationException(
                "Target process is hosting CoreCLR (.NET 5+ / .NET Core). The .NET bridge only supports " +
                ".NET Framework processes (clr.dll) in this version.");
        if (framework == ClrFramework.None)
            throw new InvalidOperationException(
                "Target process has no CLR loaded (neither clr.dll nor coreclr.dll found among its modules). " +
                "Is this actually a .NET process?");

        IntPtr hProcess = OpenProcess(PROCESS_ALL_ACCESS, false, (uint)pid);
        if (hProcess == IntPtr.Zero)
            throw new InvalidOperationException($"OpenProcess failed for PID {pid} (error {Marshal.GetLastWin32Error()}). Try running as Administrator.");

        try
        {
            LoadLibraryRemote(hProcess, bridgeDll);
            IntPtr remoteModule = GetRemoteModuleBase(pid, bridgeDll);
            IntPtr bridgeStartRva = GetLocalExportRva(bridgeDll, "BridgeStart");
            IntPtr remoteBridgeStart = IntPtr.Add(remoteModule, (int)bridgeStartRva);

            // BridgeStart never returns on success — it blocks forever in the TCP accept loop —
            // so unlike LoadLibraryW, "the thread is still running" IS the success signal here,
            // not a timeout to fail on. Only a grace-period *completion* (it returned before the
            // window elapsed) means it threw and hit the catch block before starting the listener.
            // There's no return channel across CreateRemoteThread for the exception itself, so
            // BridgeStart persists it to a sibling .error file (see BridgeAgent.cpp) for us to
            // surface here instead of a bare exit code.
            IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, remoteBridgeStart, IntPtr.Zero, 0, out _);
            if (hThread == IntPtr.Zero)
                throw new InvalidOperationException($"CreateRemoteThread failed for BridgeStart (error {Marshal.GetLastWin32Error()}).");

            try
            {
                uint waitResult = WaitForSingleObject(hThread, 3_000);
                if (waitResult == 0 /* WAIT_OBJECT_0 — exited within the grace period: a real failure */)
                {
                    GetExitCodeThread(hThread, out uint exitCode);
                    string errorFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.error");
                    string detail = File.Exists(errorFile) ? $" Target-process exception:\n{File.ReadAllText(errorFile)}" : string.Empty;
                    throw new InvalidOperationException(
                        $"BridgeStart returned unexpectedly (exit code {exitCode}) instead of blocking forever in its accept loop — " +
                        $"it must have thrown before starting the TCP listener.{detail}");
                }
                // Still running after the grace period — this is the expected outcome.
            }
            finally
            {
                CloseHandle(hThread);
            }
        }
        finally
        {
            CloseHandle(hProcess);
        }
    }

    private static void LoadLibraryRemote(IntPtr hProcess, string dllPath)
    {
        IntPtr kernel32 = GetModuleHandle("kernel32.dll");
        IntPtr loadLibraryW = GetProcAddress(kernel32, "LoadLibraryW");
        if (loadLibraryW == IntPtr.Zero)
            throw new InvalidOperationException("Could not resolve LoadLibraryW in kernel32.dll.");

        byte[] pathBytes = Encoding.Unicode.GetBytes(dllPath + "\0");
        IntPtr remotePathAddr = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)pathBytes.Length, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (remotePathAddr == IntPtr.Zero)
            throw new InvalidOperationException($"VirtualAllocEx failed (error {Marshal.GetLastWin32Error()}).");

        try
        {
            if (!WriteProcessMemory(hProcess, remotePathAddr, pathBytes, (uint)pathBytes.Length, out _))
                throw new InvalidOperationException($"WriteProcessMemory failed (error {Marshal.GetLastWin32Error()}).");

            // CreateRemoteThread's start routine returns a DWORD (32 bits) and GetExitCodeThread
            // can't return more than that — LoadLibraryW's real HMODULE is a 64-bit pointer on
            // x64 (routinely ASLR'd above 4GB), so the exit code is only useful as a
            // success/failure signal (zero vs. nonzero) here, never as the actual module base.
            // The real base is recovered separately via GetRemoteModuleBase.
            uint exitCode = RunRemoteThread(hProcess, loadLibraryW, remotePathAddr, 10_000, "LoadLibraryW");
            if (exitCode == 0)
                throw new InvalidOperationException(
                    $"LoadLibraryW returned NULL in the target process — the DLL failed to load. " +
                    $"Check bitness match (x64 target needs an x64 build of {Path.GetFileName(dllPath)}) and that all its dependencies are resolvable.");
        }
        finally
        {
            VirtualFreeEx(hProcess, remotePathAddr, 0, MEM_RELEASE);
        }
    }

    /// <summary>
    /// Finds the real (full 64-bit) base address of a just-loaded module in another process by
    /// re-enumerating that process's module list via the managed Process.Modules API (which
    /// already returns correct full-width base addresses — see DetectClrFramework's CLR module
    /// scan), rather than trusting LoadLibraryW's remote thread exit code (which truncates to 32
    /// bits — see the comment in LoadLibraryRemote).
    /// </summary>
    private static IntPtr GetRemoteModuleBase(int pid, string dllPath)
    {
        using var process = Process.GetProcessById(pid);
        foreach (ProcessModule m in process.Modules)
        {
            if (string.Equals(m.FileName, dllPath, StringComparison.OrdinalIgnoreCase))
                return m.BaseAddress;
        }
        throw new InvalidOperationException($"{dllPath} was not found in PID {pid}'s module list after LoadLibraryW reported success.");
    }

    /// <summary>
    /// Computes an export's RVA by loading the same DLL locally with DONT_RESOLVE_DLL_REFERENCES
    /// (maps it at proper virtual/image layout — sections placed by their virtual addresses, not
    /// raw file offsets — without running DllMain or resolving imports) and diffing GetProcAddress
    /// against the local module base. LOAD_LIBRARY_AS_DATAFILE was tried first but maps the file
    /// using raw file-offset layout; since section alignment (4096) differs from file alignment
    /// (512) for this DLL, RVA arithmetic against a datafile-mapped module is wrong and
    /// GetProcAddress silently fails to resolve real code exports.
    /// </summary>
    private static IntPtr GetLocalExportRva(string dllPath, string exportName)
    {
        const uint DONT_RESOLVE_DLL_REFERENCES = 0x00000001;
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr LoadLibraryEx(string lpFileName, IntPtr hFile, uint dwFlags);

        IntPtr hLocal = LoadLibraryEx(dllPath, IntPtr.Zero, DONT_RESOLVE_DLL_REFERENCES);
        if (hLocal == IntPtr.Zero)
            throw new InvalidOperationException($"Could not load {dllPath} locally to resolve exports (error {Marshal.GetLastWin32Error()}).");

        try
        {
            IntPtr export = GetProcAddress(hLocal, exportName);
            if (export == IntPtr.Zero)
                throw new InvalidOperationException($"Export '{exportName}' not found in {dllPath}. Is it declared with __declspec(dllexport) extern \"C\"?");
            long rva = export.ToInt64() - hLocal.ToInt64();
            return new IntPtr(rva);
        }
        finally
        {
            FreeLibrary(hLocal);
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeLibrary(IntPtr hModule);

    private static uint RunRemoteThread(IntPtr hProcess, IntPtr startAddress, IntPtr parameter, uint timeoutMs, string label)
    {
        IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, startAddress, parameter, 0, out _);
        if (hThread == IntPtr.Zero)
            throw new InvalidOperationException($"CreateRemoteThread failed for {label} (error {Marshal.GetLastWin32Error()}).");

        try
        {
            uint waitResult = WaitForSingleObject(hThread, timeoutMs);
            if (waitResult != 0 /* WAIT_OBJECT_0 */)
                throw new TimeoutException($"Remote thread for {label} did not complete within {timeoutMs}ms.");

            GetExitCodeThread(hThread, out uint exitCode);
            return exitCode;
        }
        finally
        {
            CloseHandle(hThread);
        }
    }

    internal enum ClrFramework { None, DotNetFramework, CoreClr }

    internal static ClrFramework DetectClrFramework(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            bool hasClr = false, hasCoreClr = false;
            foreach (ProcessModule m in process.Modules)
            {
                if (m.ModuleName.Equals("clr.dll", StringComparison.OrdinalIgnoreCase)) hasClr = true;
                if (m.ModuleName.Equals("coreclr.dll", StringComparison.OrdinalIgnoreCase)) hasCoreClr = true;
            }
            if (hasCoreClr) return ClrFramework.CoreClr;
            if (hasClr) return ClrFramework.DotNetFramework;
            return ClrFramework.None;
        }
        catch
        {
            return ClrFramework.None;
        }
    }
}
