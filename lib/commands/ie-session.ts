import { AppiumDesktopDriver } from '../driver';
import { IESession, registerIESession, deleteIESession } from '../ie/session';
import { isIEWindowHwnd } from '../winapi/user32';

export { isIEWindowHwnd };

export async function enableIEMode(
    this: AppiumDesktopDriver, hwnd: number,
): Promise<void> {
    this.log.info(`IE HWND 0x${hwnd.toString(16).padStart(8, '0')}`);

    if (!this.ieSession || this.ieHwnd !== hwnd) {
        this.ieSession?.dispose();
        this.ieSession = new IESession(hwnd, () => {
            this.ieContext = false;
            this.ieSession = null;
            this.log.warn('IE bridge exited unexpectedly.');
        });
        this.ieHwnd = hwnd;
        if (this.sessionId) { registerIESession(this.sessionId, this.ieSession); }
    }

    this.ieContext = true;
    this.log.info(`IE mode enabled for HWND 0x${hwnd.toString(16)}`);
}

export function disableIEMode(this: AppiumDesktopDriver): void {
    this.ieContext = false;
    this.log.info('IE mode disabled — back to UIA.');
}

export async function terminateIEMode(this: AppiumDesktopDriver): Promise<void> {
    this.ieContext = false;
    if (this.sessionId) { deleteIESession(this.sessionId); }
    this.ieSession = null;
    this.ieHwnd = undefined;
    this.log.debug('IE bridge session terminated.');
}
