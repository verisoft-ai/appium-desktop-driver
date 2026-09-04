# Performance benchmarks

Tracks the cost of the driver's expensive tree-walk paths so regressions are visible
and improvements are documented with numbers. Three suites, one method:

| suite | fixture | what it measures |
| --- | --- | --- |
| `java` | `java-swing-large` | in-JVM agent walk (newline-JSON RPC, one `getChildren` per node) |
| `uia` | `wpf-large` | plain UIA walk (COM property reads + `FindAll` per node, in-process) |
| `dotnet-bridge` | `winforms-large` | .NET bridge reflected-tree walk (same RPC channel shape as Java) |

Each fixture feeds exactly one suite. `uia` runs against `wpf-large` because WPF
has a **native** UIA provider (`AutomationPeer`) — that measures the COM tree-walk
cost itself, not the MSAA→UIA bridge tax that `winforms-large` (no native provider)
would fold in. `winforms-large` is kept solely for `dotnet-bridge`, where the bridge
injects into the process and the UI framework is not the variable under test.

## Running

```bash
# Needs: the sibling fixture repo checked out next to this one and built
#   ../appium-wincore-test-apps  ->  npm run build:java-swing-large-test-app
#                                    npm run build:wpf-large-test-app
#                                    npm run build:winforms-large-test-app
# plus a running Appium server with this driver installed.
npm run test:perf                     # all three suites
npx vitest run --config vitest.perf.config.ts test/perf/uia-pagesource.perf.ts   # one suite
```

Knobs (env):

| var | default | meaning |
| --- | --- | --- |
| `PERF_NODE_COUNT` | `1500` | fixture size (`-DnodeCount` / `--nodes`) |
| `TEST_APPS_DIR` | `../appium-wincore-test-apps` | fixture repo location |

Each run writes `test/perf/results/<suite>-<sha>-<timestamp>.json` (git-ignored) and
prints a table. CI (`.github/workflows/perf-test.yml`, manual + weekly) uploads them.

## The `perfMetrics` capability

Set `appium:perfMetrics: true` at session creation to turn on per-session counters.
Off by default, near-zero cost when on.

```js
await driver.executeScript('windows: resetPerfMetrics', []);
await driver.getPageSource();
const { enabled, metrics } = await driver.executeScript('windows: getPerfMetrics', []);
// metrics = { totalCalls, totalMs, byLabel: { '<label>': { count, totalMs } } }
```

Counter labels by suite:

| suite | labels | `count` is | `totalMs` is |
| --- | --- | --- | --- |
| `java` | `java.<rpcCommand>` (e.g. `java.getChildren`) | RPCs of that kind | wall-clock waiting on the agent |
| `dotnet-bridge` | `dotnetBridge.<rpcCommand>` | RPCs of that kind | wall-clock waiting on the bridge |
| `uia` | `uia.pageSource.node`, `uia.xpathModel.node` | nodes walked | summed per-node COM-walk time |

For `java`/`dotnet-bridge`, `<walk>` is one `getChildren` RPC **per node**, so the
`count` ≈ tree node count and `totalMs` ≈ the wall-clock the walk spent blocked on the
round trip. That breakdown is the point: it makes the N+1 pattern measurable.

## Updating a baseline

`test/perf/baselines/<suite>.json` holds reference-machine p50 milliseconds keyed by
`<op>@<nodeCount>`. `checkRegressions()` fails a run only when a measured p50 exceeds
**3x** the baseline entry; ops absent from the map are recorded but not gated.

To (re)baseline: run the suite on a quiet machine, copy p50 values from the results
file into `baseline`, set `referenceMachine`, commit.

## Results log

`nodeCount=1500` (tree ≈ 1385 nodes). Reference machine: Intel Core 5 120U, 12 cores,
17GB, Windows 11. All figures p50 of 5 iterations after 1 warm-up.

### First baseline — 2026-09-03, sha `05df564` (pre-fix)

Fixtures now show every section at once (a first run against tabbed fixtures only
walked the selected tab, ~280 nodes). All three trees are ~1500–1740 nodes.

