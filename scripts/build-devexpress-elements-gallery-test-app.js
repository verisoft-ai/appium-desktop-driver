// Builds the DevExpress-specific elements fixture (test-apps/devexpress-elements-gallery/) used
// by test/e2e/dotnet-bridge-devexpress-elements.e2e.ts. Same DevExpress license setup as
// build-devexpress-test-app.js — see that file's header and the feedback_devexpress_licensing
// memory for the DevExpress_License / DevExpress_LicensePath env vars.
//
// Hosts 4 real DevExpress-specific control shapes (TreeList, ComboBoxEdit, TokenEdit, a grouped
// GridControl), each confirmed genuinely UIA-blind via a throwaway probe before being added here.
// Two other DevExpress-specific candidates (BarManager/PopupMenu, SchedulerControl) were probed
// and dropped — both turned out to already be UIA-visible.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PROJECT_DIR = path.resolve(__dirname, '..', 'test-apps', 'devexpress-elements-gallery');
const PROJECT_FILE = path.join(PROJECT_DIR, 'DevExpressElementsGallery.csproj');
const OUT_DIR = path.join(PROJECT_DIR, 'bin');

function run(cmd, args, options = {}) {
    console.log(`> ${cmd} ${args.join(' ')}`);
    execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

function main() {
    // x64 to match the native bridge DLL's bitness — same reasoning as build-devexpress-test-app.js.
    run('dotnet', ['restore', PROJECT_FILE, '-p:Platform=x64']);
    run('dotnet', [
        'build', PROJECT_FILE,
        '-c', 'Release',
        '-p:Platform=x64',
        '-o', OUT_DIR,
    ]);

    console.log(`Built DevExpress elements gallery fixture -> ${OUT_DIR}`);
}

main();
