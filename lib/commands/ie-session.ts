import type {AppiumDesktopDriver} from '../driver';
import {IESession, registerIESession, deleteIESession} from '../ie/session';
import {isIEWindowHwnd} from '../winapi/user32';

export {isIEWindowHwnd};

/**
 * Enables IE-mode automation for the given window, creating (or replacing, if the target
 * HWND changed) an {@link IESession} bridge for it.
 * @param hwnd - The native window handle of the IE window to attach to.
 * @returns Resolves once IE mode is enabled.
 */
export async function enableIEMode(this: AppiumDesktopDriver, hwnd: number): Promise<void> {
  this.log.info(`IE HWND 0x${hwnd.toString(16).padStart(8, '0')}`);

  if (!this.ieSession || this.ieHwnd !== hwnd) {
    this.ieSession?.dispose();
    this.ieSession = new IESession(hwnd, () => {
      this.ieContext = false;
      this.ieSession = null;
      this.log.warn('IE bridge exited unexpectedly.');
    });
    this.ieHwnd = hwnd;
    if (this.sessionId) {
      registerIESession(this.sessionId, this.ieSession);
    }
  }

  this.ieContext = true;
  this.log.info(`IE mode enabled for HWND 0x${hwnd.toString(16)}`);
}

/**
 * Switches the driver back to plain UIA commands, leaving any existing IE session intact.
 * @returns Nothing.
 */
export function disableIEMode(this: AppiumDesktopDriver): void {
  this.ieContext = false;
  this.log.info('IE mode disabled — back to UIA.');
}

/**
 * Tears down the current IE session bridge entirely and clears IE-related session state.
 * @returns Resolves once the IE session has been terminated.
 */
export async function terminateIEMode(this: AppiumDesktopDriver): Promise<void> {
  this.ieContext = false;
  if (this.sessionId) {
    deleteIESession(this.sessionId);
  }
  this.ieSession = null;
  this.ieHwnd = undefined;
  this.log.debug('IE bridge session terminated.');
}