| suite | nodes | getPageSource p50 | findAll `//*` p50 | deep find p50 | walk count | walk time (per run) |
| --- | --- | --- | --- | --- | --- | --- |
| **uia** | 1738 | **8492ms** | 9063ms | 8047ms | 1738 nodes | ~8390ms |
| **java** | 1570 | 278ms | 882ms | 127ms | 1570 `getChildren` RPC | ~104ms |
| **dotnet-bridge** | 1452 | 207ms | 204ms | 191ms | 1452 `getChildren` RPC | ~93ms |

**The bottleneck is plain UIA, not the RPC bridges.** UIA `getPageSource` on a ~1740
node tree is **8.5 seconds** — ~4.8ms/node, and the per-node COM walk is ~99% of that.
Each node does ~20 `get_Current*` property reads + `CurrentBoundingRectangle` +
`FindAll(children)`, every one a cross-process COM round trip, with no caching and no
batching. Scale to ~4000 nodes and you are at ~20s. **This is very likely what the
original report actually hit** (a large or mixed UIA tree), whether or not a Java app
also stalls on Nagle somewhere.

The two RPC bridges are ~40x faster here: ≈1 `getChildren` per node (N+1 confirmed) but
~0.065ms per round trip — **no Nagle/delayed-ACK stall on this machine**. `dumpTree`
batching would still cut their round-trip count, but it is not the pressing problem.

Also: every XPath find (`find-anchorLast`) materialises the whole tree first, so it
costs the same as `getPageSource` in each suite — for UIA that means an 8s single-element
find.

### uia — plain UIA

