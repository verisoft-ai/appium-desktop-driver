/**
 * Locator-to-condition translation shared between the driver's standard find
 * (`findElOrEls` in driver.ts) and the explicit `windows: find*ViaDotnetBridge`
 * commands (extension.ts). Both need the exact same strategy handling — xpath
 * (including predicates like `contains()`), accessibility id, name, class name,
 * tag name, id, and `-windows uiautomation` — the only thing that differs
 * between "search real UIA" and "search the .NET bridge's tree" is which server
 * command a `findElement`/`findElements` call actually reaches, which is what
 * {@link wrapForDotnetBridge} remaps.
 */
import { errors, W3C_ELEMENT_KEY } from 'appium/driver';
import type { Element } from '@appium/types';
import { convertStringToCondition } from '../powershell/converter';
import { conditionToDto } from '../server/converter-bridge';
import { propertyCondition } from '../server/conditions';
import type { ConditionDto } from '../server/protocol';
import { xpathToElIdOrIds, type SendCommandFn } from '../xpath';

export type { SendCommandFn };

const LOCATION_STRATEGIES = Object.freeze([
    'id',
    'name',
    'xpath',
    'tag name',
    'class name',
    'accessibility id',
    '-windows uiautomation',
] as const);

export type LocateStrategy = typeof LOCATION_STRATEGIES[number];

export async function locateElements(
    strategy: typeof LOCATION_STRATEGIES[number],
    selector: string,
    mult: true,
    context: string | undefined,
    sendCommand: SendCommandFn,
): Promise<Element[]>;
export async function locateElements(
    strategy: typeof LOCATION_STRATEGIES[number],
    selector: string,
    mult: false,
    context: string | undefined,
    sendCommand: SendCommandFn,
): Promise<Element>;
export async function locateElements(
    strategy: typeof LOCATION_STRATEGIES[number],
    selector: string,
    mult: boolean,
    context: string | undefined,
    sendCommand: SendCommandFn,
): Promise<Element | Element[]> {
    let condition: ConditionDto;
    switch (strategy) {
        case 'id':
            condition = propertyCondition('RuntimeId', selector.split('.').map(Number));
            break;
        case 'tag name':
            // WinAppDriver matches LocalizedControlType (lowercase, locale-dependent: "button", "edit").
            // This driver historically matches ControlType (PascalCase: "Button", "Edit").
            // Detect which style the selector uses to support both transparently.
            condition = selector === selector.toLowerCase()
                ? propertyCondition('LocalizedControlType', selector)
                : propertyCondition('ControlType', selector);
            break;
        case 'accessibility id':
            condition = propertyCondition('AutomationId', selector);
            break;
        case 'name':
            condition = propertyCondition('Name', selector);
            break;
        case 'class name':
            condition = propertyCondition('ClassName', selector);
            break;
        case '-windows uiautomation':
            condition = conditionToDto(convertStringToCondition(selector));
            break;
        case 'xpath':
            return await xpathToElIdOrIds(selector, mult, context, sendCommand);
        default:
            throw new errors.InvalidArgumentError(`Invalid find strategy ${strategy}`);
    }

    const params: Record<string, unknown> = {
        scope: 'descendants',
        condition,
        contextElementId: context ?? null,
    };

    if (mult) {
        const result = await sendCommand('findElements', params) as string[];
        return (result ?? []).map((elId) => ({ [W3C_ELEMENT_KEY]: elId }));
    }

    const result = await sendCommand('findElement', params) as string | null;

    if (!result) {
        throw new errors.NoSuchElementError();
    }

    return { [W3C_ELEMENT_KEY]: result };
}

/**
 * Remaps the two generic find command names to their .NET bridge counterparts
 * — everything else (getProperty, saveRootElementToTable, ...) passes through
 * unchanged, which is what lets xpath predicate evaluation (contains(), etc.)
 * work identically against the bridge's tree with zero xpath-layer changes.
 */
export function wrapForDotnetBridge(base: SendCommandFn): SendCommandFn {
    return (method, params) => {
        if (method === 'findElement') { return base('findElementDotnetBridge', params); }
        if (method === 'findElements') { return base('findElementsDotnetBridge', params); }
        return base(method, params);
    };
}
