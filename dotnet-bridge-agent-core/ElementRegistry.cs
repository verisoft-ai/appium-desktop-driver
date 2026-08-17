namespace AppiumDotNetBridgeCore;

internal static class ElementRegistry
{
    private static readonly Dictionary<string, object> Elements = new();
    private static int _counter;

    // Distinct id prefix from the Framework bridge's "dotnet:{pid}:{n}" so ids from either agent
    // never collide in the same session.
    public static int Pid { get; set; }

    public static string Save(object target)
    {
        string id = $"dotnetcore:{Pid}:{++_counter}";
        Elements[id] = target;
        return id;
    }

    public static object? Get(string? id)
    {
        if (id == null) return null;
        return Elements.TryGetValue(id, out var v) ? v : null;
    }
}
