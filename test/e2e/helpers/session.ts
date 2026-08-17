import { execSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';

export const APPIUM_SERVER = {
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
};

export const CALCULATOR_APP_ID = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
export const NOTEPAD_APP_PATH = 'C:\\Windows\\notepad.exe';
export const TODO_APP_ID = 'Microsoft.Todos_8wekyb3d8bbwe!App';
export const CHROME_APP_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export const CHROME_DEBUG_PORT = 9222;
export const EDGE_APP_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

type Caps = WebdriverIO.Capabilities;

export async function createCalculatorSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': CALCULATOR_APP_ID,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 1500 });
    return driver;
}

export async function createNotepadSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': NOTEPAD_APP_PATH,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 1500 });
    return driver;
}

export async function createTodoSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': TODO_APP_ID,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 1500 });
    return driver;
}

export async function createRootSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': 'Root',
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 1500 });
    return driver;
}

export async function createChromeWebviewSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const port = (extraCaps?.['appium:webviewDevtoolsPort'] as number) ?? CHROME_DEBUG_PORT;
    const userDataDir = join(tmpdir(), `chrome-test-${port}`);
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': CHROME_APP_PATH,
            'appium:appArguments': `--remote-debugging-port=${port} --user-data-dir=${userDataDir} --no-first-run --no-default-browser-check https://example.com`,
            'appium:webviewEnabled': true,
            'appium:webviewDevtoolsPort': port,
            'appium:shouldCloseApp': true,
            'appium:ms:waitForAppLaunch': 3,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 5000 });
    return driver;
}

export async function createEdgeIEModeSession(url: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const userDataDir = join(tmpdir(), `edge-ie-mode-test-${Date.now()}`);
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': EDGE_APP_PATH,
            'appium:appArguments': `--no-first-run --no-default-browser-check --no-signin-prompt --disable-sync --user-data-dir=${userDataDir} ${url}`,
            'appium:ms:waitForAppLaunch': 8,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

export const IE_APP_PATH = 'C:\\Program Files\\Internet Explorer\\iexplore.exe';

export async function createIEBridgeSession(url: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': IE_APP_PATH,
            'appium:appArguments': url,
            'appium:shouldCloseApp': true,
            ...extraCaps,
        } as Caps,
    });
    await driver.pause(3000);
    await driver.setTimeout({ implicit: 5000 });
    return driver;
}

export async function createIEBridgeAttachSession(hwnd: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:appTopLevelWindow': hwnd,
            'appium:shouldCloseApp': false,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 5000 });
    return driver;
}

/**
 * Launches IE externally and returns the IEFrame HWND (decimal string).
 *
 * IE 11's multi-process model creates the IEFrame window under a child process,
 * not the spawned PID, so the driver's PID-based window search fails. We poll
 * all iexplore processes for a non-zero MainWindowHandle instead.
 */
export async function launchIEExternally(url: string): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(IE_APP_PATH, [url], { detached: true, stdio: 'ignore' });
    proc.unref();

    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            // The IEFrame (browser chrome) process is always the oldest iexplore.exe.
            // Tab/content processes start after it, so sorting ascending picks the frame.
            const out = execSync(
                'powershell -Command "$p = Get-Process -Name iexplore -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime | Select-Object -First 1; if ($p) { $p.MainWindowHandle } else { 0 }"',
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
            if (out && out !== '0') { hwnd = out; break; }
        } catch {
            // not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error('IE window (IEFrame) did not appear within 15s');
    }

    return { proc, hwnd };
}

export async function createIEProxySession(url: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const { hwnd } = await launchIEExternally(url);

    // Attach via appTopLevelWindow — the driver detects IEFrame class and enables
    // the IE proxy without needing to find the window by the spawned PID.
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:appTopLevelWindow': hwnd,
            'appium:shouldCloseApp': true,
            ...extraCaps,
        } as Caps,
    });
    // Proxy is active; navigate to the target URL via IEDriverServer
    await driver.url(url);
    await driver.pause(3000);
    await driver.setTimeout({ implicit: 5000 });
    return driver;
}

export const EXPLORER_APP_PATH = 'C:\\Windows\\explorer.exe';
export const CHARMAP_APP_PATH = 'C:\\Windows\\System32\\charmap.exe';
export const WINFORM_COMBO_APP_PATH = resolve(process.cwd(), 'test-apps', 'winform-combo', 'bin', 'WinformCombo.exe');

async function createSimpleAppSession(appPath: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': appPath,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

export async function createCharmapSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    return createSimpleAppSession(CHARMAP_APP_PATH, extraCaps);
}

export async function createWinformComboSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    return createSimpleAppSession(WINFORM_COMBO_APP_PATH, extraCaps);
}

