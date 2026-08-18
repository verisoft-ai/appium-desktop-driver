using System.Text.Json;
using NovaUIAutomationServer.Protocol;
using NovaUIAutomationServer.State;
using NovaUIAutomationServer.Uia3;

namespace NovaUIAutomationServer.DotNet;

/// <summary>
/// Correlates a UIA element that UIA itself reports as opaque (a control-view
/// element with zero UIA children) to its counterpart in the .NET bridge's
/// reflected control tree, so callers can splice the bridge's subtree in at
/// that exact point instead of swapping the whole window's tree for the
/// bridge's view (which uses a different tree shape — see BridgeUiaShaper).
/// </summary>
internal static class DotNetBridgeSplice
{
    /// <summary>
    /// Finds the bridge node matching a blind UIA element by AutomationId (if
    /// present) or Name+ClassName. Returns null when the element carries no
    /// distinguishing property to correlate on, or has no bridge counterpart.
    /// </summary>
    public static BridgeAgentElement? Correlate(SessionState state, IUIAutomationElement uiaElement, BridgeAgentElement bridgeWindowRoot)
    {
        var automationId = uiaElement.get_CurrentAutomationId() ?? "";
        var name = uiaElement.get_CurrentName() ?? "";
        var className = uiaElement.get_CurrentClassName() ?? "";

        ConditionDto? condition = BuildCorrelationCondition(automationId, name, className);
        if (condition == null) return null;

        try
        {
            var id = state.DotNetBridge!.FindFirst(bridgeWindowRoot, condition, "subtree");
            return id != null ? state.DotNetBridge.GetById(id) : null;
        }
        catch
        {
            return null;
        }
    }

    private static ConditionDto? BuildCorrelationCondition(string automationId, string name, string className)
    {
        if (!string.IsNullOrEmpty(automationId))
        {
            return PropertyCondition("AutomationId", automationId);
        }
        if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(className))
        {
            return new ConditionDto
            {
                Type = "and",
                Conditions = new[] { PropertyCondition("Name", name), PropertyCondition("ClassName", className) },
            };
        }
        if (!string.IsNullOrEmpty(name))
        {
            return PropertyCondition("Name", name);
        }
        return null;
    }

    private static ConditionDto PropertyCondition(string property, string value) => new()
    {
        Type = "property",
        Property = property,
        Value = JsonSerializer.SerializeToElement(value),
    };
}
