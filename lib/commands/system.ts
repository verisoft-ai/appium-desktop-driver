import { Orientation } from '@appium/types';
import { AppiumDesktopDriver } from '../driver';
import { getDisplayOrientation } from '../winapi/user32';

export function getOrientation(this: AppiumDesktopDriver): Orientation {
    return getDisplayOrientation();
}