export async function createExplorerSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    return createSimpleAppSession(EXPLORER_APP_PATH, extraCaps);
}

export const JAVAW_EXE_PATH = process.env.JAVA_HOME
    ? `${process.env.JAVA_HOME}\\bin\\javaw.exe`
    : 'C:\\Program Files\\Java\\jre1.8.0_491\\bin\\javaw.exe';
export const JAVA_SWING_FORM_CLASSPATH = resolve(process.cwd(), 'test-apps', 'java-swing-form');

/**
 * Launches the Java Swing test form as an external process (without Appium agent injection).
 * Returns the child process and its main window handle (decimal HWND string).
 * The caller is responsible for killing the process in afterAll.
 */
export async function launchJavaSwingFormExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const args = ['-cp', JAVA_SWING_FORM_CLASSPATH, 'TestForm'];
    const proc = spawn(JAVAW_EXE_PATH, args, { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn Java process: ${JAVAW_EXE_PATH}`);
    }

    // Poll for MainWindowHandle to appear (window may take a moment to open)
    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`Java Swing form window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export async function createJavaSwingAttachSession(hwnd: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:appTopLevelWindow': hwnd,
            'appium:javaSwing': true,
            'appium:shouldCloseApp': false,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

export async function createJavaSwingFormSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': JAVAW_EXE_PATH,
            'appium:appArguments': `-cp ${JAVA_SWING_FORM_CLASSPATH} TestForm`,
            'appium:javaSwing': true,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

export const DEVEXPRESS_GRID_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'devexpress-grid-ownerdraw', 'bin', 'DevExpressGridOwnerDraw.exe'
);
export const DEVEXPRESS_GRID_WINDOW_TITLE = 'DevExpress Grid OwnerDraw Fixture';

/**
 * Launches the bespoke DevExpress WinForms grid test app as an external process (simulating a
 * customer's app the driver has no launch control over). Returns the child process and its main
 * window handle (decimal HWND string) for the fixture's actual window — not the "About
 * DevExpress" trial-evaluation dialog every launch pops first (this fixture has no registered
 * WinForms-tier license, only the WPF-tier trial key set up earlier in this project — see
 * feedback_devexpress_licensing memory). The caller is responsible for killing the process in
 * afterAll.
 */
export async function launchDevExpressGridExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(DEVEXPRESS_GRID_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn DevExpress grid app: ${DEVEXPRESS_GRID_APP_PATH}`);
    }

    const pid = proc.pid;

    async function pollMainWindow(): Promise<{ hwnd: string; title: string }> {
        const out = execSync(
            `powershell -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
            `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output $p.MainWindowHandle; Write-Output $p.MainWindowTitle } else { Write-Output '0' }"`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().trim().split(/\r?\n/);
        return { hwnd: out[0] ?? '0', title: out[1] ?? '' };
    }

    // First window to appear is the "About DevExpress" trial nag — dismiss it with Escape so the
    // fixture's real window can come up. SendKeys targets the foreground window, which is this
    // freshly-launched dialog.
    let dismissed = false;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        const { hwnd: currentHwnd, title } = await pollMainWindow();
        if (currentHwnd !== '0' && title === DEVEXPRESS_GRID_WINDOW_TITLE) {
            hwnd = currentHwnd;
            break;
        }
        if (currentHwnd !== '0' && !dismissed) {
            execSync(
                'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{ESC}\')"',
                { stdio: 'ignore' }
            );
            dismissed = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`DevExpress grid app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const MINIMAL_OWNERDRAW_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'minimal-ownerdraw-winforms', 'bin', 'x64', 'Debug', 'net472', 'MinimalOwnerDraw.exe'
);
export const MINIMAL_OWNERDRAW_WINDOW_TITLE = 'Minimal OwnerDraw Fixture';

/**
 * Launches the minimal owner-draw WinForms fixture externally (simulating a customer's app the
 * driver has no launch control over). No DevExpress dependency, no trial dialog to dismiss —
 * a single Control subclass that paints its own text and blanks AccessibleName, so plain UIA
 * can't see the value at all. The caller is responsible for killing the process in afterAll.
 */
export async function launchMinimalOwnerDrawExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(MINIMAL_OWNERDRAW_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn minimal owner-draw app: ${MINIMAL_OWNERDRAW_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`Minimal owner-draw app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const MINIMAL_OWNERDRAW_X86_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'minimal-ownerdraw-x86', 'bin', 'x86', 'Debug', 'net472', 'MinimalOwnerDrawX86.exe'
);

/**
 * Launches the 32-bit twin of the minimal owner-draw fixture (see
 * launchMinimalOwnerDrawExternally) — same pattern, but built PlatformTarget=x86 so it's a
 * genuine WOW64 process. Exists solely to exercise the bridge's x86 injection path
 * (BridgeInjectorX86Stub) end to end: a 64-bit host can't CreateRemoteThread into this process
 * directly, so attachDotnetBridge here only works if bitness detection + the x86 stub dispatch
 * are both wired correctly. The caller is responsible for killing the process in afterAll.
 */
export async function launchMinimalOwnerDrawX86Externally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(MINIMAL_OWNERDRAW_X86_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn 32-bit minimal owner-draw app: ${MINIMAL_OWNERDRAW_X86_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`32-bit minimal owner-draw app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

/**
 * Confirms a process is genuinely 32-bit (running under WOW64) — a sanity check so the 32-bit
 * bridge e2e test can't silently pass against an accidentally-64-bit build of the fixture.
 */
export function isProcess32Bit(pid: number): boolean {
    const out = execSync(
        `powershell -Command "` +
        `Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\\"kernel32.dll\\")] public static extern bool IsWow64Process(IntPtr h, out bool w);'; ` +
        `$p = Get-Process -Id ${pid}; $w = $false; [W.K]::IsWow64Process($p.Handle, [ref]$w) | Out-Null; Write-Output $w` +
        `"`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return out === 'True';
}

export const OWNERDRAW_GALLERY_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'ownerdraw-gallery', 'bin', 'x64', 'Debug', 'net472', 'OwnerDrawGallery.exe'
);

/**
 * Launches the ownerdraw-gallery fixture externally (simulating a customer's app the driver has
 * no launch control over). No third-party dependency, no trial dialog to dismiss. See
 * test-apps/ownerdraw-gallery/Program.cs for the 5 element kinds it hosts.
 */
export async function launchOwnerDrawGalleryExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(OWNERDRAW_GALLERY_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn ownerdraw-gallery app: ${OWNERDRAW_GALLERY_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`ownerdraw-gallery app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const WPF_MINIMAL_APP_PATH = resolve(process.cwd(), 'test-apps', 'wpf-minimal', 'bin', 'WpfMinimal.exe');

/**
 * Launches the wpf-minimal fixture externally (no DevExpress dependency, no trial dialog).
 * See test-apps/wpf-minimal/Program.cs — a TextBox, Button, and an owner-drawn list following the
 * bridge's generic list convention, used to validate the WPF Dispatcher-marshaling fix.
 */
export async function launchWpfMinimalExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WPF_MINIMAL_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn wpf-minimal app: ${WPF_MINIMAL_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`wpf-minimal app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const NET8_WINFORMS_MINIMAL_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'net8-winforms-minimal', 'bin', 'Debug', 'net8.0-windows', 'Net8WinformsMinimal.exe'
);

/**
 * Launches the net8-winforms-minimal fixture externally — CoreCLR (.NET 8) twin of
 * wpf-minimal/winform-combo, exercising BridgeInjector's CoreCLR attach path (profiler attach via
 * CoreClrAttacher) instead of Win32 injection. See dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
 */
export async function launchNet8WinformsMinimalExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(NET8_WINFORMS_MINIMAL_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn net8-winforms-minimal app: ${NET8_WINFORMS_MINIMAL_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`net8-winforms-minimal app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const NET8_WINFORMS_MINIMAL_X86_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'net8-winforms-minimal', 'bin', 'Debug', 'net8.0-windows', 'win-x86', 'Net8WinformsMinimal.exe'
);

/**
 * 32-bit twin of launchNet8WinformsMinimalExternally — same fixture source, published with
 * `-r win-x86`, genuinely loading a 32-bit CoreCLR (confirmed via IsWow64Process). Exercises
 * BridgeInjector.InjectFromPidAutoBitness's CoreCLR branch picking the x86 profiler DLL and
 * CoreClrAttacher picking the x86-published bridge-core.dll.
 *
 * Requires an x86 .NET 8 Desktop Runtime installed (`winget install
 * Microsoft.DotNet.DesktopRuntime.8.x86`) — a 32-bit CoreCLR process needs its own
 * architecture-specific runtime, separate from the machine's normal x64 .NET install.
 */
export async function launchNet8WinformsMinimalX86Externally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(NET8_WINFORMS_MINIMAL_X86_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn net8-winforms-minimal (x86) app: ${NET8_WINFORMS_MINIMAL_X86_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`net8-winforms-minimal (x86) app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const WPF_DATAGRID_TEMPLATE_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'wpf-datagrid-template', 'bin', 'WpfDataGridTemplate.exe'
);

/**
 * Launches the wpf-datagrid-template fixture externally (no DevExpress dependency). See
 * test-apps/wpf-datagrid-template/Program.cs — a plain WPF DataGrid with two bound text columns
 * and one DataGridTemplateColumn whose cell content is owner-drawn (OnRender + null
 * AutomationPeer), genuinely invisible to plain UIA.
 */
export async function launchWpfDataGridTemplateExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WPF_DATAGRID_TEMPLATE_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn wpf-datagrid-template app: ${WPF_DATAGRID_TEMPLATE_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`wpf-datagrid-template app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH = resolve(
    process.cwd(), 'test-apps', 'devexpress-elements-gallery', 'bin', 'DevExpressElementsGallery.exe'
);
export const DEVEXPRESS_ELEMENTS_GALLERY_WINDOW_TITLE = 'DevExpress Elements Gallery';

/**
 * Launches the DevExpress-specific elements fixture externally (simulating a customer's app the
 * driver has no launch control over). Same trial-nag tolerance as launchDevExpressGridExternally
 * — an "About DevExpress" dialog pops inconsistently depending on build-cache state, so this polls
 * for the real window's title rather than assuming a dialog will or won't appear. See
 * test-apps/devexpress-elements-gallery/Program.cs for the 4 element kinds it hosts (TreeList,
 * ComboBoxEdit, TokenEdit, grouped GridControl) — each confirmed genuinely UIA-blind via a
 * throwaway probe before this fixture was written.
 */
export async function launchDevExpressElementsGalleryExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn devexpress-elements-gallery app: ${DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH}`);
    }

    const pid = proc.pid;

    async function pollMainWindow(): Promise<{ hwnd: string; title: string }> {
        const out = execSync(
            `powershell -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
            `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output $p.MainWindowHandle; Write-Output $p.MainWindowTitle } else { Write-Output '0' }"`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().trim().split(/\r?\n/);
        return { hwnd: out[0] ?? '0', title: out[1] ?? '' };
    }

    let dismissed = false;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        const { hwnd: currentHwnd, title } = await pollMainWindow();
        if (currentHwnd !== '0' && title === DEVEXPRESS_ELEMENTS_GALLERY_WINDOW_TITLE) {
            hwnd = currentHwnd;
            break;
        }
        if (currentHwnd !== '0' && !dismissed) {
            execSync(
                'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{ESC}\')"',
                { stdio: 'ignore' }
            );
            dismissed = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`devexpress-elements-gallery app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export async function createDotnetBridgeAttachSession(hwnd: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:appTopLevelWindow': hwnd,
            'appium:dotnetBridge': true,
            'appium:shouldCloseApp': false,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

/** Kill any Calculator, Notepad or To-Do processes left open by a previous test. */
export function closeAllTestApps(): void {
    for (const name of ['Calculator.exe', 'CalculatorApp.exe', 'notepad.exe', 'Microsoft.Todos.exe']) {
        try {
            execSync(`taskkill /F /IM "${name}"`, { stdio: 'ignore' });
        } catch {
            // process not running — ok
        }
    }
}

export async function quitSession(driver: Browser | null): Promise<void> {
    try {
        await driver?.deleteSession();
    } catch {
        // noop — session may already be terminated
    }
}

/** Click the Calculator clear button to reset the display to 0 */
export async function resetCalculator(driver: Browser): Promise<void> {
    const clearBtn = await driver.$('~clearButton');
    await clearBtn.click();
}

/** Returns the Notepad text area element (modern Win11 uses Document, classic Win10 uses Edit). */
export async function getNotepadTextArea(driver: Browser) {
    const el = driver.$('//Document');
    if (await el.isExisting()) {
        return el;
    }
    return driver.$('//Edit');
}

/** Clear all text in Notepad via Ctrl+A + Delete */
export async function clearNotepad(driver: Browser): Promise<void> {
    const textArea = await getNotepadTextArea(driver);
    await textArea.click();
    await driver.keys(['Control', 'a']);
    await driver.keys(['Delete']);
}


export async function createTodoTask(driver: Browser, content: string): Promise<void> {
    const textArea = await driver.$('//Custom/Group/Edit');
    await textArea.setValue(content);
    await driver.keys(['Enter']);
    await driver.pause(500);
}

export async function deleteTasks(driver: Browser): Promise<void> {
    const MAX_ITERATIONS = 10;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const tasks = await driver.$$('//Custom/Group/List/ListItem');
        if (await tasks.length === 0) {break;}

        const elementId: string = await tasks[0].elementId;

        // Right-click the first task to open the context menu
        await driver.executeScript('windows: click', [{
            elementId,
            button: 'right',
        }]);
        await driver.pause(500);

        // Navigate context menu with keyboard — avoids UIA traversal dismissing the popup
        await driver.keys(['Delete']);

        // Confirm the deletion in the popup dialog
        await driver.$('~PrimaryButton').click();
        await driver.pause(500);
    }
}
