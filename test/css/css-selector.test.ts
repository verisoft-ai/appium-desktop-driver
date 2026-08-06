import { describe, it, expect } from 'vitest';
import { cssToNativeLocator, UIA_CONDITION_STRATEGY } from '../../lib/css';
import { convertStringToCondition } from '../../lib/powershell/converter';
import { AndCondition, PropertyCondition } from '../../lib/powershell/conditions';

describe('cssToNativeLocator', () => {
    it('converts #id to an AutomationId equality condition', async () => {
        const { strategy, selector } = await cssToNativeLocator('#btn_ok');
        expect(strategy).toBe(UIA_CONDITION_STRATEGY);
        expect(selector).toBe(`[PropertyCondition]::new([AutomationElement]::AutomationIdProperty, 'btn_ok')`);
        expect(convertStringToCondition(selector)).toBeInstanceOf(PropertyCondition);
    });

    it('converts .class to a ClassName equality condition', async () => {
        const { selector } = await cssToNativeLocator('.MyClass');
        expect(selector).toBe(`[PropertyCondition]::new([AutomationElement]::ClassNameProperty, 'MyClass')`);
        expect(convertStringToCondition(selector)).toBeInstanceOf(PropertyCondition);
    });

    it('converts [name="x"] to a Name equality condition', async () => {
        const { selector } = await cssToNativeLocator('*[name="OK"]');
        expect(selector).toBe(`[PropertyCondition]::new([AutomationElement]::NameProperty, 'OK')`);
    });

    it('converts a tag name to a ControlType condition', async () => {
        const { selector } = await cssToNativeLocator('button');
        expect(selector).toBe(`[PropertyCondition]::new([AutomationElement]::ControlTypeProperty, [ControlType]::button)`);
        expect(convertStringToCondition(selector)).toBeInstanceOf(PropertyCondition);
    });

    it('combines multiple attributes with AndCondition', async () => {
        const { selector } = await cssToNativeLocator('button[name="OK"]');
        const condition = convertStringToCondition(selector);
        expect(condition).toBeInstanceOf(AndCondition);
    });

    it('escapes single quotes in attribute values', async () => {
        const { selector } = await cssToNativeLocator(`[name="O'Brien"]`);
        expect(selector).toBe(`[PropertyCondition]::new([AutomationElement]::NameProperty, 'O''Brien')`);
        expect(convertStringToCondition(selector)).toBeInstanceOf(PropertyCondition);
    });

    it('rejects unsupported operators (no partial match on UIA conditions)', async () => {
        await expect(cssToNativeLocator('[name^="OK"]')).rejects.toThrow();
    });

    it('rejects combinators', async () => {
        await expect(cssToNativeLocator('window button')).rejects.toThrow();
    });

    it('rejects unknown attributes', async () => {
        await expect(cssToNativeLocator('[bogus="x"]')).rejects.toThrow();
    });

    it('rejects unknown control types', async () => {
        await expect(cssToNativeLocator('not-a-real-control')).rejects.toThrow();
    });
});
