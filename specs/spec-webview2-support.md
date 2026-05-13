# Spec: WebView2 / Hybrid App Support

## Goal

Enable automating Windows apps that embed a WebView2 (Chromium) panel alongside native UIA elements. Without this, any content rendered inside WebView2 is inaccessible — no element finding, no JS execution.

## How It Works

1. Before launching the app, the driver sets env var `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` in the **server process's** env (not `process.env` directly — see session startup). The C# server inherits this env and any app it spawns inherits it in turn, so WebView2 inside the app exposes a CDP endpoint.
2. After the app starts, the driver queries `http://localhost:<port>/json/version` (for browser/Edge version string) and `http://localhost:<port>/json/list` (for page list).
3. The `appium-chromedriver` npm package manages downloading, version matching, and running Chromedriver or EdgeDriver.
4. `setContext("WEBVIEW_<pageId>")` activates Appium's built-in proxy: sets `this.jwpProxyActive = true`, binds `this.proxyReqRes` and `this.proxyCommand` to the Chromedriver instance. From that point all WebDriver HTTP requests are forwarded to Chromedriver instead of the UIA handler.
5. `setContext("NATIVE_APP")` stops Chromedriver and reverts the proxy flags.

---

## New Capabilities

Add to `lib/constraints.ts` using the same `Constraints` pattern as existing fields:

```ts
webviewEnabled: {
    isBoolean: true,
},
webviewDevtoolsPort: {
    isNumber: true,
},
chromedriverCdnUrl: {
    isString: true,
},
edgedriverCdnUrl: {
    isString: true,
},
chromedriverExecutablePath: {
    isString: true,
},
edgedriverExecutablePath: {
    isString: true,
},
```

Export type alias `DesktopDriverConstraints` (renaming from `NovaWindowsDriverConstraints`).

| Capability | Type | Default | Description |
|---|---|---|---|
| `webviewEnabled` | boolean | `false` | Enable WebView2 support. Must be `true` for any context command to work. |
| `webviewDevtoolsPort` | number | auto-select free port 10900–11000 | CDP port. If omitted the driver picks a free port in that range and passes it via env var. If `app` is `none`/`root`/uses `appTopLevelWindow`, this cap is **required** — the driver cannot set the env var after the fact for a pre-running app. |
| `chromedriverExecutablePath` | string | — | Absolute path to local `chromedriver.exe`. Skips all download logic. Must match the app's WebView/Chrome version exactly. |
| `edgedriverExecutablePath` | string | — | Absolute path to local `msedgedriver.exe`. Skips all download logic. |
| `chromedriverCdnUrl` | string | `https://storage.googleapis.com/chrome-for-testing-public` | Base CDN URL for ChromeDriver download. |
| `edgedriverCdnUrl` | string | `https://msedgedriver.microsoft.com` | Base CDN URL for EdgeDriver download. |

---

## New Driver State Fields

Add to `lib/driver.ts` class body (alongside existing fields):

```ts
chromedriver: Chromedriver | null = null;
proxyReqRes: ((...args: any) => any) | null = null;
proxyCommand: ExternalDriver['proxyCommand'] | null = null;
contexts: string[] = [];
jwpProxyActive: boolean = false;
currentContext: string | null = null;
webviewDevtoolsPort: number | null = null;
```

Import `Chromedriver` from `appium-chromedriver` (type import only in driver.ts).

---

## Override Methods on `AppiumDesktopDriver`

Add these overrides to `lib/driver.ts` (exact same as novawindows — needed for proxy routing):

```ts
override canProxy(): boolean {
    return true;
}

override proxyActive(): boolean {
    return this.jwpProxyActive;
}

override getProxyAvoidList(): RouteMatcher[] {
    return this.jwpProxyActive && this.chromedriver ? CHROMEDRIVER_NO_PROXY : [];
}
```

Add `CHROMEDRIVER_NO_PROXY` constant to `lib/driver.ts`:

