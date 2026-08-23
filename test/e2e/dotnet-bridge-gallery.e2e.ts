import type {ChildProcess} from 'node:child_process';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Browser, Selector} from 'webdriverio';
import {remote} from 'webdriverio';

import {APPIUM_SERVER, launchOwnerDrawGalleryExternally, quitSession} from './helpers/session.js';

// Consolidated Phase 4 coverage: all 5 ownerdraw-gallery element kinds in one file, one shared
// session/attach (see appium-windows2-test-apps/ownerdraw-gallery/Program.cs for the fixture). Supersedes
// dotnet-bridge-listbox-probe.e2e.ts / appium-windows2-test-apps/listbox-probe-throwaway/, both throwaway.

type WindowInfo = {handle: string; title: string; className: string};

function killProc(proc: ChildProcess | null): void {
  try {
    proc?.kill();
  } catch {
    /* already exited */
  }
}

describe('.NET Bridge — ownerdraw gallery, full element coverage', () => {
  let driver: Browser;
  let appProc: ChildProcess;
  let mainWindowHandle: string;

  beforeAll(async () => {
    const launched = await launchOwnerDrawGalleryExternally();
    appProc = launched.proc;

    driver = await remote({
      ...APPIUM_SERVER,
      capabilities: {
        platformName: 'Windows',
        'appium:automationName': 'DesktopDriver',
        'appium:appTopLevelWindow': launched.hwnd,
        'appium:shouldCloseApp': false,
      } as WebdriverIO.Capabilities,
    });
    await driver.setTimeout({implicit: 3000});
    mainWindowHandle = await driver.getWindowHandle();
  }, 30_000);

  afterAll(async () => {
    await quitSession(driver);
    killProc(appProc);
  });

  it('plain UIA cannot see any owner-drawn value before the bridge attaches', async () => {
    const source = await driver.getPageSource();
    expect(source).not.toContain('Apple');
    expect(source).not.toContain('Root A');
    expect(source).not.toContain('DialogSecret');
  });

  it('windows: attachDotnetBridge makes owner-drawn values readable via the bridge', async () => {
    await driver.executeScript('windows: attachDotnetBridge', [{}]);
    await driver.waitUntil(
      async () =>
        ((await driver.executeScript('windows: getPageSourceViaDotnetBridge', [{}])) as string).includes('Apple'),
      {timeout: 10_000, interval: 500, timeoutMsg: 'Owner-drawn values never appeared after attachDotnetBridge'},
    );
  });

  // Owner-drawn controls paint their own content and expose nothing (or a blank Name) to real
  // UIA — confirmed per-control below, not assumed — so every query on them goes through the
  // explicit .NET bridge find, not standard find (which stays pure UIA even here). Native
  // controls that happen to sit in the same window (OpenDialogButton) are unaffected and keep
  // using standard find.
  async function findViaBridge(xpath: string) {
    const found = await driver.executeScript('windows: findElementViaDotnetBridge', [{using: 'xpath', value: xpath}]);
    return found ? driver.$(found as unknown as Selector) : null;
  }
  async function findAllViaBridge(xpath: string) {
    return (await driver.executeScript('windows: findElementsViaDotnetBridge', [
      {using: 'xpath', value: xpath},
    ])) as unknown[];
  }

  // ─── ListBox ────────────────────────────────────────────────────────────

  it('ListBox: exposes all 3 items and selectElement moves the real SelectedIndex', async () => {
    const items = await findAllViaBridge('//BridgeListItem');
    expect(items.length).toBe(3);

    const banana = await findViaBridge('//BridgeListItem[contains(@Name,"Banana")]');
    expect(banana).not.toBeNull();
    const elementId: string = await banana!.elementId;
    expect(await banana!.getAttribute('IsSelected')).toBe(false);

    await driver.executeScript('windows: select', [{elementId}]);

    expect(await banana!.getAttribute('IsSelected')).toBe(true);
    const apple = await findViaBridge('//BridgeListItem[contains(@Name,"Apple")]');
    expect(await apple!.getAttribute('IsSelected')).toBe(false);
  });

  // ─── TreeView ───────────────────────────────────────────────────────────

  it('TreeView: collapsed node hides its children until expandElement runs', async () => {
    const childBefore = await findAllViaBridge('//BridgeTreeNode[contains(@Name,"Child A1")]');
    expect(childBefore.length).toBe(0);

    const rootA = await findViaBridge('//BridgeTreeNode[contains(@Name,"Root A")]');
    expect(rootA).not.toBeNull();
    expect(await rootA!.getAttribute('IsExpanded')).toBe(false);
    const elementId: string = await rootA!.elementId;

    await driver.executeScript('windows: expand', [{elementId}]);

    expect(await rootA!.getAttribute('IsExpanded')).toBe(true);
    const childAfter = await findViaBridge('//BridgeTreeNode[contains(@Name,"Child A1")]');
    expect(await childAfter!.isExisting()).toBe(true);
    expect(await childAfter!.getText()).toBe('Child A1');
  });

  // ─── Combo ──────────────────────────────────────────────────────────────

  it('Combo: opens a real popup window; selecting an item updates the closed value', async () => {
    const combo = await findViaBridge('//*[@AutomationId="Combo1"]');
    expect(combo).not.toBeNull();
    expect(await combo!.getText()).toBe('Red');

    const before = (await driver.executeScript('windows: getWindows', [])) as WindowInfo[];
    const comboElementId: string = await combo!.elementId;
    await driver.executeScript('windows: invoke', [{elementId: comboElementId}]);

    let popup: WindowInfo | undefined;
    await driver.waitUntil(
      async () => {
        const after = (await driver.executeScript('windows: getWindows', [])) as WindowInfo[];
        popup = after.find((w) => !before.some((b) => b.handle === w.handle));
        return popup !== undefined;
      },
      {timeout: 5_000, interval: 200, timeoutMsg: 'Combo popup window never appeared'},
    );

    await driver.switchToWindow(popup!.handle);
    const green = await findViaBridge('//BridgeListItem[contains(@Name,"Green")]');
    expect(await green!.isExisting()).toBe(true);
    const greenElementId: string = await green!.elementId;
    await driver.executeScript('windows: select', [{elementId: greenElementId}]);

    await driver.switchToWindow(mainWindowHandle);
    await driver.waitUntil(async () => (await combo!.getText()) === 'Green', {
      timeout: 5_000,
      interval: 200,
      timeoutMsg: 'Combo value never updated to Green',
    });
  });

  // ─── ContextMenu ────────────────────────────────────────────────────────

  it('ContextMenu: opens a real popup window; selecting an item updates the last-action value', async () => {
    const menu = await findViaBridge('//*[@AutomationId="ContextMenu1"]');
    expect(menu).not.toBeNull();

    const before = (await driver.executeScript('windows: getWindows', [])) as WindowInfo[];
    const menuElementId: string = await menu!.elementId;
    await driver.executeScript('windows: invoke', [{elementId: menuElementId}]);

    let popup: WindowInfo | undefined;
    await driver.waitUntil(
      async () => {
        const after = (await driver.executeScript('windows: getWindows', [])) as WindowInfo[];
        popup = after.find((w) => !before.some((b) => b.handle === w.handle));
        return popup !== undefined;
      },
      {timeout: 5_000, interval: 200, timeoutMsg: 'Context menu popup window never appeared'},
    );

    await driver.switchToWindow(popup!.handle);
    const deleteItem = await findViaBridge('//BridgeListItem[contains(@Name,"Delete")]');
    expect(await deleteItem!.isExisting()).toBe(true);
    const deleteElementId: string = await deleteItem!.elementId;
    await driver.executeScript('windows: select', [{elementId: deleteElementId}]);

    await driver.switchToWindow(mainWindowHandle);
    await driver.waitUntil(async () => (await menu!.getText()).includes('Delete'), {
      timeout: 5_000,
      interval: 200,
      timeoutMsg: 'Context menu last-action never updated to Delete',
    });
  });

  // ─── Modal dialog ───────────────────────────────────────────────────────

  it('ModalDialog: a second top-level window (same PID) is readable via the same bridge session', async () => {
    const before = await driver.getWindowHandles();

    // OpenDialogButton is a plain (non-owner-drawn) WinForms Button — real UIA click works.
    const openButton = await driver.$('//*[@AutomationId="OpenDialogButton"]');
    await openButton.click();

    let dialogHandle: string | undefined;
    await driver.waitUntil(
      async () => {
        const after = await driver.getWindowHandles();
        dialogHandle = after.find((h) => !before.includes(h));
        return dialogHandle !== undefined;
      },
      {timeout: 5_000, interval: 200, timeoutMsg: 'Modal dialog window never appeared'},
    );

    await driver.switchToWindow(dialogHandle!);
    const status = await findViaBridge('//*[@AutomationId="DialogStatus"]');
    expect(status).not.toBeNull();
    expect(await status!.getText()).toBe('DialogSecret');

    await driver.switchToWindow(mainWindowHandle);
    const listBox = await driver.$('//*[@AutomationId="ListBox1"]');
    expect(await listBox.isExisting()).toBe(true);
  });
});
