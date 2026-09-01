using System.Xml;
using System.Xml.XPath;
using DesktopDriverServer.Protocol;

namespace DesktopDriverServer.Commands;

/// <summary>
/// Shared back half of every <c>evaluateXPath</c> path (real UIA, the .NET bridge,
/// the Java agent). Each caller materialises its runtime's subtree into an
/// <see cref="XmlDocument"/> whose elements carry a node-id attribute, then hands
/// the document here to run the expression through <c>System.Xml.XPath</c> and map
/// the result nodes back to element-table ids.
///
/// Keeping this in one place means the result-set rules — document order, dedupe,
/// single-vs-multiple, "a non-node-set result is not a locator", malformed-XPath
/// handling — are defined once and unit-tested once.
/// </summary>
public static class XPathEvaluator
{
    /// <param name="doc">Materialised tree. Element nodes carry <paramref name="idAttr"/>.</param>
    /// <param name="contextNode">
    /// Node to evaluate relative to (for `.//x`, `..`, `self::`, upward axes), or null
    /// to evaluate from the document root.
    /// </param>
    /// <param name="idAttr">Attribute name holding each element's materialisation node id.</param>
    /// <param name="resolve">Maps a node id to the element-table id, or null to drop it.</param>
    /// <returns>Element-table ids in document order (deduped). Empty when nothing matched.</returns>
    public static List<string> Evaluate(
        XmlDocument doc,
        XmlNode? contextNode,
        string idAttr,
        string expression,
        bool multiple,
        Func<string, string?> resolve)
    {
        XPathNavigator nav = (contextNode ?? doc).CreateNavigator()!;

        object evaluated;
        try
        {
            evaluated = nav.Evaluate(expression);
        }
        catch (XPathException ex)
        {
            throw new InvalidSelectorException($"Malformed XPath: {ex.Message}");
        }
        catch (ArgumentException ex)
        {
            throw new InvalidSelectorException($"Malformed XPath: {ex.Message}");
        }

        var ids = new List<string>();
        if (evaluated is not XPathNodeIterator it)
        {
            // string(...), count(...), boolean(...) — not an element locator.
            return ids;
        }

        while (it.MoveNext())
        {
            var cur = it.Current;
            if (cur == null || cur.NodeType != XPathNodeType.Element) continue;
            var xmlEl = (cur as IHasXmlNode)?.GetNode() as XmlElement;
            var nodeId = xmlEl?.GetAttribute(idAttr);
            if (string.IsNullOrEmpty(nodeId)) continue;
            var elId = resolve(nodeId!);
            if (elId == null || ids.Contains(elId)) continue;
            ids.Add(elId);
            if (!multiple) break;
        }

        return ids;
    }
}
