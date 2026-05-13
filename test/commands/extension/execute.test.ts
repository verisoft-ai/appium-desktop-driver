/**
 * Unit tests for the execute command router.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as extension from '../../../lib/commands/extension';
import { createMockDriver, MOCK_ELEMENT } from '../../fixtures/driver';

describe('execute (command router)', () => {
    let driver: any;

    beforeEach(() => {
        vi.clearAllMocks();
        driver = createMockDriver() as any;
        Object.assign(driver, extension);
    });

    it('routes windows:launchApp to windowsLaunchApp', async () => {
        driver.launchApp = vi.fn().mockResolvedValue(undefined);
        await extension.execute.call(driver, 'windows: launchApp', []);
        expect(driver.launchApp).toHaveBeenCalledOnce();
    });

    it('routes windows:closeApp to windowsCloseApp', async () => {
        driver.closeApp = vi.fn().mockResolvedValue(undefined);
        await extension.execute.call(driver, 'windows: closeApp', []);
        expect(driver.closeApp).toHaveBeenCalledOnce();
    });

    it('routes windows:getDeviceTime with format arg', async () => {
        driver.getDeviceTime = vi.fn().mockResolvedValue('2026');
        const result = await extension.execute.call(driver, 'windows: getDeviceTime', [{ format: 'yyyy' }]);
        expect(driver.getDeviceTime).toHaveBeenCalledWith(undefined, 'yyyy');
        expect(result).toBe('2026');
    });

    it('routes windows:getDeviceTime without format defaults to ISO 8601', async () => {
        driver.getDeviceTime = vi.fn().mockResolvedValue('2026-03-03T10:00:00+00:00');
        const result = await extension.execute.call(driver, 'windows: getDeviceTime', []);
        expect(driver.getDeviceTime).toHaveBeenCalledWith(undefined, undefined);
        expect(result).toBe('2026-03-03T10:00:00+00:00');
    });

    it('routes windows:deleteFile to deleteFile with args', async () => {
        await extension.execute.call(driver, 'windows: deleteFile', [{ path: 'C:\\temp\\file.txt' }]);
        expect(driver.sendPowerShellCommand).toHaveBeenCalledWith(
            expect.stringContaining('Remove-Item')
        );
    });

    it('routes windows:invoke to patternInvoke with element', async () => {
        await extension.execute.call(driver, 'windows: invoke', [MOCK_ELEMENT]);
        // Command is base64-encoded; verify [InvokePattern] is used
        expect(driver.sendPowerShellCommand).toHaveBeenCalledWith(
            expect.stringContaining('W0ludm9rZVBhdHRlcm5d')
        );
    });

    it('throws UnknownCommandError for unknown windows command', async () => {
        await expect(
            extension.execute.call(driver, 'windows: unknownCommand', [])
        ).rejects.toThrow('Unknown command');
    });

    it('routes powerShell to executePowerShellScript', async () => {
        driver.assertFeatureEnabled = vi.fn();
        driver.caps = {};
        driver.sendPowerShellCommand.mockResolvedValue('output');
        await extension.execute.call(driver, 'powerShell', ['Get-Process']);
        expect(driver.assertFeatureEnabled).toHaveBeenCalledWith('power_shell');
        // Script is base64-encoded in pwsh wrapper; verify Get-Process is present
        expect(driver.sendPowerShellCommand).toHaveBeenCalledWith(
            expect.stringContaining('R2V0LVByb2Nlc3M')
        );
    });

    it('routes return window.name to sendPowerShellCommand', async () => {
        driver.sendPowerShellCommand.mockResolvedValue('WindowName');
        const result = await extension.execute.call(driver, 'return window.name', []);
        // Command is base64-encoded; verify it uses rootElement and fetches Name property
        expect(driver.sendPowerShellCommand).toHaveBeenCalledWith(
            expect.stringContaining('JHJvb3RFbGVtZW50')
        );
        expect(result).toBe('WindowName');
    });

    it('throws NotImplementedError for non-matching script', async () => {
        await expect(
            extension.execute.call(driver, 'unknownScript', [])
        ).rejects.toThrow('Method is not implemented');
    });

    it('routes mobile:getContexts to getWebViewDetails', async () => {
        const mockDetails = {
            info: { Browser: 'Chrome/120.0.0.0' },
            pages: [{ id: 'page1', title: 'Test', url: 'https://example.com', webSocketDebuggerUrl: 'ws://localhost:10900/devtools/page/page1', description: '', devtoolsFrontendUrl: '', faviconUrl: '', type: 'page' }],
        };
        driver.getWebViewDetails = vi.fn().mockResolvedValue(mockDetails);

        const result = await extension.execute.call(driver, 'mobile:getContexts', [{}]) as any[];
        expect(driver.getWebViewDetails).toHaveBeenCalledWith(undefined);
        expect(result[0]).toEqual({ id: 'NATIVE_APP' });
        expect(result[1]).toMatchObject({ id: 'WEBVIEW_page1', title: 'Test', url: 'https://example.com' });
    });

    it('routes mobile: getContexts (space variant) the same way', async () => {
        driver.getWebViewDetails = vi.fn().mockResolvedValue({ info: undefined, pages: undefined });
        const result = await extension.execute.call(driver, 'mobile: getContexts', [{}]) as any[];
        expect(result).toEqual([{ id: 'NATIVE_APP' }]);
    });

    it('mobile:getContexts unwraps WDIO-spread array args', async () => {
        driver.getWebViewDetails = vi.fn().mockResolvedValue({ info: undefined, pages: undefined });
        await extension.execute.call(driver, 'mobile:getContexts', [[{ waitForWebviewMs: 500 }]]);
        expect(driver.getWebViewDetails).toHaveBeenCalledWith(500);
    });

    it('proxies arbitrary script to chromedriver jwproxy when jwpProxyActive', async () => {
        const mockCommand = vi.fn().mockResolvedValue('proxy-result');
        driver.chromedriver = {
            jwproxy: {
                downstreamProtocol: 'W3C',
                command: mockCommand,
            },
        };
        driver.jwpProxyActive = true;
        driver.proxyActive = vi.fn().mockReturnValue(true);

        const result = await extension.execute.call(driver, 'return document.title', []);
        expect(mockCommand).toHaveBeenCalledWith('/execute/sync', 'POST', { script: 'return document.title', args: [] });
        expect(result).toBe('proxy-result');
    });

    it('proxy uses /execute endpoint for MJSONWP protocol', async () => {
        const mockCommand = vi.fn().mockResolvedValue(undefined);
        driver.chromedriver = {
            jwproxy: {
                downstreamProtocol: 'MJSONWP',
                command: mockCommand,
            },
        };
        driver.jwpProxyActive = true;
        driver.proxyActive = vi.fn().mockReturnValue(true);

        await extension.execute.call(driver, 'return 1', []);
        expect(mockCommand).toHaveBeenCalledWith('/execute', 'POST', expect.anything());
    });

    it('powerShell unwraps WDIO-spread array args', async () => {
        driver.assertFeatureEnabled = vi.fn();
        driver.caps = {};
        driver.sendPowerShellCommand.mockResolvedValue('hello');
        await extension.execute.call(driver, 'powerShell', [[{ script: 'Write-Output "hello"' }]]);
        expect(driver.sendPowerShellCommand).toHaveBeenCalledWith(
            expect.stringContaining('V3JpdGUtT3V0cHV0ICJoZWxsbyI')
        );
    });

    it('powerShell runs before proxy passthrough even when jwpProxyActive', async () => {
        const mockCommand = vi.fn();
        driver.chromedriver = { jwproxy: { downstreamProtocol: 'W3C', command: mockCommand } };
        driver.jwpProxyActive = true;
        driver.proxyActive = vi.fn().mockReturnValue(true);
        driver.assertFeatureEnabled = vi.fn();
        driver.caps = {};
        driver.sendPowerShellCommand.mockResolvedValue('output');

        await extension.execute.call(driver, 'powerShell', [{ script: 'Get-Date' }]);
        expect(mockCommand).not.toHaveBeenCalled();
        expect(driver.sendPowerShellCommand).toHaveBeenCalled();
    });
});
