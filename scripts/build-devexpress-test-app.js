// Builds the bespoke DevExpress WinForms grid fixture (test-apps/devexpress-grid-ownerdraw/) used
// by test/e2e/dotnet-bridge-attach.e2e.ts. Checked into this repo as source (unlike other test
// fixtures elsewhere in this file's git history) rather than cloned from a DevExpress-Examples
// repo — two cloned examples (a WPF TreeList, then a WinForms XtraTreeList) both turned out to
// already be visible to plain UIA via DevExpress's own AccessibleObject support, which defeats the
// purpose of a fixture meant to prove the bridge does something. This fixture's "Status" column is
// deliberately unbound and rendered entirely inside GridView.CustomDrawCell — its real text
// (Healthy/Degraded/Offline) never enters DevExpress's normal cell-value pipeline, so nothing
// exposes it via Name, the Value pattern, or HelpText. Confirmed empirically: plain UIA only sees
// a generic "Status row N" placeholder for that column.
//
// Requires the DevExpress_License env var to be set to your license key text (a free 30-day
// trial key is enough — see Client Center > Downloads > your license key string, after
// https://docs.devexpress.com/GeneralInformation/405494/trial-register/set-up-your-dev-express-license-key).
// DevExpress_License / DevExpress_LicensePath are their own documented env var names (exact
// casing matters) — not a repo-specific convention. Without one set, the build still succeeds
// (DevExpress emits a DX1000 evaluation-watermark warning, not a hard failure) since this is a
// bespoke fixture, not a redistributed DevExpress example — but the running app pops an "About
// DevExpress" trial nag dialog on launch that test/e2e/helpers/session.ts's launcher must dismiss.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PROJECT_DIR = path.resolve(__dirname, '..', 'test-apps', 'devexpress-grid-ownerdraw');
const PROJECT_FILE = path.join(PROJECT_DIR, 'DevExpressGridOwnerDraw.csproj');
const OUT_DIR = path.join(PROJECT_DIR, 'bin');

function run(cmd, args, options = {}) {
    console.log(`> ${cmd} ${args.join(' ')}`);
    execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

function main() {
    // Built as x64 (not the default AnyCPU-without-Prefer32Bit outcome left implicit) to match
    // the native bridge DLL's bitness — dotnet-bridge-agent/ only builds for x64, and
    // LoadLibraryW cannot load a 64-bit DLL into a 32-bit process.
    run('dotnet', ['restore', PROJECT_FILE, '-p:Platform=x64']);
    run('dotnet', [
        'build', PROJECT_FILE,
        '-c', 'Release',
        '-p:Platform=x64',
        '-o', OUT_DIR,
    ]);

    console.log(`Built DevExpress grid owner-draw fixture -> ${OUT_DIR}`);
}

main();
