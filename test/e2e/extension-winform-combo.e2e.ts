import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { Browser } from 'webdriverio';
import { createWinformComboSession, quitSession } from './helpers/session.js';

// Reproduces a real-world bug: a plain WinForms ComboBox (DropDownList style, native
// Win32 combo under the hood) can report ExpandCollapsePattern support without actually
// opening the dropdown. `windows: expand` must detect that and fall back to ALT+Down
// (lib/commands/extension.ts patternExpand) and actually open the dropdown — not merely
// resolve without throwing.
describe('windows: expand (WinForms ComboBox managed-UIA2 fallback)', () => {
    let app: Browser;

    beforeAll(async () => {
        app = await createWinformComboSession();
    });

    afterAll(async () => {
        await quitSession(app);
    });

    it('expands the ComboBox and reveals its list items', async () => {
        const comboBox = await app.$('~cmbCategories');
        await expect(
            app.executeScript('windows: expand', [comboBox])
        ).resolves.not.toThrow();

        await app.pause(200);

        const items = await app.$$('//ListItem');
        expect(items.length).toBeGreaterThan(0);
    });

    it('collapses the ComboBox without error', async () => {
        const comboBox = await app.$('~cmbCategories');
        await app.executeScript('windows: expand', [comboBox]);
        await app.pause(200);

        await expect(
            app.executeScript('windows: collapse', [comboBox])
        ).resolves.not.toThrow();
    });
});
