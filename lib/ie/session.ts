/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ChildProcess, spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'node:path';
import { node } from '@appium/support';
import { errors, W3C_ELEMENT_KEY } from '@appium/base-driver';
import { MODULE_NAME } from '../util';

function bridgeExePath(): string {
    const root = node.getModuleRootSync(MODULE_NAME, __filename);
    if (!root) { throw new Error('Cannot resolve module root'); }
    return path.join(root, 'iebridge', 'IEBridge.exe');
}

type Pending = {
    resolve: (v: Record<string, unknown>) => void;
    reject: (e: Error) => void;
};

export class IESession {
    private proc: ChildProcess;
    private pending: Map<number, Pending> = new Map();
    private seq = 0;

    constructor(
        private readonly hwnd: number,
        onExit?: () => void,
    ) {
        const exe = bridgeExePath();
        this.proc = spawn(exe, [], {
            stdio: ['pipe', 'pipe', 'inherit'],
        });

        const rl = createInterface({ input: this.proc.stdout! });
        rl.on('line', (line) => {
            let resp: Record<string, unknown>;
            try { resp = JSON.parse(line); }
            catch { return; }

            const s = resp.seq as number;
            const cb = this.pending.get(s);
            if (!cb) { return; }
            this.pending.delete(s);

            if (resp.ok) { cb.resolve(resp); }
            else {
                cb.reject(new Error(String(resp.error ?? 'IE_ERROR')));
            }
        });

        this.proc.on('exit', () => {
            for (const cb of this.pending.values()) {
                cb.reject(new Error('IEBridge process exited'));
            }
            this.pending.clear();
            onExit?.();
        });
    }

    private send(
        cmd: string,
        extra: Record<string, unknown> = {},
    ): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            const seq = ++this.seq;
            this.pending.set(seq, { resolve, reject });
            this.proc.stdin!.write(
                JSON.stringify({ seq, cmd, hwnd: this.hwnd, ...extra })
                + '\n',
            );
        });
    }

    async findElement(
        strategy: string, value: string,
    ): Promise<{ [key: string]: string }> {
        const { cmd, value: v } = strategyToCmd(strategy, false, value);
        const r = await this.send(cmd, { value: v });
        return { [W3C_ELEMENT_KEY]: r.elementId as string };
    }

    async findElements(
        strategy: string, value: string,
    ): Promise<Array<{ [key: string]: string }>> {
        const { cmd, value: v } = strategyToCmd(strategy, true, value);
        const r = await this.send(cmd, { value: v });
        return (r.elementIds as string[]).map((id) => ({
            [W3C_ELEMENT_KEY]: id,
        }));
    }

    async click(elementId: string): Promise<void> {
        await this.send('click', { elementId });
    }

    async setValue(elementId: string, value: string): Promise<void> {
        await this.send('setValue', { elementId, value });
    }

    async clear(elementId: string): Promise<void> {
        await this.send('clear', { elementId });
    }

    async getText(elementId: string): Promise<string> {
        const r = await this.send('getText', { elementId });
        return r.text as string;
    }

    async getAttribute(elementId: string, name: string): Promise<string | null> {
        const r = await this.send('getAttribute', { elementId, name });
        return (r.value as string | null) ?? null;
    }

    async isDisplayed(elementId: string): Promise<boolean> {
        const r = await this.send('isDisplayed', { elementId });
        return r.value as boolean;
    }

    async isEnabled(elementId: string): Promise<boolean> {
        const r = await this.send('isEnabled', { elementId });
        return r.value as boolean;
    }

    async isSelected(elementId: string): Promise<boolean> {
        const r = await this.send('isSelected', { elementId });
        return r.value as boolean;
    }

    async getTitle(): Promise<string> {
        return (await this.send('getTitle')).title as string;
    }

    async getUrl(): Promise<string> {
        return (await this.send('getUrl')).url as string;
    }

    async getSource(): Promise<string> {
        return (await this.send('getSource')).source as string;
    }

    async navigate(url: string): Promise<void> {
        await this.send('navigate', { value: url });
    }

    async execute(script: string, args: unknown[] = []): Promise<unknown> {
        const r = await this.send('executeScript', {
            script,
            args: JSON.stringify(args),
        });
        return r.result ?? null;
    }

    async switchToFrame(id: number | string): Promise<void> {
        await this.send('switchToFrame', { value: String(id) });
    }

    async switchToFrameByElement(elementId: string): Promise<void> {
        await this.send('switchToFrame', { elementId, value: '' });
    }

    async switchToDefaultContent(): Promise<void> {
        await this.send('switchToDefaultContent');
    }

    clearElements(): void {
        // eslint-disable-next-line promise/prefer-await-to-then
        this.send('clearElements').catch(() => {/* best-effort */});
    }

    dispose(): void { this.proc.kill(); }
}

type CmdSpec = { cmd: string; value: string };

function strategyToCmd(strategy: string, multi: boolean, value: string): CmdSpec {
    switch (strategy) {
        case 'id':
            // HTML ids are unique — multi is technically invalid, but we handle it
            // via CSS selector to avoid silently returning wrong results.
            if (multi) {
                return { cmd: 'findElementsCssAll', value: `#${value}` };
            }
            return { cmd: 'findElementById', value };
        case 'css selector':
            return { cmd: multi ? 'findElementsCssAll' : 'findElementsByCss', value };
        case 'xpath':
            return { cmd: multi ? 'findElementsByXpath' : 'findElementByXpath', value };
        case 'accessibility id':
        default:
            throw new errors.InvalidArgumentError(
                `IE bridge does not support strategy: ${strategy}`);
    }
}

const sessions = new Map<string, IESession>();

export function registerIESession(sessionId: string, s: IESession): void {
    sessions.set(sessionId, s);
}

export function getIESession(sessionId: string): IESession {
    const s = sessions.get(sessionId);
    if (!s) { throw new Error(`No IE session: ${sessionId}`); }
    return s;
}

export function deleteIESession(sessionId: string): void {
    sessions.get(sessionId)?.dispose();
    sessions.delete(sessionId);
}
