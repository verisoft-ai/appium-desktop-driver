import { fs, system } from '@appium/support';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as contexts from '../../lib/commands/contexts';
import { cdpRequest, downloadFile } from '../../lib/util';

vi.mock('../../lib/util', () => ({
    cdpRequest: vi.fn(),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    MODULE_NAME: 'appium-desktop-driver',
}));

vi.mock('appium-chromedriver', () => ({
    Chromedriver: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        proxyReq: vi.fn(),
        jwproxy: { command: vi.fn() },
    })),
}));

vi.mock('@appium/support', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@appium/support')>();
    return {
        ...actual,
        fs: {
            ...actual.fs,
            exists: vi.fn().mockResolvedValue(true),
            mkdir: vi.fn().mockResolvedValue(undefined),
            mv: vi.fn().mockResolvedValue(undefined),
            rimraf: vi.fn().mockResolvedValue(undefined),
            walkDir: vi.fn().mockResolvedValue('/tmp/chromedriver.exe'),
        },
        node: {
            ...actual.node,
            getModuleRootSync: vi.fn().mockReturnValue('/mock/root'),
        },
        system: {
            ...actual.system,
            arch: vi.fn().mockResolvedValue('64'),
        },
        zip: {
            ...actual.zip,
            extractAllTo: vi.fn().mockResolvedValue(undefined),
        },
        tempDir: {
            ...actual.tempDir,
            openDir: vi.fn().mockResolvedValue('/tmp/mock-dir'),
        },
    };
});

const mockedCdpRequest = vi.mocked(cdpRequest);
const mockedDownloadFile = vi.mocked(downloadFile);

function createMockDriver(capsOverrides: Record<string, unknown> = {}): any {
    return {
        caps: {
            webviewEnabled: true,
            app: 'C:\\App\\app.exe',
            ...capsOverrides,
        },
        basePath: undefined,
        chromedriver: null,
        jwpProxyActive: false,
        proxyReqRes: null,
        proxyCommand: null,
        currentContext: null,
        webviewDevtoolsPort: 10900,
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
        getCurrentContext: contexts.getCurrentContext,
        getContexts: contexts.getContexts,
        setContext: contexts.setContext,
        getWebViewDetails: contexts.getWebViewDetails,
    };
}

const MOCK_VERSION_RESPONSE = {
    Browser: 'Chrome/120.0.0.0',
    'Protocol-Version': '1.3',
    'User-Agent': 'Mock',
    'V8-Version': '12.0',
    'WebKit-Version': '537.36',
    webSocketDebuggerUrl: 'ws://localhost:10900/devtools/browser/abc',
};

const MOCK_PAGES = [
    {
        description: '',
        devtoolsFrontendUrl: '',
        faviconUrl: '',
        id: 'page1',
        title: 'Test Page',
        type: 'page',
        url: 'https://example.com',
        webSocketDebuggerUrl: 'ws://localhost:10900/devtools/page/page1',
    },
    {
        description: '',
        devtoolsFrontendUrl: '',
        faviconUrl: '',
        id: 'page2',
        title: 'Another Page',
        type: 'page',
        url: 'https://other.com',
        webSocketDebuggerUrl: 'ws://localhost:10900/devtools/page/page2',
    },
];

