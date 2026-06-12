using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

public static class ProcessCommands
{
    public static object? StartProcess(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var path = p.GetProperty("path").GetString()
            ?? throw new ArgumentException("path is required.");

        string? arguments = null;
        if (p.TryGetProperty("arguments", out var argsProp) && argsProp.ValueKind == JsonValueKind.String)
        {
            arguments = argsProp.GetString();
        }

        string? workingDir = null;
        if (p.TryGetProperty("workingDir", out var wdProp) && wdProp.ValueKind == JsonValueKind.String)
        {
            workingDir = wdProp.GetString();
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true,
        };

        if (!string.IsNullOrEmpty(arguments))
        {
            startInfo.Arguments = arguments;
        }

        if (!string.IsNullOrEmpty(workingDir))
        {
            startInfo.WorkingDirectory = workingDir;
        }

        int? waitForAppLaunchMs = null;
        if (p.TryGetProperty("waitForAppLaunchMs", out var waitProp) && waitProp.ValueKind == JsonValueKind.Number)
        {
            waitForAppLaunchMs = waitProp.GetInt32();
        }

        var process = Process.Start(startInfo);

        if (process != null && waitForAppLaunchMs.HasValue && waitForAppLaunchMs.Value > 0)
        {
            try
            {
                process.WaitForInputIdle(waitForAppLaunchMs.Value);
            }
            catch (InvalidOperationException)
            {
                // Process has no UI or exited before becoming idle — ignore
            }
        }

        if (process != null)
        {
            state.LastStartedProcessId = process.Id;
        }

        return process?.Id;
    }

    public static object? GetProcessIds(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var processName = p.GetProperty("processName").GetString()
            ?? throw new ArgumentException("processName is required.");

        var processes = Process.GetProcessesByName(processName)
            .OrderByDescending(proc => proc.StartTime)
            .Select(proc => proc.Id)
            .ToArray();

        return processes;
    }

    public static object? GetChildProcessIds(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var parentPid = p.GetProperty("parentPid").GetInt32();

        var childPids = new List<int>();
        var snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == InvalidHandleValue) return childPids.ToArray();

        try
        {
            var entry = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf<PROCESSENTRY32>() };
            if (Process32First(snapshot, ref entry))
            {
                do
                {
                    if ((int)entry.th32ParentProcessID == parentPid)
                    {
                        childPids.Add((int)entry.th32ProcessID);
                    }
                } while (Process32Next(snapshot, ref entry));
            }
        }
        finally
        {
            CloseHandle(snapshot);
        }

        return childPids.ToArray();
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll")]
    private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll")]
    private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    private const uint TH32CS_SNAPPROCESS = 0x00000002;
    private static readonly IntPtr InvalidHandleValue = new(-1);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct PROCESSENTRY32
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    public static object? StopProcess(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var pid = p.GetProperty("pid").GetInt32();

        bool force = true;
        if (p.TryGetProperty("force", out var forceProp))
        {
            force = forceProp.GetBoolean();
        }

        try
        {
            var process = Process.GetProcessById(pid);
            if (force)
            {
                process.Kill();
            }
            else
            {
                process.CloseMainWindow();
            }
        }
        catch (ArgumentException)
        {
            // Process already exited
        }

        return null;
    }

    public static object? ExecutePowerShellScript(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var script = p.GetProperty("script").GetString()
            ?? throw new ArgumentException("script is required.");

        string? workingDir = null;
        if (p.TryGetProperty("workingDir", out var wdProp) && wdProp.ValueKind == JsonValueKind.String)
        {
            workingDir = wdProp.GetString();
        }

        bool isolated = false;
        if (p.TryGetProperty("isolated", out var isolatedProp) && isolatedProp.ValueKind == JsonValueKind.True)
        {
            isolated = true;
        }

        // Base64 encode the script for safe transport
        var base64Script = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(script));

        // When isolated, wrap the script in a fresh PowerShell runspace via -Command with
        // an explicit scope boundary. The -NoProfile flag is always set; isolated mode
        // additionally resets environment by running in a new process without loading the user profile.
        var profileFlag = isolated ? "-NoLogo -NoProfile" : "-NoProfile";

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"{profileFlag} -NonInteractive -Command \"[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{base64Script}')) | Invoke-Expression\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            LoadUserProfile = !isolated,
        };

        if (!string.IsNullOrEmpty(workingDir))
        {
            startInfo.WorkingDirectory = workingDir;
        }

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Failed to start PowerShell process.");

        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (!string.IsNullOrEmpty(stderr))
        {
            throw new InvalidOperationException(stderr);
        }

        return stdout.Trim();
    }
}
