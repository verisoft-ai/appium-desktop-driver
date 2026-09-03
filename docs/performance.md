# Performance benchmarks

Tracks the cost of the driver's expensive tree-walk paths so regressions are visible
and improvements are documented with numbers.

| suite | fixture | what it measures |
| --- | --- | --- |
| `java` | `java-swing-large` | in-JVM agent walk (newline-JSON RPC to the injected agent) |
| `dotnet-bridge` | `winforms-large` | .NET bridge reflected-tree walk (same RPC channel shape as Java) |

(A `uia` suite for the plain in-process UIA walk lives on a separate branch — see
`perf/uia-cache`.)

## Running

```bash
# Needs: the sibling fixture repo checked out next to this one and built
#   ../appium-wincore-test-apps  ->  npm run build:java-swing-large-test-app
#                                    npm run build:winforms-large-test-app
# plus a running Appium server with this driver installed.
npm run test:perf                     # all suites
npx vitest run --config vitest.perf.config.ts test/perf/java-pagesource.perf.ts   # one suite
```

Knobs (env): `PERF_NODE_COUNT` overrides the fixture size (each suite has its own
default — java 12000, dotnet-bridge 6000); `TEST_APPS_DIR` points at the fixture repo
(default `../appium-wincore-test-apps`).

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

Labels are `java.<rpcCommand>` / `dotnetBridge.<rpcCommand>` (e.g. `java.getChildren`) —
`count` is RPCs of that kind, `totalMs` is wall-clock spent waiting on the agent. Before
`dumpTree` the walk was one `getChildren` RPC **per node**, so `count` ≈ node count.

## Updating a baseline

`test/perf/baselines/<suite>.json` holds reference-machine p50 milliseconds keyed by
`<op>@<nodeCount>`. `checkRegressions()` fails a run only when a measured p50 exceeds
**3x** the baseline entry; ops absent from the map are recorded but not gated.

## Results log

Reference machine: Intel Core 5 120U, 12 cores, 17GB, Windows 11. p50 of 5 iterations
after 1 warm-up.

### java — Java Swing agent

Default suite nodeCount 12000 (~11.5k nodes, JTable-cell dominated) to push the walk
into the multi-second range.

| Stage | getPageSource p50 | findAll `//*` p50 | deep find p50 | `java.getChildren` | RPC wait | notes |
| --- | --- | --- | --- | --- | --- | --- |
| baseline, 1500 nodes | 278ms | 882ms | 127ms | 1570 | ~104ms | small tree |
| baseline, 12000 nodes | 1391ms | 6666ms | 985ms | 11472 | ~460ms | RPC wait is only ~1/3 of getPageSource |
| + delete `FindKey` (12000) | 1100ms | 7543ms | 677ms | 11472 | ~440ms | −21% / −31%; all saved on host CPU |
| **+ `dumpTree` RPC** (12000) | **834ms** | 7890ms | **414ms** | **2** | ~140ms | one RPC walks the whole subtree agent-side; 11472 `JsonDocument.Parse`/`Clone` → 1 |

**Cumulative: getPageSource 1391 → 834ms (−40%), deep XPath find 985 → 414ms (−58%).**
`rpcCalls` is now 2 (getWindowRoot + dumpTree) regardless of tree size — the walk is no
longer N-sensitive, so the machine-load amplification that likely caused the original
20s report is gone. 97 `java-swing-form` e2e tests green (page-source content, XPath,
virtual-cell `TableRow`/`TableColumn`, `contains()` — all unchanged).

Why `FindKey` mattered: `GetString`→`FindKey` re-implemented case-insensitive lookup by
`ToLowerInvariant()`-ing every dict key on every call — on a dictionary already
`StringComparer.OrdinalIgnoreCase` — ~20 lookups/node. Deleted in both `JavaAgentService`
and `BridgeAgentService`; use `info.TryGetValue` directly.

`findAll //*` stays ~7.9s: serialising 11,472 element handles over the WebDriver HTTP
response + wdio parsing them. Inherent to returning 11.5k elements in one call.

Falls back to the per-node `getChildren` walk if the agent jar predates `dumpTree`
(shouldn't happen — the jar ships with the driver).

### dotnet-bridge — .NET bridge

Default suite nodeCount 6000 (~5.7k nodes). Same N+1 as Java; `dumpTree` added to
**both** bridge agents — `BridgeServer.cs` (CoreCLR) and `BridgeAgent.cpp` (.NET
Framework, C++/CLI) — plus the host `BridgeAgentService` (mirrors the Java host change).
`BRIDGE_NO_DUMPTREE=1` on the server env forces the fallback for A/B runs.

| Stage | getPageSource p50 | findAll `//*` | deep find | `getChildren` RPC | RPC wait | notes |
| --- | --- | --- | --- | --- | --- | --- |
| baseline, 1500 nodes | 202ms | 185ms | 169ms | 1453 | ~108ms | small tree |
| baseline, 6000 nodes (`BRIDGE_NO_DUMPTREE=1`) | 873ms | 600ms | 535ms | 5728 | ~630ms | |
| **+ `dumpTree`** (6000) | **502ms** | 457ms | 388ms | **2** | ~270ms | −42% getPageSource; RPC calls flat vs tree size |

`rpcCalls` is 2 regardless of tree size. Most of the saving is the RPC wait (5728 round
trips → one large response); the one big `JsonDocument.Parse` costs about what 5728
small ones did, so host CPU is roughly flat — the point is the walk is no longer
N-sensitive. 37 bridge e2e tests green (CoreCLR + Framework + 32-bit + WPF).

### On the original ~20s report

Unconfirmed on the reference machine — a normal-size Java tree came back at ~280ms, no
Nagle/delayed-ACK stall (~0.065ms/RPC here). Most plausible: the N+1 design amplified by
an oversubscribed CPU (each RPC = two thread wake-ups; µs when idle, ms under load), so
`1570 RPC × loaded-scheduler-latency` reaches seconds. `dumpTree` removes that
N-sensitivity outright — 2 RPCs regardless of tree size or machine load.
