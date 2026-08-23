import type {ChildProcess} from 'node:child_process';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Browser, Selector} from 'webdriverio';

import {
  isProcess32Bit,
  launchNet8WinformsMinimalX86Externally,
  createDotnetBridgeAttachSession,
  quitSession,
} from './helpers/session.js';

// 32-bit twin of dotnet-bridge-coreclr.e2e.ts — same fixture source (appium-windows2-test-apps/net8-winforms-
// minimal/), published with -r win-x86 so it genuinely loads a 32-bit CoreCLR. Exercises
// BridgeInjector.InjectFromPidAutoBitness's CoreCLR branch picking the x86 profiler DLL and
// CoreClrAttacher picking the x86-published bridge-core.dll — see
// dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md for the bitness bugs this caught.
//
// Requires an x86 .NET 8 Desktop Runtime installed (`winget install
// Microsoft.DotNet.DesktopRuntime.8.x86`) — a 32-bit CoreCLR process needs its own
// architecture-specific runtime, unlike the Framework 32-bit path which only needs WOW64.

function killProc(proc: ChildProcess | null): void {
  try {
    proc?.kill();
  } catch {
    /* already exited */
  }
}

describe('.NET Bridge — CoreCLR profiler attach, 32-bit target (net8-winforms-minimal x86 fixture)', () => {
  let driver: Browser;
  let appProc: ChildProcess;

  beforeAll(async () => {
    const launched = await launchNet8WinformsMinimalX86Externally();
    appProc = launched.proc;

    expect(appProc.pid).toBeDefined();
    expect(isProcess32Bit(appProc.pid!)).toBe(true);

    driver = await createDotnetBridgeAttachSession(launched.hwnd);
  }, 30_000);

  afterAll(async () => {
    await quitSession(driver);
    killProc(appProc);
  });

  it('setValue writes real WinForms TextBox.Text on a 32-bit CoreCLR target', async () => {
    const input = await driver.$('//*[@AutomationId="TxtInput"]');
    await input.setValue('hello 32-bit coreclr');
    expect(await input.getText()).toBe('hello 32-bit coreclr');
  });

  it('invoke fires the real Button.Click handler on a 32-bit CoreCLR target', async () => {
    const button = await driver.$('//*[@AutomationId="BtnClick"]');
    const elementId: string = await button.elementId;
    await driver.executeScript('windows: invoke', [{elementId}]);

    const label = await driver.$('//*[@AutomationId="LblClickCount"]');
    expect(await label.getText()).toBe('Clicked: 1');
  });

  it('selectElement moves real state on an owner-drawn 32-bit CoreCLR list element', async () => {
    // Owner-drawn list items are genuinely invisible to real UIA — reached via the
    // explicit .NET bridge find, not standard find (which stays pure UIA even here).
    const found = await driver.executeScript('windows: findElementViaDotnetBridge', [
      {using: 'xpath', value: '//BridgeListItem[contains(@Name,"Banana")]'},
    ]);
    expect(found).not.toBeNull();
    const item = await driver.$(found as unknown as Selector);
    expect(await item.isExisting()).toBe(true);
    expect(await item.getAttribute('IsSelected')).toBe(false);

    const elementId: string = await item.elementId;
    await driver.executeScript('windows: select', [{elementId}]);

    expect(await item.getAttribute('IsSelected')).toBe(true);
  });
});
