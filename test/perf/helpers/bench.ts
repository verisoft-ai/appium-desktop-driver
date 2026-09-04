import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { Browser } from 'webdriverio';

export interface OpResult {
    op: string;
    nodeCount: number;
    iterations: number;
    p50Ms: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
    /** RPC counters accumulated by the driver server during the timed loop (perfMetrics). */
    rpc?: {
        totalCalls: number;
        totalMs: number;
        byLabel: Record<string, { count: number; totalMs: number }>;
    };
}

const PERF_DIR = resolve(__dirname, '..');

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {return 0;}
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

interface PerfMetricsResponse {
    enabled: boolean;
    metrics: {
        totalCalls: number;
        totalMs: number;
        byLabel: Record<string, { count: number; totalMs: number }>;
    };
}

/**
 * Times `fn` `iterations` times (after one warm-up run), returns p50/p95 plus the
 * driver-side RPC counters captured across the timed loop only.
 */
export async function measure(
    driver: Browser,
    op: string,
    nodeCount: number,
    fn: () => Promise<unknown>,
    iterations = 5,
): Promise<OpResult> {
    await fn(); // warm-up — first call pays JIT / cache / first-touch costs

    await driver.executeScript('windows: resetPerfMetrics', []);

    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fn();
        samples.push(performance.now() - start);
    }

    // Counters accumulate across the whole timed loop; divide by iterations so the
    // recorded figures are per-operation (what one getPageSource costs), matching p50.
    let rpc: OpResult['rpc'];
    try {
        const pm = await driver.executeScript('windows: getPerfMetrics', []) as PerfMetricsResponse;
        if (pm?.enabled) {
            const byLabel: Record<string, { count: number; totalMs: number }> = {};
            for (const [k, v] of Object.entries(pm.metrics.byLabel)) {
                byLabel[k] = {
                    count: Math.round(v.count / iterations),
                    totalMs: Math.round((v.totalMs / iterations) * 10) / 10,
                };
            }
            rpc = {
                totalCalls: Math.round(pm.metrics.totalCalls / iterations),
                totalMs: Math.round((pm.metrics.totalMs / iterations) * 10) / 10,
                byLabel,
            };
        }
    } catch {
        // perfMetrics not enabled or command unavailable — record timing only
    }

    const sorted = [...samples].sort((a, b) => a - b);
    return {
        op,
        nodeCount,
        iterations,
        p50Ms: Math.round(percentile(sorted, 50)),
        p95Ms: Math.round(percentile(sorted, 95)),
        minMs: Math.round(sorted[0]),
        maxMs: Math.round(sorted[sorted.length - 1]),
        rpc,
    };
}

function gitSha(): string {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: PERF_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
    } catch {
        return 'nogit';
    }
}

/** Writes the run to test/perf/results/<suite>-<sha>-<timestamp>.json and returns its path. */
export function writeResults(suite: string, results: OpResult[]): string {
    const dir = join(PERF_DIR, 'results');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${suite}-${gitSha()}-${stamp}.json`);
    writeFileSync(file, JSON.stringify({ suite, sha: gitSha(), timestamp: new Date().toISOString(), results }, null, 2));
    return file;
}

/**
 * Common end-of-suite step: write the results file, print a table, and throw on a
 * gross regression vs the committed baseline. No-op when `results` is empty (suite skipped).
 */
export function finalizeRun(suite: string, results: OpResult[]): void {
    if (results.length === 0) {return;}

    const file = writeResults(suite, results);
    // eslint-disable-next-line no-console
    console.log(`\nperf results written to ${file}`);
    // eslint-disable-next-line no-console
    console.table(results.map((r) => ({
        op: r.op,
        nodes: r.nodeCount,
        p50ms: r.p50Ms,
        p95ms: r.p95Ms,
        rpcCalls: r.rpc?.totalCalls ?? '-',
        rpcWaitMs: r.rpc ? Math.round(r.rpc.totalMs) : '-',
    })));

    const regressions = checkRegressions(results, loadBaseline(suite));
    if (regressions.length > 0) {
        throw new Error(`Performance regression(s):\n  ${regressions.join('\n  ')}`);
    }
}

export interface Baseline {
    /** keyed by `${op}@${nodeCount}` -> p50Ms on the reference machine */
    [key: string]: number;
}

export function loadBaseline(suite: string): Baseline | null {
    try {
        const raw = readFileSync(join(PERF_DIR, 'baselines', `${suite}.json`), 'utf8');
        const parsed = JSON.parse(raw) as { baseline?: Baseline };
        return parsed.baseline && Object.keys(parsed.baseline).length > 0 ? parsed.baseline : null;
    } catch {
        return null;
    }
}

/**
 * Gross-regression guard. Machine noise makes tight thresholds useless, so this only
 * flags a result that is more than `factor`x its committed baseline. Returns a list of
 * human-readable regression messages (empty = pass). No baseline entry -> not checked.
 */
export function checkRegressions(results: OpResult[], baseline: Baseline | null, factor = 3): string[] {
    if (!baseline) {return [];}
    const problems: string[] = [];
    for (const r of results) {
        const key = `${r.op}@${r.nodeCount}`;
        const base = baseline[key];
        if (base == null) {continue;}
        if (r.p50Ms > base * factor) {
            problems.push(`${key}: p50 ${r.p50Ms}ms > ${factor}x baseline ${base}ms`);
        }
    }
    return problems;
}
