using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace DesktopDriverServer.DotNet;

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

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsWow64Process(IntPtr hProcess, out bool wow64Process);

    /// <summary>
    /// True if the target process is a 32-bit process running under WOW64. This host only ever
    /// ships as a 64-bit process, so a WOW64 hit unambiguously means the target is 32-bit —
    /// there's no "both sides 32-bit" case to disambiguate here. Distinct from DetectClrFramework
    /// (which only checks clr.dll/coreclr.dll presence by name): a 32-bit .NET Framework process
    /// loads its own WOW64 clr.dll too, so that check alone can't tell 32-bit from 64-bit apart.
    /// </summary>
    internal static bool DetectIs32Bit(int pid)
    {
        using var process = Process.GetProcessById(pid);
        if (!IsWow64Process(process.Handle, out bool isWow64))
            throw new InvalidOperationException($"IsWow64Process failed for PID {pid} (error {Marshal.GetLastWin32Error()}).");
        return isWow64;
    }

    public static void InjectFromHwnd(IntPtr hwnd, string bridgeDll)
    {
        GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0)
            throw new InvalidOperationException($"Could not resolve PID from window handle 0x{hwnd:X}.");
        InjectFromPid((int)pid, bridgeDll);
    }

    /// <summary>
    /// Bitness-aware entry point for the command layer: injects directly (today's path) for a
    /// 64-bit target, or spawns the 32-bit injector stub for a 32-bit one — CreateRemoteThread
    /// cannot cross bitness, so this 64-bit host can never inject into a 32-bit target itself.
    /// Everything after injection (the bridge's own TCP RPC) is unaffected by which path ran.
    /// </summary>
    public static void InjectFromPidAutoBitness(int pid, string x64DllPath, string x86DllPath, string x86StubPath)
    {
        // CoreCLR attach goes over the Diagnostics IPC named pipe, not CreateRemoteThread, so it
        // skips the 32-bit-stub dance entirely. The profiler DLL itself is still architecture-
        // specific, though — a 32-bit target needs the x86 build, not the x64 one.
        if (DetectClrFramework(pid) == ClrFramework.CoreClr)
        {
            bool coreClrTargetIs32Bit;
            try
            {
                coreClrTargetIs32Bit = DetectIs32Bit(pid);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Could not determine target process bitness for PID {pid}: {ex.Message}", ex);
            }

            string profilerDllPath = DefaultCoreClrProfilerDllPath(coreClrTargetIs32Bit ? x86DllPath : x64DllPath);
            if (coreClrTargetIs32Bit && !File.Exists(profilerDllPath))
                throw new InvalidOperationException(
                    $"Target process (PID {pid}) is a 32-bit CoreCLR process, but the 32-bit CoreCLR " +
                    $"profiler is not installed (expected '{profilerDllPath}'). Run " +
                    "`npm run build:dotnet-bridge-profiler` to build it (builds both x64 and Win32).");
            CoreClrAttacher.Attach(pid, profilerDllPath);
            return;
        }

        bool is32Bit;
        try
        {
            is32Bit = DetectIs32Bit(pid);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Could not determine target process bitness for PID {pid}: {ex.Message}", ex);
        }

        if (!is32Bit)
        {
            InjectFromPid(pid, x64DllPath);
            return;
        }

        if (!File.Exists(x86DllPath) || !File.Exists(x86StubPath))
            throw new InvalidOperationException(
                $"Target process (PID {pid}) is 32-bit, but 32-bit bridge support is not installed " +
                $"(expected '{x86DllPath}' and '{x86StubPath}'). Run `npm run build:dotnet-bridge && " +
                "npm run build:dotnet-bridge-x86-stub` to build them.");

        var psi = new ProcessStartInfo
        {
            FileName = x86StubPath,
            ArgumentList = { pid.ToString(), x86DllPath },
            UseShellExecute = false,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        using var stub = Process.Start(psi)
            ?? throw new InvalidOperationException($"Failed to start 32-bit injector stub: {x86StubPath}");

        string stderrOutput = stub.StandardError.ReadToEnd();
        bool exited = stub.WaitForExit(15_000);

        if (!exited)
        {
            try { stub.Kill(); } catch { /* best-effort */ }
            throw new TimeoutException($"32-bit injector stub did not complete within 15s (PID {pid}).");
        }

        if (stub.ExitCode != 0)
            throw new InvalidOperationException(
                $"32-bit bridge injection failed (stub exit code {stub.ExitCode})." +
                (string.IsNullOrWhiteSpace(stderrOutput) ? "" : $" {stderrOutput.Trim()}"));
    }

    // Native profiler DLL for CoreCLR targets — sibling of the Framework path's bridgeDll, built
    // by dotnet-bridge-profiler/. See dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
    private static string DefaultCoreClrProfilerDllPath(string bridgeDll) =>
        Path.Combine(Path.GetDirectoryName(bridgeDll) ?? ".", "appium-dotnet-profiler.dll");

    public static void InjectFromPid(int pid, string bridgeDll)
    {
        var framework = DetectClrFramework(pid);
        if (framework == ClrFramework.CoreClr)
        {
            CoreClrAttacher.Attach(pid, DefaultCoreClrProfilerDllPath(bridgeDll));
            return;
        }
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

            // MSVC decorates __stdcall (WINAPI) C exports on x86 as "_Name@N" (N = total
            // parameter byte size) in the export table — x64 has no name decoration at all, so
            // this only matters for the Win32 build of appium-dotnet-bridge.dll. BridgeStart's
            // signature is DWORD WINAPI BridgeStart(LPVOID) — one pointer-sized (4-byte) param on
            // x86 — so "_BridgeStart@4" is the real x86 export name. Falling back here keeps this
            // code bitness-agnostic instead of needing a platform-conditional build step.
            if (export == IntPtr.Zero)
                export = GetProcAddress(hLocal, $"_{exportName}@4");

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
