import type {CssTransformer, NativeLocator, StrategyKey} from '@appium/css-locator-to-native';
import {errors} from 'appium/driver';

import {UIA_CONDITION_EMITTER_KEY, UIA_CONDITION_STRATEGY} from './constants';
import {ATTRIBUTE_SCHEMA} from './schema';
import {UiaConditionEmitter} from './uia-condition-emitter';

export {UIA_CONDITION_STRATEGY} from './constants';

const emitters = {
  [UIA_CONDITION_EMITTER_KEY]: new UiaConditionEmitter(UIA_CONDITION_STRATEGY),
};

let transformCss: CssTransformer | null = null;

async function getTransformCss(): Promise<CssTransformer> {
  if (!transformCss) {
    const mod = await import('@appium/css-locator-to-native');
    transformCss = mod.createCssTransformer({
      schema: ATTRIBUTE_SCHEMA,
      emitters,
      resolveStrategy(): StrategyKey<typeof emitters> {
        return UIA_CONDITION_EMITTER_KEY;
      },
    });
  }
  return transformCss;
}

/**
 * Converts a CSS selector string into a `-windows uiautomation` native locator.
 *
 * @param css - CSS selector to transform
 * @returns Native locator strategy name and selector string
 */
export async function cssToNativeLocator(css: string): Promise<NativeLocator> {
  try {
    const transform = await getTransformCss();
    return transform(css);
  } catch (err) {
    throw mapCssError(err, css);
  }
}

function mapCssError(err: unknown, css: string): Error {
  if (isPackageError(err, 'InvalidSelectorError')) {
    return new errors.InvalidSelectorError(`Invalid CSS selector '${css}': ${err.message}`);
  }
  if (isPackageError(err, 'UnsupportedSelectorError')) {
    return new errors.InvalidSelectorError(`Unsupported CSS selector '${css}': ${err.message}`);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}

function isPackageError(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}
