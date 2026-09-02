namespace DesktopDriverServer.Protocol;

/// <summary>
/// Thrown when a locator expression is syntactically invalid (e.g. malformed
/// XPath). Maps to <see cref="ErrorCodes.InvalidSelector"/> on the wire, which the
/// TS client turns into Appium's InvalidSelectorError.
/// </summary>
public sealed class InvalidSelectorException : Exception
{
    public InvalidSelectorException(string message) : base(message) { }
}
