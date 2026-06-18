using System.Diagnostics;
using System.Runtime.InteropServices;

namespace NovaUIAutomationServer.Java;

/// <summary>
/// Injects appium-desktop-agent.jar into a running JVM using the Java Attach API.
/// Supports Java 8 JDK (tools.jar) and Java 9+ (jdk.attach module).
/// </summary>
internal static class AgentInjector
{
    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static void InjectFromHwnd(IntPtr hwnd, string agentJar)
    {
        GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0)
            throw new InvalidOperationException($"Could not resolve PID from window handle 0x{hwnd:X}.");
        InjectFromPid((int)pid, agentJar);
    }

    public static void InjectFromPid(int pid, string agentJar)
    {
        string javaExe = FindJavaExe();
        bool isJava8 = DetectJava8(javaExe);
        string classpath = BuildClasspath(agentJar, isJava8);
        string extraModules = isJava8 ? "" : "--add-modules jdk.attach ";

        var startInfo = new ProcessStartInfo
        {
            FileName = javaExe,
            Arguments = $"{extraModules}-cp \"{classpath}\" io.verisoft.appium.AgentLoader {pid} \"{agentJar}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        // Strip JVM env vars so third-party agents (e.g. UFT jvmhook) are not
        // injected into the AgentLoader process. These vars are intended for the
        // app under test, not for our tooling JVM.
        foreach (var key in new[] { "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS" })
            startInfo.EnvironmentVariables.Remove(key);

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Failed to start AgentLoader process.");

        // Read both streams to avoid deadlock
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit(30_000);

        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"AgentLoader failed (exit {process.ExitCode}): {stderr.Trim()}");
    }

    private static string FindJavaExe()
    {
        var javaHome = Environment.GetEnvironmentVariable("JAVA_HOME");
        if (!string.IsNullOrEmpty(javaHome))
        {
            var candidate = Path.Combine(javaHome, "bin", "java.exe");
            if (File.Exists(candidate)) return candidate;
        }

        // Try PATH via `where java`
        try
        {
            var si = new ProcessStartInfo("where", "java")
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            };
            using var p = Process.Start(si);
            var line = p?.StandardOutput.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(line) && File.Exists(line)) return line;
        }
        catch { /* ignore */ }

        throw new InvalidOperationException(
            "Java executable not found. Set JAVA_HOME to a JDK installation to enable Java Swing agent injection.");
    }

    private static bool DetectJava8(string javaExe)
    {
        try
        {
            var si = new ProcessStartInfo(javaExe, "-version")
            {
                UseShellExecute = false,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            // Strip JVM env vars so third-party agents (e.g. UFT jvmhook) don't
            // corrupt the version output or prevent the JVM from starting.
            foreach (var key in new[] { "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS" })
                si.EnvironmentVariables.Remove(key);
            using var p = Process.Start(si);
            // `java -version` writes to stderr
            var line = p?.StandardError.ReadLine() ?? "";
            return line.Contains("1.8.") || line.Contains("\"1.7.");
        }
        catch { return false; }
    }

    private static string BuildClasspath(string agentJar, bool isJava8)
    {
        if (!isJava8) return agentJar;

        // Java 8: tools.jar must be on classpath for com.sun.tools.attach.
        // Search in order: JAVA_HOME, common JDK install roots alongside JAVA_HOME,
        // then well-known vendor directories — so testers don't need to change JAVA_HOME
        // just because it points to a JRE co-installed with a JDK.
        var toolsJar = FindToolsJar();
        if (toolsJar != null)
            return $"{toolsJar};{agentJar}";

        throw new InvalidOperationException(
            "Java 8 detected but tools.jar not found. " +
            "A JDK installation is required (not just a JRE). " +
            "Install a JDK 8 (e.g. Amazon Corretto 8) or set JAVA_HOME to an existing JDK.");
    }

    private static string? FindToolsJar()
    {
        // 1. JAVA_HOME/lib/tools.jar (JDK 8 pointed to directly)
        var javaHome = Environment.GetEnvironmentVariable("JAVA_HOME");
        if (!string.IsNullOrEmpty(javaHome))
        {
            var candidate = Path.Combine(javaHome, "lib", "tools.jar");
            if (File.Exists(candidate)) return candidate;
        }

        // 2. Scan common JDK install roots — handles JAVA_HOME → JRE with JDK alongside
        var searchRoots = new[]
        {
            @"C:\Program Files\Java",
            @"C:\Program Files\Amazon Corretto",
            @"C:\Program Files\Eclipse Adoptium",
            @"C:\Program Files\Microsoft",
            @"C:\Program Files\Zulu",
        };

        // Also include the parent directory of JAVA_HOME (covers C:\Program Files\Java\jreX → jdkX sibling)
        if (!string.IsNullOrEmpty(javaHome))
        {
            var parent = Path.GetDirectoryName(javaHome);
            if (!string.IsNullOrEmpty(parent))
                searchRoots = searchRoots.Prepend(parent).ToArray();
        }

        foreach (var root in searchRoots)
        {
            if (!Directory.Exists(root)) continue;
            foreach (var dir in Directory.GetDirectories(root, "jdk*"))
            {
                var candidate = Path.Combine(dir, "lib", "tools.jar");
                if (File.Exists(candidate)) return candidate;
            }
        }

        return null;
    }
}
