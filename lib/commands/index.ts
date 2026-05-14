import * as actions from './actions';
import * as serverSession from './server-session';
import * as element from './element';
import * as extension from './extension';
import * as device from './device';
import * as system from './system';
import * as app from './app';
import * as vision from './vision';
import * as contexts from './contexts';

const commands = {
    ...actions,
    ...serverSession,
    ...element,
    ...extension,
    ...system,
    ...device,
    ...app,
    ...contexts,
    ...vision,
    // add the rest of the commands here
};

type Commands = {
    [key in keyof typeof commands]: typeof commands[key];
};

declare module '../driver' {
    interface AppiumDesktopDriver extends Commands {}
}

export default commands;
