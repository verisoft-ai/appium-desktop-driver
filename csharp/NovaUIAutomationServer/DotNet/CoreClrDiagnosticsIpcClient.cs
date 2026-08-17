using System.IO.Pipes;
using System.Text;

namespace NovaUIAutomationServer.DotNet;

/// <summary>
/// Hand-rolled client for CoreCLR's Diagnostics IPC protocol (no Microsoft.Diagnostics.NETCore
/// .Client NuGet dependency — matches this repo's no-third-party-dependency discipline for
/// interop, e.g. the hand-written [ComImport] UIA3 bindings in Uia3/UIA.cs). Every CoreCLR
/// process opens a named pipe at \\.\pipe\dotnet-diagnostic-{pid} on startup for this purpose —
/// no opt-in needed on the target. This sends a single ProfilerAttach command, which triggers
/// CoreCLR to LoadLibraryW our profiler DLL and call ICorProfilerCallback3::InitializeForAttach.
///
/// Protocol reference: https://github.com/dotnet/diagnostics/blob/main/documentation/design-docs/ipc-protocol.md
/// </summary>
internal static class CoreClrDiagnosticsIpcClient
{
    // "DOTNET_IPC_V1" + trailing NUL, exactly 14 bytes — fixed magic prefix of every IPC message.
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("DOTNET_IPC_V1\0");

    private const byte CommandSetProfiler = 0x03;
    private const byte CommandIdAttachProfiler = 0x01;

    /// <summary>
    /// Attaches <paramref name="profilerDllPath"/> (identified by <paramref name="profilerClsid"/>)
    /// into the target process. Throws on any protocol or transport failure.
    ///
    /// <paramref name="clientData"/> is delivered verbatim to the profiler's
    /// InitializeForAttach(pvClientData, cbClientData) — CoreClrAttacher uses it to pass the
    /// absolute path of appium-dotnet-bridge-core.dll for the profiler's Assembly.LoadFrom call.
    /// </summary>
    public static void AttachProfiler(int pid, Guid profilerClsid, string profilerDllPath, byte[]? clientData = null, uint attachTimeoutMs = 10_000)
    {
        string pipeName = $"dotnet-diagnostic-{pid}";

        using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.None);
        try
        {
            pipe.Connect((int)attachTimeoutMs);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"Could not connect to CoreCLR diagnostics pipe for PID {pid} ({pipeName}). " +
                "Is the target actually a .NET 5+ process, and is it still running?", ex);
        }

        byte[] payload = BuildAttachProfilerPayload(attachTimeoutMs, profilerClsid, profilerDllPath, clientData);
        byte[] message = BuildMessage(CommandSetProfiler, CommandIdAttachProfiler, payload);

        pipe.Write(message, 0, message.Length);
        pipe.Flush();

        int hresult = ReadAttachProfilerResponse(pipe);
        if (hresult != 0 /* S_OK */)
            throw new InvalidOperationException(
                $"ProfilerAttach IPC command failed for PID {pid} (HRESULT 0x{hresult:X8}). " +
                "Common causes: another profiler already attached, or the target has profiling " +
                "disabled via DOTNET_EnableDiagnostics=0.");
    }

    private static byte[] BuildAttachProfilerPayload(uint attachTimeoutMs, Guid profilerClsid, string profilerDllPath, byte[]? clientData)
    {
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);

        w.Write(attachTimeoutMs);
        w.Write(profilerClsid.ToByteArray());

        // Length-prefixed UTF-16LE string, length counted in chars including the trailing NUL —
        // the IPC protocol's own convention for every string field.
        string pathWithNul = profilerDllPath + "\0";
        w.Write((uint)pathWithNul.Length);
        w.Write(Encoding.Unicode.GetBytes(pathWithNul));

        clientData ??= [];
        w.Write((uint)clientData.Length);
        w.Write(clientData);

        w.Flush();
        return ms.ToArray();
    }

    private static byte[] BuildMessage(byte commandSet, byte commandId, byte[] payload)
    {
        // Header: 14-byte magic + uint16 total size + commandSet + commandId + uint16 reserved.
        const int headerSize = 20;
        ushort totalSize = checked((ushort)(headerSize + payload.Length));

        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        w.Write(Magic);
        w.Write(totalSize);
        w.Write(commandSet);
        w.Write(commandId);
        w.Write((ushort)0); // reserved
        w.Write(payload);
        w.Flush();
        return ms.ToArray();
    }

    private static int ReadAttachProfilerResponse(NamedPipeClientStream pipe)
    {
        byte[] header = ReadExact(pipe, 20);
        // header[0..14] magic, header[14..16] size, [16] commandSet, [17] commandId, [18..20] reserved.
        ushort totalSize = BitConverter.ToUInt16(header, 14);
        int payloadSize = totalSize - 20;
        if (payloadSize < 4)
            throw new InvalidOperationException($"Malformed ProfilerAttach response (payload {payloadSize} bytes, expected >= 4).");

        byte[] payload = ReadExact(pipe, payloadSize);
        return BitConverter.ToInt32(payload, 0);
    }

    private static byte[] ReadExact(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read == 0)
                throw new EndOfStreamException("Diagnostics IPC pipe closed before the expected response was fully read.");
            offset += read;
        }
        return buffer;
    }
}
