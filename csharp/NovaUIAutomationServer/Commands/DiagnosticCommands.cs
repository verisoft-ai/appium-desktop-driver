using System.Text.Json;
using System.Windows.Forms;
using NovaUIAutomationServer.Server;
using NovaUIAutomationServer.State;

namespace NovaUIAutomationServer.Commands;

public static class DiagnosticCommands
{
    private static readonly DateTime StartTime = DateTime.UtcNow;

    public static object? GetMonitors(SessionState state, JsonElement? parameters)
    {
        var index = 0;
        return Screen.AllScreens.Select(s => new
        {
            index       = index++,
            deviceName  = s.DeviceName,
            primary     = s.Primary,
            bounds      = new { x = s.Bounds.X, y = s.Bounds.Y, width = s.Bounds.Width, height = s.Bounds.Height },
            workingArea = new { x = s.WorkingArea.X, y = s.WorkingArea.Y, width = s.WorkingArea.Width, height = s.WorkingArea.Height },
        }).ToList();
    }

    public static object? Ping(SessionState state, JsonElement? parameters)
    {
        return new
        {
            status = "pong",
            uptimeSeconds = (long)(DateTime.UtcNow - StartTime).TotalSeconds,
            elementCount = state.ElementTable.Count,
            hasRootElement = state.RootElement != null,
        };
    }

    public static object? InspectElementTable(SessionState state, JsonElement? parameters)
    {
        var entries = new List<object>();

        foreach (var kvp in state.ElementTable)
        {
            string name = "";
            string controlType = "";
            bool isAlive = false;

            try
            {
                name = kvp.Value.get_CurrentName() ?? "";
                var ctId = kvp.Value.CurrentControlType;
                controlType = ConditionBuilder.ControlTypeNameById.TryGetValue(ctId, out var n) ? n : ctId.ToString();
                isAlive = true;
            }
            catch
            {
                // Element is no longer valid
            }

            entries.Add(new
            {
                runtimeId = kvp.Key,
                name,
                controlType,
                isAlive,
            });
        }

        return entries;
    }
}
