import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Performance benchmarks. Opt-in: they only do anything when RUN_PERF=1 is set
// (each suite is describe.skipIf-gated), and they need a running Appium server with
// this driver plus the java-swing-large fixture built in the sibling
// appium-wincore-test-apps checkout. Run with `npm run test:perf`.
export default defineConfig({
    test: {
        globals: true,
        include: ['test/perf/**/*.perf.ts'],
        // Selecting this config is itself the opt-in; the RUN_PERF gate in the specs
        // then also guards against the perf files being picked up by another config.
        env: { RUN_PERF: '1' },
        testTimeout: 600_000,
        hookTimeout: 120_000,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'lib'),
        },
    },
});
