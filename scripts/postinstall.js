/**
 * Postinstall hook for appium-desktop-driver.
 *
 * When end users install the published npm package, the prebuilt
 * `native/win-x64/DesktopDriverServer.exe` is already bundled —
 * no native build is needed, and users do not need the .NET SDK.
 *
 * When developers install from a git checkout (no prebuilt exe),
 * this script invokes `npm run build:native` to produce the exe,
 * which requires the .NET 10 SDK.
 */

const {existsSync} = require('node:fs');
const {join} = require('node:path');
const {execSync} = require('node:child_process');

function checkX86BridgeSupport() {
  // 32-bit .NET Framework target support is a bonus capability, not a hard requirement — the
  // driver and the 64-bit .NET bridge path both work fully without it. Missing x86 artifacts
  // should only mean "windows: attachDotnetBridge" against a 32-bit process fails later with
  // its own clear error (see BridgeInjector.DetectBitness), never block install.
  const x86Dll = join(__dirname, '..', 'native', 'win-x86', 'appium-dotnet-bridge.dll');
  const x86Stub = join(__dirname, '..', 'native', 'win-x86', 'BridgeInjectorX86Stub.exe');
  if (!existsSync(x86Dll) || !existsSync(x86Stub)) {
    console.warn(
      '[postinstall] native/win-x86/ bridge artifacts not found — attaching the .NET bridge ' +
        'to a 32-bit target process will not work until `npm run build:dotnet-bridge && ' +
        'npm run build:dotnet-bridge-x86-stub` are run. 64-bit targets are unaffected.',
    );
  }
}

const prebuiltExe = join(__dirname, '..', 'native', 'win-x64', 'DesktopDriverServer.exe');

if (existsSync(prebuiltExe)) {
  console.log('[postinstall] Prebuilt DesktopDriverServer.exe found — skipping native build.');
  checkX86BridgeSupport();
  process.exit(0);
}

if (process.platform !== 'win32') {
  // The driver only runs on Windows. If installed on another platform
  // (e.g., a CI lint job on Ubuntu), don't try to build the exe —
  // just let the install complete.
  console.log('[postinstall] Non-Windows platform detected — skipping native build.');
  process.exit(0);
}

console.log('[postinstall] No prebuilt exe found — building native server (requires .NET 10 SDK)...');

try {
  execSync('npm run build:native', {stdio: 'inherit'});
} catch {
  console.error('[postinstall] Native build failed. Install the .NET 10 SDK and run `npm run build:native` manually.');
  process.exit(1);
}

checkX86BridgeSupport();
