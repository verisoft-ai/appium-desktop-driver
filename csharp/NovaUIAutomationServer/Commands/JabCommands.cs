using System.Text.Json;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

public static class JabCommands
{
    public static object? EnableJavaSwing(SessionState state, JsonElement? parameters)
    {
        state.EnableJavaSwing();
        return null;
    }
}
