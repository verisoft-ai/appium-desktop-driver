/**
 * XPath location strategy.
 *
 * Evaluation happens in the process that owns the tree — `DesktopDriverServer.exe`
 * for real UIA, the injected Java / .NET bridge agents for bridged apps — via the
 * `evaluateXPath` RPC. Each runtime runs the whole expression through its
 * platform's mature XPath 1.0 engine (`System.Xml.XPath` for .NET, Jaxen for
 * Java) bound to its native object model, and returns element-table ids in
 * document order. This module is just the thin client shim: forward the raw
 * expression, wrap the returned ids as W3C element references.
 *
 * The previous ~1050-line hand-written evaluator (`core.ts` + `functions.ts`,
 * driven by `xpath-analyzer`) that walked the remote tree one async round trip
 * per axis step / predicate read has been removed — see
 * docs/plans/xpath-engine-in-runtime.md.
 */
import type { Element } from '@appium/types';
import { W3C_ELEMENT_KEY, errors } from 'appium/driver';

export type SendCommandFn = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/**
 * Evaluates `selector` against the tree rooted at `context` (or the session root
 * when `context` is undefined).
 *
 * @param mult  false → return the first match or throw NoSuchElementError;
 *              true  → return every match (possibly empty).
 */
export async function xpathToElIdOrIds(
    selector: string,
    mult: boolean,
    context: string | undefined,
    sendCommand: SendCommandFn,
): Promise<Element | Element[]> {
    const result = await sendCommand('evaluateXPath', {
        expression: selector,
        contextElementId: context ?? null,
        multiple: mult,
    });

    if (mult) {
        const ids = (result as string[] | null) ?? [];
        return ids.map((id) => ({ [W3C_ELEMENT_KEY]: id }));
    }

    const id = result as string | null;
    if (!id) {
        throw new errors.NoSuchElementError();
    }
    return { [W3C_ELEMENT_KEY]: id };
}