```ts
const CHROMEDRIVER_NO_PROXY: RouteMatcher[] = [
    ['GET', new RegExp('^/session/[^/]+/appium')],
    ['GET', new RegExp('^/session/[^/]+/context')],
    ['GET', new RegExp('^/session/[^/]+/element/[^/]+/rect')],
    ['GET', new RegExp('^/session/[^/]+/orientation')],
    ['POST', new RegExp('^/session/[^/]+/appium')],
    ['POST', new RegExp('^/session/[^/]+/context')],
    ['POST', new RegExp('^/session/[^/]+/orientation')],
    // allows windows: and powerShell: executeScript commands to work in webview context
    ['POST', new RegExp('^/session/[^/]+/execute$')],
    ['POST', new RegExp('^/session/[^/]+/execute/sync')],
    // MJSONWP log routes
    ['GET', new RegExp('^/session/[^/]+/log/types$')],
    ['POST', new RegExp('^/session/[^/]+/log$')],
    // Selenium v4 W3C log routes
    ['GET', new RegExp('^/session/[^/]+/se/log/types$')],
    ['POST', new RegExp('^/session/[^/]+/se/log$')],
];
```

---

## New File: `lib/commands/contexts.ts`

All WebView2 logic lives in this single file. No separate `lib/webview/` directory.

### Imports

```ts
import { Chromedriver, ChromedriverOpts } from 'appium-chromedriver';
import { fs, node, system, tempDir, zip } from '@appium/support';
import path from 'node:path';
import { cdpRequest, downloadFile, sleep, MODULE_NAME } from '../util';
import { AppiumDesktopDriver } from '../driver';
import { errors } from '@appium/base-driver';
```

### Constants

```ts
const NATIVE_APP = 'NATIVE_APP';
const WEBVIEW = 'WEBVIEW';
const WEBVIEW_BASE = `${WEBVIEW}_`;
```

### Types

```ts
export interface WebViewDetails {
    info?: CDPVersionResponse;
    pages?: CDPListResponse;
}

interface CDPVersionResponse {
    'Browser': string;
    'Protocol-Version': string;
    'User-Agent': string;
    'V8-Version': string;
    'WebKit-Version': string;
    'webSocketDebuggerUrl': string;
}

interface CDPListResponseEntry {
    'description': string;
    'devtoolsFrontendUrl': string;
    'faviconUrl': string;
    'id': string;
    'title': string;
    'type': string;
    'url': string;
    'webSocketDebuggerUrl': string;
}

type CDPListResponse = CDPListResponseEntry[];
```

### `getCurrentContext`

```ts
export async function getCurrentContext(this: AppiumDesktopDriver): Promise<string> {
    return this.currentContext ??= NATIVE_APP;
}
```

### `getContexts`

Calls `getWebViewDetails()` every invocation (not cached). Context IDs are the page `id` from CDP `/json/list`, prefixed with `WEBVIEW_`:

```ts
export async function getContexts(this: AppiumDesktopDriver): Promise<string[]> {
    const webViewDetails = await this.getWebViewDetails();
    return [
        NATIVE_APP,
        ...(webViewDetails.pages?.map((page) => `${WEBVIEW_BASE}${page.id}`) ?? []),
    ];
}
```

### `setContext`

