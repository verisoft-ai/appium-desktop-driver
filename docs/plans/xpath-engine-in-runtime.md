# Plan: move XPath evaluation into the runtime that owns the tree

Status: proposal / not scheduled
Author: initial draft via Claude Code
Related: PR #77 (three evaluator bugs fixed in the current design)

## Problem

`lib/xpath/` is a hand-written XPath 1.0 evaluator (~1050 lines across `core.ts` +
`functions.ts`) that walks a **remote** UI Automation tree. The tree lives in
`DesktopDriverServer.exe` (and, for bridged apps, in the injected Java/.NET agents);
every axis step, predicate attribute read and function argument is an async
JSON-RPC round trip over stdio.

Consequences of owning the evaluator:

1. **Correctness surface.** It re-implements axes, node tests, positional
   predicates, and ~20 XPath functions by hand. Three defects were found and
   fixed in a single week (PR #77): `count()` always returned 1, filter
   expressions `(set)[predicate]` mis-evaluated positional predicates, bare
   `[last()]` mis-counted. There is no reason to believe the remaining surface is
   clean.
2. **Partial pushdown.** Only a subset of predicates compile to a native
   `ConditionDto` (`ControlType`, `@attr = 'literal'`, `contains`/`starts-with`
   on a whitelist, `@TableRow/@TableColumn = N`). Everything else — positional,
   cross-element (`count()`, `[.//x]`), path-in-predicate, string functions — is
   evaluated client-side by fetching candidates and calling `getProperty` per
   candidate. For bridged apps that is O(tree) stdio round trips and is
   race-prone against transient elements.
3. **No user upside for the complexity.** WebDriver / Appium / Selenium emit
   XPath 1.0. Nobody sends XPath 2/3. The evaluator will never need sequences,
   `for`/`let`, or typed values.
4. **Thin test coverage.** Until PR #77 there were zero unit tests for the
   engine — only e2e, which needs Windows + a running app.

## Goal

Evaluate the whole XPath expression **in the process that holds the tree**, using
a mature, spec-complete XPath engine bound to that runtime's native object model.
`lib/xpath/` shrinks to: parse nothing (delete `xpath-analyzer` use here), forward
the raw expression string, map returned node handles to element ids.

Non-goals: the `-windows uiautomation` locator converter (`lib/powershell/`), which
shares `ConditionDto` plumbing but not the XPath evaluator, stays as-is.

## Design

### New RPC: `evaluateXPath`

```
-> { method: "evaluateXPath",
     params: { expression: string,
               contextElementId: string | null,   // null = session root
               multiple: boolean } }
<- { result: string[] }                            // element-table ids, doc order
```

Replaces the per-step `findElement`/`findElements` traffic that `lib/xpath/core.ts`
generates today. `lib/commands/find-via.ts` calls it directly for the `xpath`
strategy; `lib/xpath/` is deleted except a ~40-line shim that calls the RPC and
wraps ids as `{ [W3C_ELEMENT_KEY]: id }`.

### .NET / UIA (primary)

- Implement `UiaXPathNavigator : System.Xml.XPath.XPathNavigator` over the live
  UIA tree:
  - `MoveToFirstChild` / `MoveToNext` / `MoveToParent` via a cached
    `TreeWalker` (ControlView, matching current behaviour).
  - `LocalName` / `Name` = the element's `ControlType` localised name mapped to
    the tag names the driver already exposes (`Button`, `Text`, …).
  - Attributes: expose the same set `lib/xpath` supports today
    (`Name`, `AutomationId`, `ClassName`, `RuntimeId`, bounding-rect `x/y/width/height`,
    the boolean/int UIA properties). `MoveToFirstAttribute` / `MoveToNextAttribute`
    iterate a fixed list; `GetAttribute(name)` reads the UIA property on demand.
  - `Value` = element text (TextPattern / Name fallback), matching `getText`.
- Evaluate with `XPathNavigator.Evaluate(expression)` /
  `Select(expression)`. `System.Xml.XPath` is a complete, Microsoft-maintained
  XPath 1.0 engine — axes, positional predicates, `count()`, `string-length()`,
  `normalize-space()`, `substring*()`, `translate()`, unions, all correct.
- Map each result node back to an element-table id: the navigator carries the
  underlying `IUIAutomationElement`; `SessionState.SaveElementAndReturnId` already
  exists.
- Custom functions: register an `XsltContext` for the handful of driver-specific
  helpers if any survive (`id()` by RuntimeId — probably drop; nothing else is
  non-standard).

Cost: one navigator class (~250 lines) + wiring. No new dependency.

### .NET CLR bridge

Same pattern: `BridgeXPathNavigator : XPathNavigator` over the reflection tree the
bridge already builds (`dotnet-bridge-agent-core/`). The bridge process is .NET,
so `System.Xml.XPath` is free there too. Fixes the current state where the bridge
**ignores `scope` entirely** and only ever does a recursive descendant walk
(`BridgeServer.CollectMatches`).

Cost: ~200 lines, shared shape with the UIA navigator.

### Java bridge

The Java agent (`java-agent/`) is a hand-compiled jar with **no external deps**
and no build tool (`build.bat` is raw `javac`). Two options:

- **A. Jaxen.** Vendor `jaxen-*.jar` (single jar, ~250 KB, BSD-style licence),
  add to the `javac` classpath and the `jar` bundle. Implement
  `org.jaxen.Navigator` over the `AccessibleContext` tree. Jaxen exists precisely
  for XPath over non-DOM object models (dom4j, JDOM, XOM) and is battle-tested.
  ~200 lines of navigator.
- **B. Keep the DTO path for Java only.** The Java agent already evaluates a
  whole `ConditionDto` in one traversal (`CommandHandler.matchesCondition`); what
  it lacks is multi-step axis handling (the TS engine still drives that with a
  round trip per step). A middle option: teach the Java agent a small
  compiled-predicate evaluator so `evaluateXPath` can run there without Jaxen.
  More bespoke code — only worth it if vendoring a jar is unacceptable.

Recommendation: A. The dependency cost is one jar; the alternative is more
hand-rolled evaluation, which is the thing this plan is trying to delete.

### Element identity

Every navigator result must resolve to a stable element-table id so subsequent
WebDriver calls (`click`, `getText`, `findElementFromElement`) work. Each runtime
already has an element table (`SessionState` in .NET, `ComponentRegistry` in
Java). The navigator holds the native handle; on result extraction, save-or-lookup
in that table. Context element (`contextElementId != null`) seeds the navigator's
starting position from the same table.

## Migration

Incremental, both engines live side by side until parity is proven.

1. **Land `evaluateXPath` for UIA only**, behind an opt-in capability
   (`appium:xpathEngine: "server"` — default stays `"client"`).
2. **Parity harness.** Run the full e2e xpath suite (`find-element.e2e.ts`,
   `xpath-axes.e2e.ts`, plus the java/dotnet bridge suites) against both engines;
   add any expression that diverges as a regression case. The unit-test tree in
   `test/xpath/core.test.ts` can be ported to a .NET test fixture for the
   navigator.
3. **Flip default to `"server"`** once the suite is green on both for a release.
4. **Add the .NET-bridge navigator**, delete `BridgeServer.CollectMatches`
   scope-ignoring code.
5. **Add the Java navigator** (Jaxen).
6. **Delete `lib/xpath/core.ts` + `functions.ts`**, drop `xpath-analyzer` from
   `find-via.ts`, keep the ~40-line RPC shim. Remove the `"client"` capability
   branch.

Each step is independently shippable and reversible.

## Risks / open questions

- **Axis semantics parity.** Today `following`/`preceding` and the sibling axes
  are implemented in `FindCommands.cs` with specific ControlView-walker
  behaviour. A `System.Xml.XPath` navigator defines these itself; results should
  match (both walk the same ControlView tree) but need explicit e2e coverage —
  especially `following`/`preceding` exclusion of ancestors/descendants.
- **Attribute value coercion.** XPath is untyped-string; the navigator must
  return `"true"`/`"false"` for booleans, decimal strings for ints, `"1.2.3"` for
  RuntimeId — matching what `getProperty` returns today so existing selectors
  keep working.
- **`text()` / `node()` semantics.** UIA has no text nodes. Current engine maps
  `text()` to the element's Name/Value; the navigator must do the same or
  selectors like `//*[contains(text(),"x")]` break.
- **Performance.** Expectation: improvement (one RPC vs N per-step round trips;
  evaluation in-process on the live tree). Needs measurement on a large tree
  (thousands of nodes) and on a bridged app, vs current.
- **Custom tag names for JAB roles.** `convertNodeTestToCondition` falls back to
  ClassName for unknown ControlTypes (JAB `PushButton`, `RootPane`). The Java
  navigator's `LocalName` must expose the same normalised names.
- **`id()` function.** Currently resolves by RuntimeId. Likely droppable (no
  known caller); confirm before deleting.
- **Jaxen licence / supply chain.** BSD-3-style, no transitive deps. Vendored jar
  needs a provenance note in the repo.
- **`-windows uiautomation` converter.** Untouched, but it and the XPath engine
  currently share `ConditionDto` + `converter-bridge.ts`. Confirm nothing in the
  shared module is deleted out from under the converter.

## Effort estimate

| Piece | Rough size |
|---|---|
| `UiaXPathNavigator` + `evaluateXPath` RPC + TS shim | 2–3 days |
| Parity harness + e2e coverage for axis edge cases | 1–2 days |
| `.NET` bridge navigator | 1 day |
| Java navigator + Jaxen vendoring + build changes | 2 days |
| Delete `lib/xpath` eval, cleanup, docs | 0.5 day |

~1.5–2 weeks total, shippable in 6 increments.

## Alternative considered: keep TS, adopt a JS engine

Rejected. Every pluggable-model JS XPath engine (`fontoxpath`, `jsel`, npm
`xpath`) requires **synchronous** node navigation. The tree is behind async RPC.
The only way to use one is to serialise the whole subtree per query into an
in-memory model first — which discards the native/bridge pushdown, adds a large
transfer for big trees, and still needs the split logic. Moving evaluation to the
tree's own process removes the async-vs-sync mismatch entirely and lets each
runtime use its platform's mature engine.
