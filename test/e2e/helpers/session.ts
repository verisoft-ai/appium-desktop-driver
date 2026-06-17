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

export const EXPLORER_APP_PATH = 'C:\\Windows\\explorer.exe';

export async function createExplorerSession(extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'DesktopDriver',
            'appium:app': EXPLORER_APP_PATH,
            ...extraCaps,
        } as Caps,
    });
    await driver.setTimeout({ implicit: 3000 });
    return driver;
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