```ts
export async function setContext(this: AppiumDesktopDriver, name?: string | null): Promise<void> {
    if (!name || name === NATIVE_APP) {
        this.chromedriver?.stop();
        this.chromedriver = null;
        this.jwpProxyActive = false;
        this.proxyReqRes = null;
        this.proxyCommand = null;
        this.currentContext = NATIVE_APP;
        return;
    }

    const webViewDetails = await this.getWebViewDetails();

    // Validate the requested page ID exists
    if (!(webViewDetails.pages ?? []).map((page) => page.id).includes(name.replace(WEBVIEW_BASE, ''))) {
        throw new errors.InvalidArgumentError(`Web view not found: ${name}`);
    }

    // Parse browser type and version from CDP /json/version response
    const browser = webViewDetails.info?.Browser ?? '';
    const match = browser.match(/(Chrome|Edg)\/([\d.]+)/);
    if (!match?.[1] || (match[1] !== 'Edg' && match[1] !== 'Chrome')) {
        throw new errors.InvalidArgumentError(`Unsupported browser type: ${match?.[1]}`);
    }
    const browserType = match[1] === 'Edg' ? 'Edge' : 'Chrome';
    const browserVersion = match?.[2] ?? '';

    // Version must match pattern N.N.N.N
    if (!/^\d+(\.\d+){3}$/.test(browserVersion)) {
        throw new errors.InvalidArgumentError(`Invalid browser version: ${browserVersion}`);
    }

    const executable = await getDriverExecutable.call(this, browserType, browserVersion);

    const chromedriverOpts: ChromedriverOpts & { details?: WebViewDetails } = {
        executable,
        details: webViewDetails,
    };
    if (this.basePath) {
        chromedriverOpts.reqBasePath = this.basePath;
    }

    const cd = new Chromedriver(chromedriverOpts);
    this.chromedriver = cd;

    // Find the specific page and extract debugger address from webSocketDebuggerUrl
    const page = webViewDetails.pages?.find((p) => p.id === name.replace(WEBVIEW_BASE, ''));
    const debuggerAddress = (page?.webSocketDebuggerUrl ?? '')
        .replace('ws://', '')
        .split('/')[0];    // result: "localhost:10900"

    const options = { debuggerAddress };
    const caps = {
        'ms:edgeOptions': options,
        'goog:chromeOptions': options,
    };

    this.currentContext = name;
    await this.chromedriver.start(caps);

    // Wire up Appium's built-in proxy mechanism
    this.proxyReqRes = this.chromedriver.proxyReq.bind(this.chromedriver);
    this.proxyCommand = this.chromedriver.jwproxy.command.bind(this.chromedriver.jwproxy);
    this.jwpProxyActive = true;
}
```

### `getWebViewDetails`

```ts
export async function getWebViewDetails(
    this: AppiumDesktopDriver,
    waitForWebviewMs?: number
): Promise<WebViewDetails> {
    if (!this.caps.webviewEnabled) {
        throw new errors.InvalidArgumentError(
            'WebView support is not enabled. Set the "webviewEnabled" capability to true.'
        );
    }

    if (waitForWebviewMs) {
        await sleep(Number(waitForWebviewMs));
    }

    const host = 'localhost';

    // When not launching an app (none/root/appTopLevelWindow), the driver cannot
    // set the CDP port via env var, so the user must provide it explicitly.
    if (
        (this.caps.app === 'none' || this.caps.app === 'root' || this.caps.appTopLevelWindow != null)
        && this.caps.webviewDevtoolsPort == null
    ) {
        throw new errors.InvalidArgumentError(
            'Capability "webviewDevtoolsPort" must be set when using "none", "root", or "appTopLevelWindow" with "webviewEnabled".'
        );
    }

    const port = this.webviewDevtoolsPort ??= this.caps.webviewDevtoolsPort ?? null;

    // Both requests are fire-and-forget with .catch(() => undefined) — a missing
    // page list is valid (no webview open yet), not an error.
    const info = await (cdpRequest.call(this, { host, port, endpoint: '/json/version', timeout: 10000 }) as Promise<CDPVersionResponse>).catch(() => undefined);
    const pages = await (cdpRequest.call(this, { host, port, endpoint: '/json/list', timeout: 10000 }) as Promise<CDPListResponse>).catch(() => undefined);

    return { info, pages };
}
```

### `getDriverExecutable` (private function, not exported)

Caches driver binaries on disk at `<module-root>/chromedriver/<version>/chromedriver.exe` (or `edgedriver/<version>/msedgedriver.exe`). Downloads from CDN if not cached.

