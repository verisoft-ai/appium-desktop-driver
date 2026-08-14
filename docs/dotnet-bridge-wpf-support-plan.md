# .NET bridge: WPF support plan

Status as of `net-bridge` @ `74580b3`. The .NET/CLR injection bridge
(`dotnet-bridge-agent/BridgeAgent.cpp`, driven from
`csharp/NovaUIAutomationServer/DotNet/*.cs`) supports WinForms and
WinForms-hosted DevExpress today. This document plans WPF support as three
independent work items, gated in the order below because (c) depends on
the outcome of (a).

## Current state (grounded in code)

**Read-only WPF already partially works.**
`Reflector::GetWindowRoot` (`BridgeAgent.cpp:428`) tries
`Control::FromHandle` first and falls back to resolving
`System.Windows.Interop.HwndSource.FromHwnd(hwnd).RootVisual` when the
window isn't WinForms. `Reflector::GetChildren` (`BridgeAgent.cpp:456`)
ends with a generic `DependencyObject^` branch (`BridgeAgent.cpp:485-491`)
that walks `VisualTreeHelper::GetChildrenCount`/`GetChild`, and
`Reflector::BuildInfo`'s generic branch (`BridgeAgent.cpp:835-856`) reads
`FrameworkElement` bounds/visibility via `PointToScreen`/`ActualWidth`/
`ActualHeight`/`IsEnabled`/`IsVisible`. So `getPageSource`/`getInfo`/
`getChildren`/`getValue` already walk an arbitrary WPF visual tree. This
matches what README.md (`README.md:87-92`) and API.md
(`API.md:1027-1032`) already tell users: "Plain WPF windows are partially
readable (generic visual-tree walk covers read-only queries)."

**Mutating WPF is broken, not just unimplemented.**
Every mutating command (`invoke`/`selectElement`/`expandElement`/
`setValue`/`requestFocus`) is dispatched through
`BridgeServer::RunOnUiThread` (`BridgeAgent.cpp:1601-1613`), which calls
`Reflector::FindUiThreadControl` (`BridgeAgent.cpp:418-426`) to find a
`Control^` to marshal onto via `Control::Invoke`. Every branch in
`FindUiThreadControl` does `dynamic_cast<Control^>` (directly or via a
synthetic wrapper's `Owner`/`View`), so a plain WPF `DependencyObject`
never matches and the function returns `nullptr`. `RunOnUiThread` then
runs the command inline on the bridge's TCP-handling thread (a bare
`Thread`, never STA, never pumping a message loop) instead of marshaling
via WPF's `Dispatcher`. This is the same class of bug the code comment at
`BridgeAgent.cpp:412-417` describes for WinForms before
`FindUiThreadControl` existed — silent failure or misbehavior, not a
clean error.

**DevExpress reflection is 100% WinForms-type-gated.**
Every DevExpress-specific reflection helper in `Reflector` checks an
exact WinForms type name:
`TryGetDevExpressGridRows` → `"DevExpress.XtraGrid.GridControl"`
(`BridgeAgent.cpp:1143-1176`);
`TryGetDevExpressTreeListRoots` → `"DevExpress.XtraTreeList.TreeList"`
(`BridgeAgent.cpp:1260-1274`);
`TryGetDevExpressComboItems` → `"DevExpress.XtraEditors.ComboBoxEdit"`
(`BridgeAgent.cpp:1297-1330`);
`TryGetDevExpressTokens` → `"DevExpress.XtraEditors.TokenEdit"`
(`BridgeAgent.cpp:1332-1361`). The one exception is
`TryAddDevExpressProps` (`BridgeAgent.cpp:865-900`), which gates only on
the `"DevExpress."` prefix (`BridgeAgent.cpp:870`) and reads
`EditValue`/`DisplayText`/`Text`/`Selected` by reflection — this already
fires for `DevExpress.Xpf.*` types too, for free, so some generic
value/selection surfacing may already work on WPF DevExpress controls
before any dedicated work below. None of the row/cell/node/item
extraction helpers do, though — `DevExpress.Xpf.Grid.GridControl` and
friends have a different, non-overlapping member surface from the
`XtraGrid`/`XtraTreeList`/`XtraEditors` WinForms line (e.g. Xpf.Grid is
`ItemsSource`-driven with `TableView`/`ColumnBase` rather than
`GridView`/`RowCount`/`GetRowCellValue`), so none of today's WinForms
reflection helpers apply as-is.

