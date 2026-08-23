import appiumConfig, {defineConfig, ignorePatterns} from '@appium/oxc-config/oxlint';

export default defineConfig({
  extends: [appiumConfig],
  ignorePatterns: [
    ...ignorePatterns,
    // Non-JS native/tooling sources
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
  overrides: [
    {
      files: ['scripts/**/*.js'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['docs/**/*.js'],
      env: {
        browser: true,
      },
    },
  ],
});