```ts
async function getDriverExecutable(
    this: AppiumDesktopDriver,
    browserType: 'Edge' | 'Chrome',
    browserVersion: string
): Promise<string> {
    const driverType = browserType === 'Chrome' ? 'chromedriver' : 'edgedriver';
    const fileName = browserType === 'Edge' ? 'msedgedriver.exe' : 'chromedriver.exe';

    // Locate module root using NODE_MODULE_PARENT / node.getModuleRootSync
    const root = node.getModuleRootSync(MODULE_NAME, __filename);
    if (!root) throw new errors.InvalidArgumentError(`Cannot find root folder of ${MODULE_NAME} module`);

    const driverDir = path.join(root, driverType);
    if (!(await fs.exists(driverDir))) await fs.mkdir(driverDir);

    // Check cache first: <root>/chromedriver/<version>/chromedriver.exe
    const finalPath = path.join(driverDir, browserVersion, fileName);
    if (await fs.exists(finalPath)) return finalPath;

    // Check capability override (local binary)
    const executablePath = browserType === 'Edge'
        ? this.caps.edgedriverExecutablePath
        : this.caps.chromedriverExecutablePath;
    if (executablePath) {
        if (!(await fs.exists(executablePath))) {
            throw new errors.InvalidArgumentError(`Driver executable not found at: ${executablePath}`);
        }
        return executablePath;
    }

    // Determine architecture for zip filename
    const arch = await system.arch();   // returns '32' or '64'
    const zipFilename = `${driverType}${browserType === 'Edge' ? '_' : '-'}win${arch}.zip`;

    // Build download URL
    const CHROME_BASE = this.caps.chromedriverCdnUrl || 'https://storage.googleapis.com/chrome-for-testing-public';
    const EDGE_BASE = this.caps.edgedriverCdnUrl || 'https://msedgedriver.microsoft.com';

    let downloadUrl: string;
    if (browserType === 'Chrome') {
        const url = new URL(CHROME_BASE);
        url.pathname = path.posix.join(url.pathname, browserVersion, `win${arch}`, zipFilename);
        downloadUrl = url.toString();
    } else {
        const url = new URL(EDGE_BASE);
        url.pathname = path.posix.join(url.pathname, browserVersion, zipFilename);
        downloadUrl = url.toString();
    }

    // Download zip to temp dir, extract, find exe, move to cache
    const tmpRoot = await tempDir.openDir();
    try {
        await downloadFile(downloadUrl, tmpRoot);
        await zip.extractAllTo(path.join(tmpRoot, zipFilename), tmpRoot);
        const driverPath = await fs.walkDir(
            tmpRoot,
            true,
            (itemPath, isDirectory) => !isDirectory && path.parse(itemPath).base.toLowerCase() === fileName
        );
        if (!driverPath) throw new errors.UnknownError(`Archive extracted but ${fileName} not found inside.`);
        await fs.mv(driverPath, finalPath, { mkdirp: true });
    } finally {
        await fs.rimraf(tmpRoot);
    }

    return finalPath;
}
```

---

## `lib/util.ts` — New Utilities

### `cdpRequest`

Uses Node's built-in `http` module (no `node-fetch`):

```ts
export async function cdpRequest<T = unknown>(
    this: AppiumDesktopDriver | undefined,
    { host, port, endpoint, timeout }: { host: string; port: number | null; endpoint: string; timeout: number }
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const options = {
            hostname: host,
            port,
            path: endpoint,
            method: 'GET',
            agent: new http.Agent({ keepAlive: false }),
            timeout,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (err) { reject(err); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.end();
    });
}
```

### `findFreePort`

Uses `net.createServer()` to test each port — does NOT use `net.connect`:

```ts
export async function findFreePort(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port++) {
        const free = await new Promise<boolean>((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => srv.close(() => resolve(true)));
            srv.listen(port);
        });
        if (free) return port;
    }
    throw new Error(`No free port available in range ${start}-${end}.`);
}
```

### `sleep`

```ts
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}
```

### `MODULE_NAME`

```ts
export const MODULE_NAME = 'appium-desktop-driver';
```

---

## `lib/commands/index.ts` — Add Mixin

```ts
import * as contexts from './contexts';
// Add to commands spread:
const commands = {
    ...contexts,
    // ... existing
};
```

---

## `mobile:getContexts` in `lib/commands/extension.ts`

Add handler:

```ts
case 'mobile:getContexts': {
    const params = args[0] ?? {};
    const details = await this.getWebViewDetails(params.waitForWebviewMs);
    const result: Array<{ id: string; title?: string; url?: string }> = [
        { id: 'NATIVE_APP' },
        ...(details.pages?.map((page) => ({
            id: `WEBVIEW_${page.id}`,
            title: page.title || undefined,
            url: page.url || undefined,
        })) ?? []),
    ];
    return result;
}
```

