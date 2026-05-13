import { Chromedriver, ChromedriverOpts } from 'appium-chromedriver';
import { fs, node, system, tempDir, zip } from '@appium/support';
import path from 'node:path';
import { errors } from '@appium/base-driver';
import type { AppiumDesktopDriver } from '../driver';
import { cdpRequest, downloadFile, MODULE_NAME, sleep } from '../util';

const NATIVE_APP = 'NATIVE_APP';
const WEBVIEW_BASE = 'WEBVIEW_';

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

export async function getCurrentContext(this: AppiumDesktopDriver): Promise<string> {
    return this.currentContext ??= NATIVE_APP;
}

export async function getContexts(this: AppiumDesktopDriver): Promise<string[]> {
    const webViewDetails = await this.getWebViewDetails();
    return [
        NATIVE_APP,
        ...(webViewDetails.pages?.map((page) => `${WEBVIEW_BASE}${page.id}`) ?? []),
    ];
}

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

    if (!(webViewDetails.pages ?? []).map((page) => page.id).includes(name.replace(WEBVIEW_BASE, ''))) {
        throw new errors.InvalidArgumentError(`Web view not found: ${name}`);
    }

    const browser = webViewDetails.info?.Browser ?? '';
    const match = browser.match(/(Chrome|Edg)\/([\d.]+)/);
    if (!match?.[1] || (match[1] !== 'Edg' && match[1] !== 'Chrome')) {
        throw new errors.InvalidArgumentError(`Unsupported browser type: ${match?.[1]}`);
    }
    const browserType = match[1] === 'Edg' ? 'Edge' : 'Chrome';
    const browserVersion = match[2] ?? '';

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

    const page = webViewDetails.pages?.find((p) => p.id === name.replace(WEBVIEW_BASE, ''));
    const debuggerAddress = (page?.webSocketDebuggerUrl ?? '')
        .replace('ws://', '')
        .split('/')[0];

    const options = { debuggerAddress };
    const caps = {
        'ms:edgeOptions': options,
        'goog:chromeOptions': options,
    };

    this.currentContext = name;
    await this.chromedriver.start(caps);

    this.proxyReqRes = this.chromedriver.proxyReq.bind(this.chromedriver);
    this.proxyCommand = this.chromedriver.jwproxy.command.bind(this.chromedriver.jwproxy);
    this.jwpProxyActive = true;
}

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

    if (
        (this.caps.app === 'none' || this.caps.app === 'root' || this.caps.appTopLevelWindow != null)
        && this.caps.webviewDevtoolsPort == null
    ) {
        throw new errors.InvalidArgumentError(
            'Capability "webviewDevtoolsPort" must be set when using "none", "root", or "appTopLevelWindow" with "webviewEnabled".'
        );
    }

    const port = this.webviewDevtoolsPort ??= this.caps.webviewDevtoolsPort ?? null;

    this.log.debug(`WebView2: querying CDP on ${host}:${port}`);

    const info = await (cdpRequest<CDPVersionResponse>({ host, port, endpoint: '/json/version', timeout: 10000 }))
        .catch((err) => { this.log.debug(`WebView2: /json/version failed — ${err.message}`); return undefined; });

    const pages = await (cdpRequest<CDPListResponse>({ host, port, endpoint: '/json/list', timeout: 10000 }))
        .catch((err) => { this.log.debug(`WebView2: /json/list failed — ${err.message}`); return undefined; });

    this.log.debug(`WebView2: browser="${info?.Browser ?? 'n/a'}", pages=${pages?.length ?? 0}`);
    if (pages?.length) {
        for (const p of pages) {
            this.log.debug(`  page id=${p.id} url=${p.url} ws=${p.webSocketDebuggerUrl}`);
        }
    }

    return { info, pages };
}

async function getDriverExecutable(
    this: AppiumDesktopDriver,
    browserType: 'Edge' | 'Chrome',
    browserVersion: string
): Promise<string> {
    const driverType = browserType === 'Chrome' ? 'chromedriver' : 'edgedriver';
    const fileName = browserType === 'Edge' ? 'msedgedriver.exe' : 'chromedriver.exe';

    const root = node.getModuleRootSync(MODULE_NAME, __filename);
    if (!root) {
        throw new errors.InvalidArgumentError(`Cannot find root folder of ${MODULE_NAME} module`);
    }

    const driverDir = path.join(root, driverType);
    if (!(await fs.exists(driverDir))) {
        await fs.mkdir(driverDir);
    }

    const finalPath = path.join(driverDir, browserVersion, fileName);
    if (await fs.exists(finalPath)) {
        return finalPath;
    }

    const executablePath = browserType === 'Edge'
        ? this.caps.edgedriverExecutablePath
        : this.caps.chromedriverExecutablePath;
    if (executablePath) {
        if (!(await fs.exists(executablePath))) {
            throw new errors.InvalidArgumentError(`Driver executable not found at: ${executablePath}`);
        }
        return executablePath;
    }

    const arch = await system.arch();
    const zipFilename = `${driverType}${browserType === 'Edge' ? '_' : '-'}win${arch}.zip`;

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

    const tmpRoot = await tempDir.openDir();
    try {
        await downloadFile(downloadUrl, tmpRoot);
        await zip.extractAllTo(path.join(tmpRoot, zipFilename), tmpRoot);
        const driverPath = await fs.walkDir(
            tmpRoot,
            true,
            (itemPath: string, isDirectory: boolean) => !isDirectory && path.parse(itemPath).base.toLowerCase() === fileName
        );
        if (!driverPath) {throw new errors.UnknownError(`Archive extracted but ${fileName} not found inside.`);}
        await fs.mv(driverPath, finalPath, { mkdirp: true });
    } finally {
        await fs.rimraf(tmpRoot);
    }

    return finalPath;
}
