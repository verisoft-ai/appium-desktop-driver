namespace DesktopDriverServer.DotNet;

/// <summary>
/// Element handle for a control inside the target CLR process, identified by the bridge.
/// Element IDs use the format "dotnet:{pid}:{controlId}" (Framework agent) or
/// "dotnetcore:{pid}:{controlId}" (CoreCLR agent — see dotnet-bridge-agent-core/ElementRegistry.cs).
/// </summary>
internal sealed class BridgeAgentElement
{
    public string Id { get; }
    public Dictionary<string, object?> Info { get; set; }

    public BridgeAgentElement(string id, Dictionary<string, object?> info)
    {
        Id = id;
        Info = info;
    }

    public static bool IsDotnetId(string id) =>
        id.StartsWith("dotnet:", StringComparison.Ordinal) || id.StartsWith("dotnetcore:", StringComparison.Ordinal);

    public static bool TryParseId(string id, out string pid, out int controlId)
    {
        pid = "";
        controlId = 0;
        if (!IsDotnetId(id)) return false;
        var parts = id.Split(':');
        if (parts.Length != 3) return false;
        pid = parts[1];
        return int.TryParse(parts[2], out controlId);
    }
}
