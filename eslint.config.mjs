// @ts-check

import { defineConfig } from 'eslint/config';
import globals from 'globals';
import appiumConfig from '@appium/eslint-config-appium-ts';


export default defineConfig(
  ...appiumConfig,
  {
    files: ['test/e2e/**/*.ts'],
  },
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['docs/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    rules: {
      'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/'] }],
    },
  },
);
