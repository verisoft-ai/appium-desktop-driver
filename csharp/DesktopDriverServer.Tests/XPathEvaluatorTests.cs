using System.Xml;
using DesktopDriverServer.Commands;
using DesktopDriverServer.Protocol;
using Xunit;

namespace DesktopDriverServer.Tests;

/// <summary>
/// Parity coverage for the shared back half of every evaluateXPath path. The
/// per-runtime front halves build an <see cref="XmlDocument"/> with a node-id
/// attribute on each element; this exercises the expression evaluation and
/// result mapping against a representative document (a Calculator-shaped tree)
/// with the exact attribute schema the materialisers emit.
/// </summary>
public class XPathEvaluatorTests
{
    private const string IdAttr = "__id";

    // NumberPad group with buttons One..Three, a sibling group with an Edit,
    // booleans lowercased, text() == Name — matching UiaXmlModel / the bridge builders.
    private static XmlDocument Doc()
    {
        var doc = new XmlDocument();
        doc.LoadXml(@"
<Window Name='Calculator' AutomationId='' __id='n0'>
  <Custom __id='n1'>
    <Group Name='' AutomationId='NumberPad' __id='n2'>
      <Button Name='One'   AutomationId='num1Button' IsEnabled='true' __id='n3'>One</Button>
      <Button Name='Two'   AutomationId='num2Button' IsEnabled='true' __id='n4'>Two</Button>
      <Button Name='Three' AutomationId='num3Button' IsEnabled='false' __id='n5'>Three</Button>
    </Group>
    <Group Name='' AutomationId='Other' __id='n6'>
      <Edit Name='display' AutomationId='result' __id='n7'>0</Edit>
    </Group>
  </Custom>
</Window>");
        return doc;
    }

    private static List<string> Eval(string expr, bool multiple = true)
        => XPathEvaluator.Evaluate(Doc(), null, IdAttr, expr, multiple, id => id);

    private static List<string> Eval(XmlDocument doc, string expr, bool multiple = true, XmlNode? ctx = null)
        => XPathEvaluator.Evaluate(doc, ctx, IdAttr, expr, multiple, id => id);

    [Theory]
    [InlineData("//Button[@Name=\"One\"]", "n3")]
    [InlineData("//*[contains(@Name, \"ne\")]", "n3")]
    [InlineData("//Button[starts-with(@Name, \"T\")]", "n4,n5")]
    [InlineData("//Button[@Name=\"One\" and @AutomationId=\"num1Button\"]", "n3")]
    [InlineData("//*[contains(@Name, \"ZZZ\")]", "")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/following-sibling::Button", "n4,n5")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/following-sibling::Button[1]", "n4")]
    [InlineData("//Button[@AutomationId=\"num2Button\"]/preceding-sibling::Button", "n3")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/parent::Group", "n2")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/..", "n2")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/ancestor::Window", "n0")]
    [InlineData("//Button[@AutomationId=\"num1Button\"]/following::Button", "n4,n5")]
    [InlineData("(//Group[@AutomationId=\"NumberPad\"]/Button)[1]", "n3")]
    [InlineData("(//Group[@AutomationId=\"NumberPad\"]/Button)[last()]", "n5")]
    [InlineData("(//Group[@AutomationId=\"NumberPad\"]/Button)[position() > 1]", "n4,n5")]
    [InlineData("(//Group[@AutomationId=\"NumberPad\"]/Button)[last() - 1]", "n4")]
    [InlineData("//Group[@AutomationId=\"NumberPad\"]/Button[last()]", "n5")]
    [InlineData("//Group[@AutomationId=\"NumberPad\"]/Button[position()=2]", "n4")]
    [InlineData("//Group[count(child::Button) >= 3]", "n2")]
    [InlineData("//Group[Button[@AutomationId=\"num1Button\"]]", "n2")]
    [InlineData("//Group[@AutomationId=\"NumberPad\"]/*[1]", "n3")]
    [InlineData("//*[@AutomationId=\"num1Button\"]", "n3")]
    [InlineData("//Button[normalize-space(@Name)=\"One\"]", "n3")]
    [InlineData("//Button[not(@AutomationId=\"num1Button\")]", "n4,n5")]
    [InlineData("//Button[@Name=\"One\"] | //Button[@Name=\"Two\"]", "n3,n4")]
    [InlineData("//Button[contains(text(),\"hre\")]", "n5")]
    [InlineData("//Button[@IsEnabled=\"true\"]", "n3,n4")]
    [InlineData("//Edit", "n7")]
    public void Selects_expected_nodes_in_document_order(string expr, string expectedCsv)
    {
        var expected = expectedCsv.Length == 0 ? Array.Empty<string>() : expectedCsv.Split(',');
        Assert.Equal(expected, Eval(expr));
    }

    [Fact]
    public void Single_find_returns_only_the_first_match()
    {
        Assert.Equal(new[] { "n3" }, Eval("//Button", multiple: false));
    }

    [Fact]
    public void Relative_expression_evaluates_against_the_context_node()
    {
        var doc = Doc();
        var numberPad = doc.SelectSingleNode("//Group[@AutomationId='NumberPad']")!;
        Assert.Equal(new[] { "n3", "n4", "n5" }, Eval(doc, "./Button", ctx: numberPad));
        // // is still document-rooted even from a context node.
        Assert.Equal(new[] { "n7" }, Eval(doc, "//Edit", ctx: numberPad));
    }

    [Fact]
    public void A_non_node_set_result_is_not_a_locator()
    {
        Assert.Empty(Eval("count(//Button)"));
        Assert.Empty(Eval("string(//Button/@Name)"));
    }

    [Fact]
    public void Malformed_xpath_throws_InvalidSelectorException()
    {
        Assert.Throws<InvalidSelectorException>(() => Eval("//Button["));
        Assert.Throws<InvalidSelectorException>(() => Eval("//Button[bogus-fn()]"));
    }

    [Fact]
    public void Duplicate_matches_are_deduped_keeping_first_position()
    {
        // A union that names the same node twice.
        Assert.Equal(new[] { "n3" }, Eval("//Button[@Name=\"One\"] | //*[@AutomationId=\"num1Button\"]"));
    }
}
