import type {ParsedAttribute, ParsedRule, ParsedSelector, StrategyEmitter} from '@appium/css-locator-to-native';
import {errors} from 'appium/driver';

import {ControlType} from '../powershell/types';

const STRING_PROPERTY_NAMES: Record<string, string> = {
  name: 'NameProperty',
  'automation-id': 'AutomationIdProperty',
  'class-name': 'ClassNameProperty',
  'localized-control-type': 'LocalizedControlTypeProperty',
  'help-text': 'HelpTextProperty',
  'framework-id': 'FrameworkIdProperty',
  'item-status': 'ItemStatusProperty',
  'item-type': 'ItemTypeProperty',
};

const CONTROL_TYPE_VALUES = new Set<string>(Object.values(ControlType));

/**
 * Converts parsed CSS selectors into `-windows uiautomation` condition DSL strings
 * (e.g. `[PropertyCondition]::new([AutomationElement]::NameProperty, 'OK')`), consumed by
 * `convertStringToCondition` in `lib/powershell/converter.ts`.
 *
 * Scope: single-rule, equality-only. UIA's `PropertyCondition` has no partial-match support, so
 * `^=`/`$=`/`~=`/`*=` operators are rejected. Combinators (`>`, ` `) are rejected too, since our
 * condition model has no notion of matching a descendant/child chain in one expression.
 */
export class UiaConditionEmitter implements StrategyEmitter {
  readonly strategy: string;

  constructor(strategy: string) {
    this.strategy = strategy;
  }

  emit(parsed: ParsedSelector): string {
    const conditions = this.emitRule(parsed.rule);

    if (conditions.length === 0) {
      return '[PropertyCondition]::TrueCondition';
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return `[AndCondition]::new(${conditions.join(', ')})`;
  }

  private emitRule(rule: ParsedRule): string[] {
    if (rule.nested) {
      throw new errors.InvalidSelectorError(
        'Combinators (descendant/child selectors) are not supported for css selector locators. Use a single compound rule.',
      );
    }

    if (rule.pseudos.length) {
      throw new errors.InvalidSelectorError(`Unsupported pseudo-class ':${rule.pseudos[0].name}' in css selector.`);
    }

    const conditions: string[] = [];

    if (rule.tag && rule.tag !== '*') {
      conditions.push(this.formatControlType(rule.tag));
    }

    if (rule.classes.length > 1) {
      throw new errors.InvalidSelectorError(
        'Only a single class token is supported in css selector (Windows elements have one ClassName).',
      );
    }
    if (rule.classes.length === 1) {
      conditions.push(this.formatPropertyCondition('ClassNameProperty', rule.classes[0]));
    }

    if (rule.id) {
      conditions.push(this.formatPropertyCondition('AutomationIdProperty', rule.id));
    }

    for (const attr of rule.attributes) {
      conditions.push(this.formatAttribute(attr));
    }

    return conditions;
  }

  private formatAttribute(attr: ParsedAttribute): string {
    if (attr.name === 'control-type') {
      return this.formatControlType(attr.value ?? '');
    }

    const stringProperty = STRING_PROPERTY_NAMES[attr.name];
    if (stringProperty) {
      if (attr.operator && attr.operator !== '=') {
        throw new errors.InvalidSelectorError(
          `Operator '${attr.operator}' is not supported in css selector — UIA property conditions only support exact match ('=').`,
        );
      }
      return this.formatPropertyCondition(stringProperty, attr.value ?? '');
    }

    throw new errors.InvalidSelectorError(`Unsupported css selector attribute '${attr.name}'.`);
  }

  private formatControlType(tag: string): string {
    const normalized = tag.toLowerCase();
    if (!CONTROL_TYPE_VALUES.has(normalized)) {
      throw new errors.InvalidSelectorError(`Unknown control type '${tag}' in css selector.`);
    }
    return `[PropertyCondition]::new([AutomationElement]::ControlTypeProperty, [ControlType]::${normalized})`;
  }

  private formatPropertyCondition(property: string, value: string): string {
    return `[PropertyCondition]::new([AutomationElement]::${property}, ${this.psString(value)})`;
  }

  private psString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
