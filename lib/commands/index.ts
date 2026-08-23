import * as actions from './actions';
import * as app from './app';
import * as contexts from './contexts';
import * as device from './device';
import * as element from './element';
import * as executeMethods from './execute-methods';
import * as extension from './extension';
import * as ieSession from './ie-session';
import * as native from './native';
import * as serverSession from './server-session';
import * as system from './system';

const commands = {
  ...actions,
  ...serverSession,
  ...ieSession,
  ...element,
  ...extension,
  ...executeMethods,
  ...system,
  ...device,
  ...app,
  ...contexts,
  ...native,
  // add the rest of the commands here
};

type Commands = {
  [key in keyof typeof commands]: (typeof commands)[key];
};

declare module '../driver' {
  interface AppiumDesktopDriver extends Commands {}
}

export default commands;
