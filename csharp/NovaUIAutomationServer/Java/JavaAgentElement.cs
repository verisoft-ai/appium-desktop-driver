namespace NovaUIAutomationServer.Java;

/// <summary>
/// Element handle for a component inside the target JVM, identified by the agent.
/// Element IDs use the format "java:{pid}:{componentId}".
/// </summary>
internal sealed class JavaAgentElement
{
    public string Id { get; }
    public Dictionary<string, object?> Info { get; set; }

    public JavaAgentElement(string id, Dictionary<string, object?> info)
    {
        Id = id;
        Info = info;
    }

    public static bool IsJavaId(string id) =>
        id.StartsWith("java:", StringComparison.Ordinal);

    public static bool TryParseId(string id, out string pid, out int componentId)
    {
        pid = "";
        componentId = 0;
        if (!id.StartsWith("java:", StringComparison.Ordinal)) return false;
        var parts = id.Split(':');
        if (parts.Length != 3) return false;
        pid = parts[1];
        return int.TryParse(parts[2], out componentId);
    }
}
