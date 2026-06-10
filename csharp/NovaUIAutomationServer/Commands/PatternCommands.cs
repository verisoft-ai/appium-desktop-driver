using System.Text.Json;
using NovaUIAutomationServer.Jab;
using NovaUIAutomationServer.State;
using NovaUIAutomationServer.Uia3;

namespace NovaUIAutomationServer.Commands;

public static class PatternCommands
{
    public static object? Invoke(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        if (JabElement.IsJabId(elementId))
        {
            state.Jab!.Invoke(state.Jab.GetById(elementId));
            return null;
        }

        var element = GetElement(state, parameters);

        if (element.GetCurrentPattern(UIA.InvokePatternId) is IUIAutomationInvokePattern invoke)
        {
            invoke.Invoke();
        }
        else if (element.GetCurrentPattern(UIA.SelectionItemPatternId) is IUIAutomationSelectionItemPattern sel)
        {
            sel.Select();
        }
        else if (element.GetCurrentPattern(UIA.LegacyIAccessiblePatternId) is IUIAutomationLegacyIAccessiblePattern legacy)
        {
            legacy.DoDefaultAction();
        }
        else
        {
            throw new InvalidOperationException(
                "Element does not support InvokePattern, SelectionItemPattern, or LegacyIAccessiblePattern.");
        }

        // Yield to let the target app's message pump process the event before
        // the next command touches it. Keeps rapid back-to-back invokes from
        // racing the app's UI thread (e.g. calculator button mashing).
        Thread.Sleep(50);
        return null;
    }

    public static object? Expand(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationExpandCollapsePattern>(state, parameters, UIA.ExpandCollapsePatternId, "ExpandCollapsePattern");
        p.Expand();
        return null;
    }

    public static object? Collapse(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationExpandCollapsePattern>(state, parameters, UIA.ExpandCollapsePatternId, "ExpandCollapsePattern");
        p.Collapse();
        return null;
    }

    public static object? Toggle(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        // JAB has no TogglePattern — fire the default accessible action (toggles checkboxes, buttons).
        if (JabElement.IsJabId(elementId))
        {
            state.Jab!.Invoke(state.Jab.GetById(elementId));
            Thread.Sleep(50); // match UIA Invoke settle delay so the next state-read isn't stale
            return null;
        }

        var pattern = RequirePattern<IUIAutomationTogglePattern>(state, parameters, UIA.TogglePatternId, "TogglePattern");
        pattern.Toggle();
        return null;
    }

    public static object? GetToggleState(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var id = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        // JAB: re-fetch info live — cached Info.states is stale after interaction.
        if (JabElement.IsJabId(id))
        {
            var states = GetJabStates(state, state.Jab!.GetById(id));
            if (states.Contains("indeterminate", StringComparison.OrdinalIgnoreCase))
                return "Indeterminate";
            return states.Contains("checked", StringComparison.OrdinalIgnoreCase) ? "On" : "Off";
        }

        var pattern = RequirePattern<IUIAutomationTogglePattern>(state, parameters, UIA.TogglePatternId, "TogglePattern");
        return pattern.CurrentToggleState.ToString();
    }

    public static object? SetRangeValue(SessionState state, JsonElement? parameters)
    {
        var par = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = par.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");
        var value = par.GetProperty("value").GetDouble();

        var element = state.GetElement(elementId);
        if (element.GetCurrentPattern(UIA.RangeValuePatternId) is IUIAutomationRangeValuePattern p)
        {
            p.SetValue(value);
            return null;
        }
        throw new InvalidOperationException("Element does not support RangeValuePattern.");
    }

    public static object? ScrollIntoView(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationScrollItemPattern>(state, parameters, UIA.ScrollItemPatternId, "ScrollItemPattern");
        p.ScrollIntoView();
        return null;
    }

    public static object? Select(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationSelectionItemPattern>(state, parameters, UIA.SelectionItemPatternId, "SelectionItemPattern");
        p.Select();
        return null;
    }

