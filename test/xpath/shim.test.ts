import { describe, it, expect, vi } from 'vitest';
import { W3C_ELEMENT_KEY } from 'appium/driver';
import { xpathToElIdOrIds } from '../../lib/xpath';

describe('xpath shim', () => {
    it('forwards the raw expression, context and multiple flag to evaluateXPath', async () => {
        const send = vi.fn().mockResolvedValue(['a.b.c']);
        await xpathToElIdOrIds('//Button[@Name="One"]', true, 'ctx-1', send);
        expect(send).toHaveBeenCalledWith('evaluateXPath', {
            expression: '//Button[@Name="One"]',
            contextElementId: 'ctx-1',
            multiple: true,
        });
    });

    it('passes contextElementId: null when there is no context', async () => {
        const send = vi.fn().mockResolvedValue(null);
        await xpathToElIdOrIds('//Button', false, undefined, send).catch(() => {});
        expect(send).toHaveBeenCalledWith('evaluateXPath', {
            expression: '//Button',
            contextElementId: null,
            multiple: false,
        });
    });

    it('wraps every id as a W3C element reference for a multiple find', async () => {
        const send = vi.fn().mockResolvedValue(['1.2', '3.4']);
        const els = await xpathToElIdOrIds('//Button', true, undefined, send);
        expect(els).toEqual([
            { [W3C_ELEMENT_KEY]: '1.2' },
            { [W3C_ELEMENT_KEY]: '3.4' },
        ]);
    });

    it('returns an empty array (not an error) when a multiple find matches nothing', async () => {
        const send = vi.fn().mockResolvedValue([]);
        expect(await xpathToElIdOrIds('//Nope', true, undefined, send)).toEqual([]);
    });

    it('returns a single element reference for a single find', async () => {
        const send = vi.fn().mockResolvedValue('9.9');
        expect(await xpathToElIdOrIds('//Button', false, undefined, send))
            .toEqual({ [W3C_ELEMENT_KEY]: '9.9' });
    });

    it('throws NoSuchElementError when a single find matches nothing', async () => {
        const send = vi.fn().mockResolvedValue(null);
        await expect(xpathToElIdOrIds('//Nope', false, undefined, send))
            .rejects.toThrowError(/could not be located/);
    });
});
