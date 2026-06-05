namespace NovaUIAutomationServer.Jab;

/// <summary>
/// A Java accessible element retrieved via Java Access Bridge.
/// Element IDs use the format "jab:{vmid}:{ac}" where ac is the Int64 Java object handle.
/// </summary>
internal sealed class JabElement
{
    public int VmId { get; }
    public long Ac { get; }
    public JabNative.AccessibleContextInfo Info { get; }

    public JabElement(int vmId, long ac, JabNative.AccessibleContextInfo info)
    {
        VmId = vmId;
        Ac = ac;
        Info = info;
    }

    public string Id => MakeId(VmId, Ac);

    public static string MakeId(int vmId, long ac) => $"jab:{vmId}:{ac}";

    public static bool IsJabId(string id) =>
        id.StartsWith("jab:", StringComparison.Ordinal);

    public static bool TryParseId(string id, out int vmId, out long ac)
    {
        vmId = 0;
        ac = 0;
        if (!id.StartsWith("jab:", StringComparison.Ordinal)) return false;
        var parts = id.Split(':');
        if (parts.Length != 3) return false;
        return int.TryParse(parts[1], out vmId) && long.TryParse(parts[2], out ac);
    }
}
