using System.Net;
using System.Net.Sockets;
using System.Text;

namespace DesktopDriverServer.DotNet;

/// <summary>
/// Entry point BridgeInjector.InjectFromPid calls for a CoreCLR target instead of the Win32
/// LoadLibraryW/CreateRemoteThread path, which only works for .NET Framework (clr.dll) — see
/// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
/// </summary>
internal static class CoreClrAttacher
{
    // Must match the CLSID dotnet-bridge-profiler.dll's DllGetClassObject answers for. Generated
    // once; never regenerate without updating both sides together.
    public static readonly Guid ProfilerClsid = new("6f1a2e8c-6f9b-4b7d-9a3e-2c4b8e7f1a90");

    public static void Attach(int pid, string profilerDllPath)
    {
        // CoreCLR only allows one profiler per process for its entire lifetime — there is no
        // detach path available to this profiler (it modifies metadata via IMetaDataEmit2 in
        // GetReJITParameters, which CoreCLR's own detach rules permanently disqualify from
        // detaching). A second attach attempt against a target this driver already attached to
        // earlier in the same run (e.g. a prior WebDriver session against the same long-lived
        // app) would otherwise fail with CORPROF_E_PROFILER_ALREADY_ACTIVE. The bridge's TCP
        // listener from that first attach is still alive for the process' whole lifetime, though
        // — reuse it instead of re-attaching.
        if (IsBridgeAlreadyListening(pid)) return;

        if (!File.Exists(profilerDllPath))
            throw new InvalidOperationException(
                $"CoreCLR bridge profiler not found at '{profilerDllPath}'. Run " +
                "`npm run build:dotnet-bridge-profiler` to build it.");

        // Reuse profilerDllPath's directory (already bitness-correct) for bridge-core.dll instead
        // of AppContext.BaseDirectory, which is always x64 (this host only ships as x64) — the x64
        // and x86 builds of bridge-core.dll are not interchangeable, and loading the wrong one into
        // a 32-bit target throws FileLoadException.
        string profilerDir = Path.GetDirectoryName(profilerDllPath) ?? AppContext.BaseDirectory;
        string bridgeCoreDllPath = EnsureBridgeCoreCached(profilerDir);

        // The ReJIT bootstrap IL calls Assembly.LoadFrom(bridgeCoreDllPath) explicitly rather than
        // binding through a plain AssemblyRef — CoreCLR's default AssemblyLoadContext won't resolve
        // a same-directory DLL absent from the target's own deps.json. LoadFrom needs the absolute
        // path at IL-rewrite time, so it travels as attach client data.
        byte[] clientData = Encoding.Unicode.GetBytes(bridgeCoreDllPath + "\0");
        CoreClrDiagnosticsIpcClient.AttachProfiler(pid, ProfilerClsid, profilerDllPath, clientData);

        // Fire-and-forget: the profiler's ReJIT bootstrap runs asynchronously inside the target on
        // its next call into the anchor method, and the managed agent writes its own port file once
        // listening. Poll for it rather than assuming success the instant AttachProfiler returns.
        WaitForPortFile(pid, TimeSpan.FromSeconds(15));
    }

    // Caches appium-dotnet-bridge-core.dll in a driver-owned per-user %TEMP% directory rather than
    // next to the target's own exe, which needs write access to the target's install dir (fails
    // under locked-down installs). Assembly.LoadFrom only needs the target to have read access.
    // Cached (length + last-write time compared) rather than copied every attach, so a no-op attach
    // is cheap and an upgraded driver build still gets picked up.
    private static string EnsureBridgeCoreCached(string sourceDir)
    {
        string sourceDll = Path.Combine(sourceDir, "appium-dotnet-bridge-core.dll");
        if (!File.Exists(sourceDll))
            throw new InvalidOperationException(
                $"CoreCLR bridge managed agent not found at '{sourceDll}'. Run `npm run build:dotnet-bridge-core` to build it.");

        // Bitness tag mirrors the source layout (native/win-x64/ or native/win-x86/) so the two
        // builds never collide in the cache.
        string bitnessTag = Path.GetFileName(sourceDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        string cacheDir = Path.Combine(Path.GetTempPath(), "appium-dotnet-bridge-core-cache", bitnessTag);
        Directory.CreateDirectory(cacheDir);
        string cachedDll = Path.Combine(cacheDir, "appium-dotnet-bridge-core.dll");

        var sourceInfo = new FileInfo(sourceDll);
        var cachedInfo = new FileInfo(cachedDll);
        bool upToDate = cachedInfo.Exists
            && cachedInfo.Length == sourceInfo.Length
            && cachedInfo.LastWriteTimeUtc == sourceInfo.LastWriteTimeUtc;

        if (!upToDate)
        {
            try
            {
                File.Copy(sourceDll, cachedDll, overwrite: true);
            }
            catch (IOException) when (File.Exists(cachedDll))
            {
                // Another concurrent attach on this machine is mid-copy of the identical bytes —
                // fall through and use whatever's already there rather than failing over a benign
                // sharing violation.
            }
        }

        return cachedDll;
    }

    // Port file surviving from an earlier attach only proves a listener existed at some point —
    // confirm it's still actually accepting connections before trusting it (the target could have
    // crashed or the listener thread could have died without cleaning up the file).
    private static bool IsBridgeAlreadyListening(int pid)
    {
        string portFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.port");
        if (!File.Exists(portFile)) return false;
        if (!int.TryParse(File.ReadAllText(portFile).Trim(), out int port)) return false;

        try
        {
            using var probe = new TcpClient();
            if (!probe.ConnectAsync(IPAddress.Loopback, port).Wait(500)) return false;
            return probe.Connected;
        }
        catch
        {
            return false;
        }
    }

    private static void WaitForPortFile(int pid, TimeSpan timeout)
    {
        string portFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.port");
        string errorFile = Path.Combine(Path.GetTempPath(), $"appium-dotnet-bridge-{pid}.error");
        var deadline = DateTime.UtcNow + timeout;

        while (DateTime.UtcNow < deadline)
        {
            if (File.Exists(errorFile))
                throw new InvalidOperationException(
                    $"CoreCLR bridge agent failed to start in PID {pid}. Target-process exception:\n{File.ReadAllText(errorFile)}");
            if (File.Exists(portFile))
                return;
            Thread.Sleep(200);
        }

        throw new TimeoutException(
            $"CoreCLR bridge agent in PID {pid} did not start listening within {timeout.TotalSeconds:0}s after profiler attach.");
    }
}