Fixture switched from `winforms-large` (MSAA→UIA bridge — measured the bridge, not the
protocol) to `wpf-large` (WPF's native UIA provider). nodeCount=1500 → ~3036 UIA nodes.

Current, `wpf-large` @ sha `9645bd8` (per-level cache request in place):

| op | getPageSource p50 | findAll `//*` | deep find | getAttribute x50 | nodes |
| --- | --- | --- | --- | --- | --- |
| **wpf-large** | **4723ms** | 5979ms | 4472ms | 704ms | 3036 |

~1.5ms/node in the cached walk (3036 `uia.pageSource.node` COM calls ≈ 4.6s of the
4.7s). `getAttribute` x50 is element-scoped (live `GetCurrentPropertyValue`), no tree walk.

Historical, `winforms-large` (1744 nodes) — showed the per-level cache request win:

| Stage | getPageSource p50 | findAll `//*` | deep find | notes |
| --- | --- | --- | --- | --- |
| live (`UIA_NO_CACHE=1`) | 9987ms | 11160ms | 11623ms | ~25 cross-process COM property reads + one FindAll per node |
| + per-level cache request | 4982ms | 5858ms | 5061ms | **−50%** |

`FindAllBuildCache(TreeScope.Children, TrueCondition, req)` per node returns each child
with all ~25 properties already cached, so the property reads become in-process
`GetCachedPropertyValue`. Still one COM call per node for its children (~1744 total)
instead of one FindAll **plus** ~25 property calls (~45k total).

Tried and rejected: a single full-subtree cache request
(`BuildUpdatedCache` / `FindAllBuildCache(TreeScope.Subtree)`). On the WinForms provider
it was both **slower** (~16s — the provider struggles to satisfy a large property set
over a whole subtree) **and incomplete** (cached ~850 of 1744 nodes — offscreen
children not enumerated in a bulk request). The per-level approach matches exactly what
the live walk and native find see. `UIA_NO_CACHE=1` on the server env forces the live
path for A/B. 198 UIA e2e tests green (Calculator/Notepad page source, XPath, attributes).

### java — Java Swing agent

Default suite nodeCount raised to 12000 (~11.5k nodes, JTable-cell dominated) to push
the walk into the multi-second range.

| Stage | getPageSource p50 | findAll `//*` p50 | deep find p50 | `java.getChildren` | RPC wait | notes |
| --- | --- | --- | --- | --- | --- | --- |
| baseline, 1500 nodes | 278ms | 882ms | 127ms | 1570 | ~104ms | small tree |
| baseline, 12000 nodes | 1391ms | 6666ms | 985ms | 11472 | ~460ms | RPC wait is only ~1/3 of getPageSource |
| + delete `FindKey` (12000) | 1100ms | 7543ms | 677ms | 11472 | ~440ms | −21% / −31%; all saved on host CPU |
| **+ `dumpTree` RPC** (12000) | **834ms** | 7890ms | **414ms** | **2** | ~140ms | one RPC walks the whole subtree agent-side; 11472 `JsonDocument.Parse`/`Clone` → 1 |

**Cumulative: getPageSource 1391 → 834ms (−40%), deep XPath find 985 → 414ms (−58%).**
`rpcCalls` is now 2 (getWindowRoot + dumpTree) regardless of tree size — the walk is no
longer N-sensitive, so the machine-load amplification that likely caused the original
20s is gone. Measured while the reference machine was also playing video; still held.
97 `java-swing-form` e2e tests green (page-source content, XPath, virtual-cell
`TableRow`/`TableColumn`, `contains()` — all unchanged).

`findAll //*` stays ~7.9s: that is serialising 11,472 element handles over the
WebDriver HTTP response + wdio parsing them. Nothing server-side left to cut — it is
inherent to returning 11.5k elements in one call.

Falls back to the per-node `getChildren` walk if the agent jar predates `dumpTree`
(shouldn't happen — the jar ships with the driver). Same change still **pending for the
.NET bridge** (`BridgeAgentService`), which has the identical per-node structure.

At 11.5k nodes the **RPC round trips are not the dominant cost** (~460ms of a 1391ms
`getPageSource`). The rest is host-side. `FindKey` was the biggest single piece:
`GetString`→`FindKey` re-implemented case-insensitive lookup by `ToLowerInvariant()`-ing
every key on every call — on a dictionary already `StringComparer.OrdinalIgnoreCase` —
~20 lookups/node. **Deleted** (both `JavaAgentService` and `BridgeAgentService`, use
`info.TryGetValue` directly): −21% on `getPageSource`, −31% on deep find, no behaviour
change (33 server tests green).

Remaining host-side cost after that (~660ms of the 1100ms):
- `Call()` does `JsonDocument.Parse(response)` + `resultEl.Clone()` per `getChildren` — 11472 parses of ~20-child payloads. `dumpTree` collapses this to 1.
- `ParseInfo` allocates a fresh `Dictionary` + ~25 boxed entries per node.
- `XmlDocument` builds ~20 `SetAttribute` nodes per node (~230k `XmlAttribute` objects).

`findAll //*` at 6.7s is tree materialisation + XPath eval + serialising 11.5k element
handles back over the WebDriver HTTP response (wdio then parses them all) — the last
part is inherent to asking for 11.5k elements.

### dotnet-bridge — .NET bridge

Default suite nodeCount raised to 6000 (~5.7k nodes). Same N+1 as Java; `dumpTree`
added to **both** bridge agents — `BridgeServer.cs` (CoreCLR) and `BridgeAgent.cpp`
(.NET Framework, C++/CLI) — plus the host `BridgeAgentService` (mirrors the Java host
change). Falls back to the per-node walk if the injected bridge predates `dumpTree`
(set `BRIDGE_NO_DUMPTREE=1` on the server env to force the fallback for A/B runs).

| Stage | getPageSource p50 | findAll `//*` | deep find | `getChildren` RPC | RPC wait | notes |
| --- | --- | --- | --- | --- | --- | --- |
| baseline, 1500 nodes | 202ms | 185ms | 169ms | 1453 | ~108ms | small tree |
| baseline, 6000 nodes (`BRIDGE_NO_DUMPTREE=1`) | 873ms | 600ms | 535ms | 5728 | ~630ms | |
| **+ `dumpTree`** (6000) | **502ms** | 457ms | 388ms | **2** | ~270ms | −42% getPageSource; RPC calls flat vs tree size |

`rpcCalls` is 2 (getWindowRoot + dumpTree) regardless of tree size. Most of the saving
is the RPC wait (5728 round trips → one ~large response); the one big `JsonDocument.Parse`
costs about what 5728 small ones did, so host CPU is roughly flat — the point is the walk
is no longer N-sensitive, same as Java. 37 bridge e2e tests green (CoreCLR + Framework +
32-bit + WPF paths). The 32-bit path exercised the fallback (its x86 DLL was rebuilt
after).

Original hypothesis (still unconfirmed on the reference machine): a Java `getPageSource`
was ~20s because each of ~N accessible nodes costs one synchronous newline-JSON round
trip to the in-process agent, and neither socket disables Nagle — so every round trip
can stall on the ~200ms delayed-ACK timer. Not reproduced here (~0.065ms/RPC). The
`uia` result above is the more likely explanation for the original slowness.