**The "verify UIA-blindness before writing reflection" discipline.**
This branch has already back-tracked once on this exact question. Per
`test-apps/devexpress-grid-ownerdraw/Program.cs:21-30`, two earlier
DevExpress fixtures (a WPF TreeList and a WinForms XtraTreeList) were
dropped because both turned out to already be fully UIA-visible via
DevExpress's own `AccessibleObject`/`AutomationPeer` support — a passing
bridge test against them would have proven nothing. The fixture that
replaced them was purpose-built to reproduce a value DevExpress paints
via `CustomDrawCell` but never exposes to UIA at all, confirmed
empirically first. The same discipline shows up again in
`test-apps/devexpress-elements-gallery/Program.cs:12-21` ("Two
DevExpress-specific candidates were probed and dropped because they
turned out to already be UIA-visible: BarManager/PopupMenu ..., and
SchedulerControl appointments ...") and in the e2e layer:
`test/e2e/dotnet-bridge-gallery.e2e.ts:11-13` notes it "Supersedes
`dotnet-bridge-listbox-probe.e2e.ts` / `test-apps/listbox-probe-throwaway/`,
both throwaway" — i.e. the established pattern is: build a throwaway
probe app + throwaway e2e test, run it for real against plain UIA,
confirm blindness, *then* commit permanent fixture + reflection code (or
drop the candidate and write nothing).

Work item (a) below applies that same discipline to WPF DevExpress
`Xpf.Grid` before (c) writes any reflection code for it.

## Work item (a): probe which Xpf.Grid cell kinds are actually UIA-blind

**Why this has to come first.** The task context is explicit that
WPF `AutomationPeer`s likely expose bound/data-driven cell values fine
(WPF's accessibility story is generally stronger than WinForms'), but
unbound columns (values only produced via a `CustomUnboundColumnData`-
style event on the WPF grid) or template/owner-drawn-equivalent cells may
still be genuinely UIA-blind, the same way they are on WinForms. Nothing
in this repo has verified that yet for the WPF DevExpress product line —
`git log --oneline net-bridge` shows no WPF-specific DevExpress fixture
or probe (only the WinForms `devexpress-grid-ownerdraw`,
`devexpress-elements-gallery`, `ownerdraw-gallery`, `winform-combo`,
`minimal-ownerdraw-*` fixtures under `test-apps/`, and the WPF TreeList
mentioned only in a since-deleted-in-history comment).

**Plan:**

1. Add a throwaway fixture `test-apps/devexpress-xpf-grid-probe-throwaway/`
   — a minimal WPF `net472` app (mirroring
   `test-apps/devexpress-grid-ownerdraw/DevExpressGridOwnerDraw.csproj`'s
   shape, but `UseWPF=true` instead of `UseWindowsForms=true`, referencing
   `DevExpress.Wpf.Grid` instead of `DevExpress.Win.Grid`) with a single
   `DevExpress.Xpf.Grid.GridControl` bound to a small in-memory collection,
   with three columns exercising the three cell kinds named in the task:
   - a plain bound column (real UIA baseline — expected visible),
   - an unbound column populated through Xpf.Grid's own unbound-column
     mechanism (the WPF equivalent of `GridView.CustomUnboundColumnData`
     used by `test-apps/devexpress-grid-ownerdraw/Program.cs:76,98-108` —
     exact API name to be confirmed against the installed
     `DevExpress.Wpf.Grid` version during implementation, since Xpf.Grid's
     event surface differs from `XtraGrid`'s),
   - a cell rendered through a custom `CellTemplate`/`DisplayTemplate`
     whose visible text is computed independently of the raw bound value
     (the closest WPF analog to WinForms `CustomDrawCell` ownerdraw —
     WPF has no GDI custom-paint path, so "owner-drawn" here means
     "templated so the rendered text isn't the literal bound property").
2. Add a matching throwaway e2e test
   `test/e2e/dotnet-bridge-xpf-grid-probe-throwaway.e2e.ts`, following the
   shape of the existing gallery specs
   (`test/e2e/dotnet-bridge-devexpress-elements.e2e.ts`,
   `test/e2e/dotnet-bridge-gallery.e2e.ts`) and their
   `launch*Externally` helpers in `test/e2e/helpers/session.ts`
   (e.g. `launchDevExpressElementsGalleryExternally` at
   `test/e2e/helpers/session.ts:538`) — add a
   `launchXpfGridProbeExternally` alongside them. The test does **not**
   attach the .NET bridge — it only calls `driver.getPageSource()` and
   per-cell `getText()`/`getAttribute('Name')`/`getAttribute('Value')`
   through plain UIA, once per column kind, and records what plain UIA
   actually sees.
3. Run this for real on a Windows box with `DevExpress.Wpf.Grid`
   installed (this cannot be done from this environment — no Windows,
   no DevExpress license/toolchain here, consistent with the
   "UNVERIFIED" disclaimer at the top of `BridgeAgent.cpp:1-4`). Record
   the findings as a short results table (bound / unbound / templated →
   UIA-visible or UIA-blind) either appended to this document or in the
   commit that removes the throwaway app.
4. Delete the throwaway app + test once findings are captured, exactly as
   `listbox-probe-throwaway` was retired (per
   `test/e2e/dotnet-bridge-gallery.e2e.ts:11-13`) — only promote a
   permanent fixture in work item (c), and only for the cell kinds
   confirmed genuinely blind.

**Decision rule for (c):** every cell kind confirmed UIA-visible here
gets zero bridge code — same call made for the original WPF TreeList
(`test-apps/devexpress-grid-ownerdraw/Program.cs:21-24`) and for
BarManager/PopupMenu and SchedulerControl
(`test-apps/devexpress-elements-gallery/Program.cs:18-21`). If the probe
shows bound *and* unbound *and* templated cells are all already
UIA-visible on WPF (plausible, given `AutomationPeer` is generally more
complete than WinForms `AccessibleObject`), work item (c) shrinks to "no
Xpf.Grid-specific reflection needed" and this plan is done after (a) + (b).

## Work item (b): fix WPF `Dispatcher` marshaling (independent of DevExpress)

Scope: make `invoke`/`selectElement`/`expandElement`/`setValue`/
`requestFocus` work correctly against a plain WPF `DependencyObject`
target, with no DevExpress dependency. This fixes a real correctness bug
that exists today for *any* WPF element the generic
`DependencyObject`/`FrameworkElement` read path in `Reflector::GetChildren`
/`BuildInfo` already returns.

**Root cause recap:** `Reflector::FindUiThreadControl`
(`BridgeAgent.cpp:418-426`) only recognizes `System.Windows.Forms.Control`.
`BridgeServer::RunOnUiThread` (`BridgeAgent.cpp:1601-1613`) only knows how
to marshal onto a `Control^` (`ctrl->IsHandleCreated && ctrl->InvokeRequired`
→ `ctrl->Invoke(gcnew MethodInvoker(...))`). For a WPF target,
`FindUiThreadControl` returns `nullptr`, so `RunOnUiThread` falls into its
"nothing to marshal onto" branch and calls `cmd->Run()` directly on the
bridge's background RPC thread — a real threading violation for any WPF
call that touches `DependencyProperty` values or visual state from off
the UI thread.

**Fix:**

1. Add a WPF-side finder parallel to `FindUiThreadControl`, e.g.
   `static System::Windows::Threading::Dispatcher^ FindWpfDispatcher(Object^ target)`
   in `Reflector`. `System.Windows.Threading.Dispatcher`,
   `PresentationCore.dll`, and `WindowsBase.dll` are already `#using`'d
   (`BridgeAgent.cpp:33-36`), so no new assembly references are needed.
   Every `DependencyObject` inherits `DispatcherObject`, which exposes a
   `Dispatcher` property directly — so this is a `dynamic_cast<DependencyObject^>(target)`
   plus a null-checked `->Dispatcher` read, not a tree walk. Guard with
   try/catch the same way `GetWindowRoot`'s WPF fallback does
   (`BridgeAgent.cpp:437-451`), since an element not yet attached to a
   `PresentationSource` can have a null or default dispatcher.
2. Extend `BridgeServer::RunOnUiThread` (`BridgeAgent.cpp:1601-1613`) to
   try the WinForms path first (unchanged, zero behavior change for
   existing WinForms/DevExpress-WinForms callers), then fall back to the
   new WPF path: if `FindWpfDispatcher` returns a non-null `Dispatcher^`,
   check `dispatcher->CheckAccess()` — if false, marshal via
   `dispatcher->Invoke(gcnew Action(cmd, &UiThreadCommand::Run))` (a
   `System::Action` delegate is sufficient since `UiThreadCommand::Run`
   returns `void` — no need for `Func<Object^>` the way
   `CellValueInvoker`/`GenericMethodInvoker` need a return value for grid
   cell reads). Only fall through to the existing "run inline" branch when
   neither a `Control^` nor a `Dispatcher^` can be found.
3. Fix `UiThreadCommand::Run`'s `RequestFocus` case
   (`BridgeAgent.cpp:1410-1412`), which currently only does
   `dynamic_cast<Control^>(_target)->Focus()`. Add a WPF branch:
   `dynamic_cast<UIElement^>(_target)` → call `->Focus()` (WPF
   `UIElement::Focus()`, distinct from WinForms `Control::Focus()` but
   same method name).
4. `Reflector::SetValue`/`Invoke`/`Select`/`Expand`
   (`BridgeAgent.cpp:902-1013`) are already pure reflection over
   `target->GetType()` with no WinForms-specific type checks except the
   synthetic-wrapper branches (`GridRowHandle`, `ListItemHandle`,
   `DevExpressTreeListNodeHandle`, `DevExpressItemHandle` — all WinForms-
   only today) — so once (2) routes the call onto the right thread, a
   plain WPF `FrameworkElement` with a writable `Text` or similar
   property, or a `PerformClick`-shaped method, already works through the
   existing generic branches with no further change. This item is scoped
   to the marshaling gap only, not new WPF-specific reflection semantics.

**Testing:** add a small permanent fixture, e.g.
`test-apps/wpf-minimal/` (a plain WPF window with a button and a text
box, no DevExpress dependency — mirrors the role
`test-apps/minimal-ownerdraw-winforms/` plays for the WinForms marshaling
fix mentioned in `556c382` — "generic list/tree bridge elements,
ownerdraw-gallery fixture, UI-thread marshaling fix" per `git log`), plus
an e2e spec exercising `invoke`/`selectElement`/`setValue`/`requestFocus`
against it after `windows: attachDotnetBridge`, following the pattern in
`test/e2e/dotnet-bridge-gallery.e2e.ts`. This item does not depend on (a)
and can be implemented and merged independently.

## Work item (c): DevExpress `Xpf.*` reflection (gated on (a))

Only start this once (a) has produced real findings. Scope is bounded by
what (a) shows is actually blind — do not assume full `Xpf.Grid`
row/cell reflection is needed if most or all cell kinds turn out already
UIA-visible (plausible per the discussion in work item (a)).

If (a) confirms one or more cell kinds are genuinely UIA-blind on WPF:

1. Add a permanent fixture,
   e.g. `test-apps/devexpress-xpf-grid-gallery/`, keeping only the
   confirmed-blind cell kind(s) from the throwaway probe (drop the
   confirmed-visible ones, matching how
   `test-apps/devexpress-elements-gallery/Program.cs` only kept the 4
   shapes that were confirmed blind and dropped BarManager/PopupMenu and
   SchedulerControl entirely).
2. Add `Reflector::TryGetDevExpressXpfGridRows` (parallel to
   `TryGetDevExpressGridRows`, `BridgeAgent.cpp:1143-1176`), gated on
   `target->GetType()->FullName == "DevExpress.Xpf.Grid.GridControl"`.
   The concrete member names will differ from the WinForms line's
   `MainView`/`RowCount`/`GetVisibleRowHandle`/`Columns`/
   `GetRowCellValue(int, column)` — `Xpf.Grid` is `ItemsSource`/
   `TableView`-based — so this needs its own reflection surface
   discovered against the real `DevExpress.Wpf.Grid` assembly, not a
   copy-paste of the WinForms helper. Whether new synthetic wrapper types
   (parallel to `GridRowHandle`/`GridCellHandle`, `BridgeAgent.cpp:277-297`)
   are needed at all depends on whether `Xpf.Grid` exposes real per-cell
   `UIElement`/`DependencyObject` instances the generic `DependencyObject`
   branch in `GetChildren`/`BuildInfo` can already walk — if so, the fix
   may only need `TryAddDevExpressProps` (`BridgeAgent.cpp:865-900`) to
   read the *real* unbound/templated value where UIA reads the placeholder,
   not a whole new row/cell extraction path. Confirm this during
   implementation before building wrapper types that mirror the WinForms
   grid's synthetic-row model unnecessarily.
3. `TryAddDevExpressProps` (`BridgeAgent.cpp:865-900`) already gates on
   the `"DevExpress."` prefix (line 870), so it already fires for
   `DevExpress.Xpf.*` types — check during implementation whether its
   existing `EditValue`/`DisplayText`/`Text`/`Selected` reads already
   surface the confirmed-blind value once (b)'s Dispatcher marshaling is
   in place, before adding a dedicated Xpf-specific helper.
4. Mutating commands (`select`/`expand`/`setValue`) on any new
   Xpf.Grid-specific wrapper types need matching branches added to
   `Reflector::Select`/`Reflector::Expand` (`BridgeAgent.cpp:937-1013`),
   the same way `GridRowHandle`/`DevExpressTreeListNodeHandle`/
   `DevExpressItemHandle` each have their own branch there today — this
   only applies if (c.2) actually introduces new wrapper types.
5. Add `test/e2e/dotnet-bridge-xpf-grid.e2e.ts`, mirroring
   `test/e2e/dotnet-bridge-devexpress-elements.e2e.ts`'s structure: a
   "plain UIA cannot see the real value" test first, then attach the
   bridge, then per-cell-kind assertions.
6. Update `README.md:87-92` and `API.md:1019-1032` — move whichever
   Xpf.Grid cell kinds are now supported out of the "WPF is not yet
   supported" / "Limitations" language, and add `DevExpress.Xpf.Grid` to
   the "Supported controls" list at `API.md:1019-1021` alongside the
   existing WinForms entries. Leave the "WPF is not yet supported"
   language in place for any Xpf.* surface still out of scope.

If (a) instead shows the probed cell kinds are all already UIA-visible on
WPF: skip (c) entirely (no dedicated Xpf.Grid reflection needed), and
just update `README.md`/`API.md` to state that WPF DevExpress grids are
readable via plain UIA once (b) lands, closing out the "WPF support"
tracking without adding new bridge code — the same outcome the original
WPF TreeList candidate had.

## Sequencing

- (b) is independent and can be implemented and merged first, in
  parallel with (a).
- (a) must complete (and produce real findings, run on Windows) before
  (c) starts — (c)'s scope is directly determined by (a)'s results and
  may shrink to "no code needed" per the decision rule above.
- (c) depends on both (a) (for scope) and (b) (mutating Xpf.Grid cells,
  if any turn out selectable/settable, need working Dispatcher marshaling
  to actually work end-to-end).
