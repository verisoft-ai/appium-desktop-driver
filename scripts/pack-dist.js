#!/usr/bin/env node
const {execSync} = require('node:child_process');
const path = require('node:path');
const pkg = require('../package.json');

const outFile = path.resolve(__dirname, '..', `${pkg.name}-${pkg.version}.zip`);

execSync(
  `powershell -Command "Compress-Archive -Path 'build','node_modules','LICENSE','README.md','package.json' -DestinationPath '${outFile}' -Force"`,
  {stdio: 'inherit', cwd: path.resolve(__dirname, '..')},
);