    public static object? AddToSelection(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationSelectionItemPattern>(state, parameters, UIA.SelectionItemPatternId, "SelectionItemPattern");
        p.AddToSelection();
        return null;
    }

    public static object? RemoveFromSelection(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationSelectionItemPattern>(state, parameters, UIA.SelectionItemPatternId, "SelectionItemPattern");
        p.RemoveFromSelection();
        return null;
    }

    public static object? IsSelected(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var id = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        // JAB: re-fetch info live — cached Info.states is stale after interaction.
        if (JabElement.IsJabId(id))
        {
            var states = GetJabStates(state, state.Jab!.GetById(id));
            return states.Contains("checked", StringComparison.OrdinalIgnoreCase)
                || states.Contains("selected", StringComparison.OrdinalIgnoreCase);
        }

        var pattern = RequirePattern<IUIAutomationSelectionItemPattern>(state, parameters, UIA.SelectionItemPatternId, "SelectionItemPattern");
        return pattern.CurrentIsSelected != 0;
    }

    public static object? IsMultipleSelect(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationSelectionPattern>(state, parameters, UIA.SelectionPatternId, "SelectionPattern");
        return p.CurrentCanSelectMultiple != 0;
    }

    public static object? GetSelectedElements(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationSelectionPattern>(state, parameters, UIA.SelectionPatternId, "SelectionPattern");
        var selected = p.GetCurrentSelection();
        return FindCommands.IterateArray(selected)
            .Select(el => state.SaveElementAndReturnId(el))
            .ToArray();
    }

    public static object? MaximizeWindow(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationWindowPattern>(state, parameters, UIA.WindowPatternId, "WindowPattern");
        p.SetWindowVisualState(WindowVisualState.Maximized);
        return null;
    }

    public static object? MinimizeWindow(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationWindowPattern>(state, parameters, UIA.WindowPatternId, "WindowPattern");
        p.SetWindowVisualState(WindowVisualState.Minimized);
        return null;
    }

    public static object? RestoreWindow(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationWindowPattern>(state, parameters, UIA.WindowPatternId, "WindowPattern");
        p.SetWindowVisualState(WindowVisualState.Normal);
        return null;
    }

    public static object? CloseWindow(SessionState state, JsonElement? parameters)
    {
        var p = RequirePattern<IUIAutomationWindowPattern>(state, parameters, UIA.WindowPatternId, "WindowPattern");
        p.Close();
        return null;
    }

    public static object? MoveWindow(SessionState state, JsonElement? parameters)
    {
        var par = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = par.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");
        var x = par.GetProperty("x").GetDouble();
        var y = par.GetProperty("y").GetDouble();

        var element = state.GetElement(elementId);
        if (element.GetCurrentPattern(UIA.TransformPatternId) is IUIAutomationTransformPattern p)
        {
            p.Move(x, y);
            return null;
        }
        throw new InvalidOperationException("Element does not support TransformPattern.");
    }

    public static object? ResizeWindow(SessionState state, JsonElement? parameters)
    {
        var par = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = par.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");
        var width = par.GetProperty("width").GetDouble();
        var height = par.GetProperty("height").GetDouble();

        var element = state.GetElement(elementId);
        if (element.GetCurrentPattern(UIA.TransformPatternId) is IUIAutomationTransformPattern p)
        {
            p.Resize(width, height);
            return null;
        }
        throw new InvalidOperationException("Element does not support TransformPattern.");
    }

    private static string GetJabStates(SessionState state, JabElement jabEl)
        => (state.Jab!.GetFreshInfo(jabEl) ?? jabEl.Info).states ?? "";

    private static IUIAutomationElement GetElement(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");
        return state.GetElement(elementId);
    }

    private static T RequirePattern<T>(SessionState state, JsonElement? parameters, int patternId, string patternName) where T : class
    {
        var element = GetElement(state, parameters);
        if (element.GetCurrentPattern(patternId) is T pattern)
        {
            return pattern;
        }
        throw new InvalidOperationException($"Element does not support {patternName}.");
    }
}