---

## `deleteSession` changes in `lib/driver.ts`

```ts
// Add at start of deleteSession, before existing cleanup:
if (this.chromedriver) {
    try { await this.chromedriver.stop(); } catch { /* noop */ }
    this.chromedriver = null;
}
```

---

## Dependency to Add

```json
"appium-chromedriver": "^8.2.21"
```

Add to `dependencies` in `package.json`. This package handles driver download, version matching, and process lifecycle.

---

## MCP Tools (`lib/mcp/tools/context.ts`)

New file:

```ts
// Tool: get_current_context
// Returns current context name string ("NATIVE_APP" or "WEBVIEW_<id>")

// Tool: get_contexts
// Returns array of context name strings

// Tool: set_context
// Parameters: { name: string }
// Switches active context
```

Register in `lib/mcp/tools/index.ts`.

---

## Tests

### Unit (`test/commands/contexts.test.ts`)

Mock `cdpRequest` (via vi.mock on `../util`). Mock `appium-chromedriver` Chromedriver class.

- `getWebViewDetails` throws `InvalidArgumentError` when `webviewEnabled` is false
- `getWebViewDetails` throws when app is `none`/`root`/`appTopLevelWindow` and `webviewDevtoolsPort` is not set
- `getWebViewDetails` returns `{ info: undefined, pages: undefined }` when CDP not reachable (catches errors)
- `getContexts` returns `['NATIVE_APP', 'WEBVIEW_<id1>', 'WEBVIEW_<id2>']` from page list
- `setContext('NATIVE_APP')` stops chromedriver, sets `jwpProxyActive = false`, clears proxyReqRes/proxyCommand
- `setContext('WEBVIEW_abc')` throws `InvalidArgumentError` when page `abc` not in page list
- `setContext('WEBVIEW_abc')` throws `InvalidArgumentError` for unsupported browser type
- `setContext` passes correct `debuggerAddress` extracted from `webSocketDebuggerUrl`
- `setContext` sets `jwpProxyActive = true` after start
- `getDriverExecutable` returns cached path if file exists
- `getDriverExecutable` returns `chromedriverExecutablePath` cap if set and file exists
- `getDriverExecutable` throws if `chromedriverExecutablePath` cap set but file missing
- `getDriverExecutable` builds correct Chrome CDN URL for win64
- `getDriverExecutable` builds correct Edge CDN URL

### E2E (`test/e2e/extension-webview.e2e.ts`)

Requires test app with embedded WebView2 and `webviewEnabled: true`.

1. `getContexts()` includes `WEBVIEW_*` entry
2. `getCurrentContext()` returns `'NATIVE_APP'` initially
3. `setContext('WEBVIEW_<id>')` — verify `getCurrentContext()` returns webview name
4. Find element by CSS selector inside webview
5. Execute JS: `return document.title`
6. `setContext('NATIVE_APP')` — verify `getCurrentContext()` returns `'NATIVE_APP'`
7. Find native UIA element after switching back

---

## Rollout Notes

- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` **must** be set in the env passed to the C# server **before** it launches the app. WebView2 reads this env var during process startup — setting it after the app is running has no effect. This is handled in `lib/commands/server-session.ts` (the C# server spec), not here.
- When `webviewEnabled: true` and no `webviewDevtoolsPort` cap, `findFreePort(10900, 11000)` is called in `startServerSession` to pick the port. The chosen port is stored in `this.webviewDevtoolsPort` before the app launches.
- `appium-chromedriver` must match the Edge/Chrome version bundled in the app. Mismatch causes session creation to fail with a clear error from Chromedriver.
- `getContexts()` and `getWebViewDetails()` do not cache — they query CDP live each call. If the app hasn't finished loading WebView2 yet, `pages` will be empty. Use `mobile:getContexts({ waitForWebviewMs: 3000 })` to wait.
- `setContext` stops any existing Chromedriver before starting a new one. Switching between two webviews creates two sequential Chromedriver sessions.
