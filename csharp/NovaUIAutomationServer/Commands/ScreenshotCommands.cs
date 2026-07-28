using System.Drawing.Imaging;
using System.Text.Json;
using NovaUIAutomationServer.State;
using NovaUIAutomationServer.Uia3;

namespace NovaUIAutomationServer.Commands;

public static class ScreenshotCommands
{
    public static object? GetScreenshot(SessionState state, JsonElement? parameters)
    {
        if (!NativeWindowRect.TryGet(state.RootNativeWindowHandle, out var rect))
        {
            // Falls back to the old UIA path — this is the one that can stall
            // or throw UIA_E_ELEMENTNOTAVAILABLE if the target app's UI
            // thread is busy, but only hit when we have no window handle.
            var root = state.GetLiveRoot();
            if (root == null)
            {
                // Return 1x1 transparent PNG if no root
                using var bitmap = new Bitmap(1, 1);
                using var stream = new MemoryStream();
                bitmap.Save(stream, ImageFormat.Png);
                return Convert.ToBase64String(stream.ToArray());
            }
            rect = root.CurrentBoundingRectangle;
        }

        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;
        using var bmp = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bmp);
        graphics.CopyFromScreen(rect.left, rect.top, 0, 0, bmp.Size);

        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Png);
        return Convert.ToBase64String(ms.ToArray());
    }

    public static object? GetElementScreenshot(SessionState state, JsonElement? parameters)
    {
        var p = parameters ?? throw new ArgumentException("Parameters required.");
        var elementId = p.GetProperty("elementId").GetString()
            ?? throw new ArgumentException("elementId is required.");

        var element = state.GetElement(elementId);
        var rect = element.CurrentBoundingRectangle;
        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;

        using var bitmap = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(rect.left, rect.top, 0, 0, bitmap.Size);

        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return Convert.ToBase64String(stream.ToArray());
    }
}