describe('getWebViewDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws InvalidArgumentError when webviewEnabled is false', async () => {
        const driver = createMockDriver({ webviewEnabled: false });
        await expect(contexts.getWebViewDetails.call(driver)).rejects.toThrow('webviewEnabled');
    });

    it('throws when app is none and webviewDevtoolsPort is not set', async () => {
        const driver = createMockDriver({ app: 'none', webviewDevtoolsPort: undefined });
        driver.webviewDevtoolsPort = null;
        await expect(contexts.getWebViewDetails.call(driver)).rejects.toThrow('webviewDevtoolsPort');
    });

    it('throws when app is root and webviewDevtoolsPort is not set', async () => {
        const driver = createMockDriver({ app: 'root', webviewDevtoolsPort: undefined });
        driver.webviewDevtoolsPort = null;
        await expect(contexts.getWebViewDetails.call(driver)).rejects.toThrow('webviewDevtoolsPort');
    });

    it('throws when appTopLevelWindow is set and webviewDevtoolsPort is not set', async () => {
        const driver = createMockDriver({ appTopLevelWindow: '0x1234', webviewDevtoolsPort: undefined });
        driver.webviewDevtoolsPort = null;
        await expect(contexts.getWebViewDetails.call(driver)).rejects.toThrow('webviewDevtoolsPort');
    });

    it('returns info undefined and pages undefined when CDP not reachable', async () => {
        mockedCdpRequest.mockRejectedValue(new Error('ECONNREFUSED'));
        const driver = createMockDriver();
        const result = await contexts.getWebViewDetails.call(driver);
        expect(result).toEqual({ info: undefined, pages: undefined });
    });

    it('returns CDP data when reachable', async () => {
        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        const result = await contexts.getWebViewDetails.call(driver);
        expect(result.info).toEqual(MOCK_VERSION_RESPONSE);
        expect(result.pages).toEqual(MOCK_PAGES);
    });
});

describe('getContexts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns NATIVE_APP plus WEBVIEW_ entries from page list', async () => {
        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        const result = await contexts.getContexts.call(driver);
        expect(result).toEqual(['NATIVE_APP', 'WEBVIEW_page1', 'WEBVIEW_page2']);
    });

    it('returns only NATIVE_APP when no pages available', async () => {
        mockedCdpRequest.mockRejectedValue(new Error('ECONNREFUSED'));
        const driver = createMockDriver();
        const result = await contexts.getContexts.call(driver);
        expect(result).toEqual(['NATIVE_APP']);
    });
});

describe('getCurrentContext', () => {
    it('returns NATIVE_APP by default', async () => {
        const driver = createMockDriver();
        driver.currentContext = null;
        const result = await contexts.getCurrentContext.call(driver);
        expect(result).toBe('NATIVE_APP');
    });

    it('returns stored context when set', async () => {
        const driver = createMockDriver();
        driver.currentContext = 'WEBVIEW_page1';
        const result = await contexts.getCurrentContext.call(driver);
        expect(result).toBe('WEBVIEW_page1');
    });
});

describe('setContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('switches to NATIVE_APP: stops chromedriver, clears proxy flags', async () => {
        const mockCd = { stop: vi.fn().mockResolvedValue(undefined) };
        const driver = createMockDriver();
        driver.chromedriver = mockCd;
        driver.jwpProxyActive = true;

        await contexts.setContext.call(driver, 'NATIVE_APP');

        expect(mockCd.stop).toHaveBeenCalled();
        expect(driver.chromedriver).toBeNull();
        expect(driver.jwpProxyActive).toBe(false);
        expect(driver.proxyReqRes).toBeNull();
        expect(driver.proxyCommand).toBeNull();
        expect(driver.currentContext).toBe('NATIVE_APP');
    });

    it('switches to NATIVE_APP when null passed', async () => {
        const driver = createMockDriver();
        await contexts.setContext.call(driver, null);
        expect(driver.currentContext).toBe('NATIVE_APP');
    });

    it('throws InvalidArgumentError when page not in page list', async () => {
        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await expect(contexts.setContext.call(driver, 'WEBVIEW_nonexistent')).rejects.toThrow('Web view not found');
    });

    it('throws InvalidArgumentError for unsupported browser type', async () => {
        const unsupportedVersionResponse = { ...MOCK_VERSION_RESPONSE, Browser: 'Firefox/120.0' };
        mockedCdpRequest
            .mockResolvedValueOnce(unsupportedVersionResponse)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await expect(contexts.setContext.call(driver, 'WEBVIEW_page1')).rejects.toThrow('Unsupported browser type');
    });

    it('throws InvalidArgumentError for invalid browser version format', async () => {
        const badVersionResponse = { ...MOCK_VERSION_RESPONSE, Browser: 'Chrome/120' };
        mockedCdpRequest
            .mockResolvedValueOnce(badVersionResponse)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await expect(contexts.setContext.call(driver, 'WEBVIEW_page1')).rejects.toThrow('Invalid browser version');
    });

    it('handles Edge browser type (Edg/ prefix)', async () => {
        const edgeVersionResponse = { ...MOCK_VERSION_RESPONSE, Browser: 'Edg/120.0.0.0' };
        mockedCdpRequest
            .mockResolvedValueOnce(edgeVersionResponse)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');
        expect(driver.jwpProxyActive).toBe(true);
    });

    it('sets jwpProxyActive to true after successful start', async () => {
        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');
        expect(driver.jwpProxyActive).toBe(true);
        expect(driver.currentContext).toBe('WEBVIEW_page1');
    });

    it('passes correct debuggerAddress extracted from webSocketDebuggerUrl', async () => {
        const { Chromedriver } = await import('appium-chromedriver');
        const mockStart = vi.fn().mockResolvedValue(undefined);
        const mockCdInstance = {
            start: mockStart,
            stop: vi.fn(),
            proxyReq: vi.fn(),
            jwproxy: { command: vi.fn() },
        };
        (Chromedriver as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => mockCdInstance);

        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');

        expect(mockStart).toHaveBeenCalledWith({
            'ms:edgeOptions': { debuggerAddress: 'localhost:10900' },
            'goog:chromeOptions': { debuggerAddress: 'localhost:10900' },
        });
    });
});

