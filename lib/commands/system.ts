import type {Orientation} from '@appium/types';

import type {AppiumDesktopDriver} from '../driver';
import {getDisplayOrientation} from '../winapi/user32';

/**
 * Gets the display orientation of the primary monitor.
 * @returns `PORTRAIT` or `LANDSCAPE`.
 */
export function getOrientation(this: AppiumDesktopDriver): Orientation {
  return getDisplayOrientation();
}
