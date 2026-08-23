import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxfmt';

export default defineConfig({
  ...appiumConfig,
  ignorePatterns: [
    ...ignorePatterns,
    // Non-JS native/tooling sources — oxfmt only formats JS/TS/JSON/CSS et al.,
    // and falls back to a prose formatter that corrupts anything else.
    'csharp/**',
    'dotnet-bridge-agent/**',
    'dotnet-bridge-agent-core/**',
    'dotnet-bridge-profiler/**',
    'java-agent/**',
    'iedriver/**',
    'iebridge/**',
    'native/**',
    'examples/**',
  ],
});