describe('getDriverExecutable', () => {
    const mockedFs = fs as any;

    beforeEach(() => {
        vi.clearAllMocks();
        (system as any).arch = vi.fn().mockResolvedValue('64');
    });

    it('returns cached path when driver binary already exists', async () => {
        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);
        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');
        expect(mockedFs.exists).toHaveBeenCalledWith(expect.stringContaining('chromedriver'));
        expect(driver.jwpProxyActive).toBe(true);
    });

    it('returns chromedriverExecutablePath cap when set and file exists', async () => {
        mockedFs.exists
            .mockResolvedValueOnce(true) // driverDir exists
            .mockResolvedValueOnce(false) // cached path does NOT exist
            .mockResolvedValueOnce(true); // cap path exists

        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);

        const driver = createMockDriver({ chromedriverExecutablePath: 'C:\\drivers\\chromedriver.exe' });
        await contexts.setContext.call(driver, 'WEBVIEW_page1');
        expect(driver.jwpProxyActive).toBe(true);
    });

    it('throws when chromedriverExecutablePath cap set but file missing', async () => {
        mockedFs.exists
            .mockResolvedValueOnce(true) // driverDir exists
            .mockResolvedValueOnce(false) // cached path does NOT exist
            .mockResolvedValueOnce(false); // cap path also missing

        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);

        const driver = createMockDriver({ chromedriverExecutablePath: 'C:\\drivers\\chromedriver.exe' });
        await expect(contexts.setContext.call(driver, 'WEBVIEW_page1')).rejects.toThrow('Driver executable not found at');
    });

    it('builds correct Chrome CDN download URL for win64', async () => {
        mockedFs.exists
            .mockResolvedValueOnce(true) // driverDir exists
            .mockResolvedValueOnce(false); // no cached binary — trigger download

        mockedCdpRequest
            .mockResolvedValueOnce(MOCK_VERSION_RESPONSE)
            .mockResolvedValueOnce(MOCK_PAGES);

        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');

        expect(mockedDownloadFile).toHaveBeenCalledWith(
            expect.stringContaining('storage.googleapis.com'),
            expect.any(String),
        );
        expect(mockedDownloadFile).toHaveBeenCalledWith(
            expect.stringContaining('120.0.0.0'),
            expect.any(String),
        );
    });

    it('builds correct Edge CDN download URL', async () => {
        const edgeVersionResponse = { ...MOCK_VERSION_RESPONSE, Browser: 'Edg/120.0.0.0' };

        mockedFs.exists
            .mockResolvedValueOnce(true) // driverDir exists
            .mockResolvedValueOnce(false); // no cached binary

        mockedCdpRequest
            .mockResolvedValueOnce(edgeVersionResponse)
            .mockResolvedValueOnce(MOCK_PAGES);

        const driver = createMockDriver();
        await contexts.setContext.call(driver, 'WEBVIEW_page1');

        expect(mockedDownloadFile).toHaveBeenCalledWith(
            expect.stringContaining('msedgedriver.microsoft.com'),
            expect.any(String),
        );
    });
});
