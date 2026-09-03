import type { ExecuteMethodMap } from '@appium/types';
import type { AppiumDesktopDriver } from './driver';

/**
 * Standard Appium execute-method descriptors for the `windows:` commands, so they're
 * discoverable by Appium tooling (Appium Inspector, doc generators, typed clients).
 * Kept alongside (not replacing) the legacy `windows:` + `EXTENSION_COMMANDS` dispatch
 * in `lib/commands/extension.ts` for backwards compatibility.
 */
export const executeMethodMap: ExecuteMethodMap<AppiumDesktopDriver> = {
    'windows: cacheRequest': {
        command: 'emCacheRequest',
        params: { optional: ['treeScope', 'treeFilter', 'automationElementMode'] },
    },
    'windows: invoke': { command: 'emInvoke', params: { required: ['elementId'] } },
    'windows: expand': { command: 'emExpand', params: { required: ['elementId'] } },
    'windows: collapse': { command: 'emCollapse', params: { required: ['elementId'] } },
    'windows: isMultiple': { command: 'emIsMultiple', params: { required: ['elementId'] } },
    'windows: scrollIntoView': { command: 'emScrollIntoView', params: { required: ['elementId'] } },
    'windows: selectedItem': { command: 'emSelectedItem', params: { required: ['elementId'] } },
    'windows: allSelectedItems': { command: 'emAllSelectedItems', params: { required: ['elementId'] } },
    'windows: addToSelection': { command: 'emAddToSelection', params: { required: ['elementId'] } },
    'windows: removeFromSelection': { command: 'emRemoveFromSelection', params: { required: ['elementId'] } },
    'windows: select': { command: 'emSelect', params: { required: ['elementId'] } },
    'windows: toggle': { command: 'emToggle', params: { required: ['elementId'] } },
    'windows: setValue': { command: 'emSetValue', params: { required: ['elementId', 'value'] } },
    'windows: getValue': { command: 'emGetValue', params: { required: ['elementId'] } },
    'windows: maximize': { command: 'emMaximize', params: { required: ['elementId'] } },
    'windows: minimize': { command: 'emMinimize', params: { required: ['elementId'] } },
    'windows: restore': { command: 'emRestore', params: { required: ['elementId'] } },
    'windows: close': { command: 'emClose', params: { required: ['elementId'] } },
    'windows: closeApp': { command: 'windowsCloseApp' },
    'windows: launchApp': { command: 'windowsLaunchApp' },
    'windows: keys': { command: 'emKeys', params: { required: ['actions'], optional: ['forceUnicode'] } },
    'windows: click': {
        command: 'emClick',
        params: { optional: ['elementId', 'x', 'y', 'button', 'modifierKeys', 'durationMs', 'times', 'interClickDelayMs'] },
    },
    'windows: hover': {
        command: 'emHover',
        params: { optional: ['startElementId', 'startX', 'startY', 'endElementId', 'endX', 'endY', 'modifierKeys', 'durationMs'] },
    },
    'windows: scroll': {
        command: 'emScroll',
        params: { optional: ['elementId', 'x', 'y', 'deltaX', 'deltaY', 'modifierKeys'] },
    },
    'windows: setFocus': { command: 'emSetFocus', params: { required: ['elementId'] } },
    'windows: getClipboard': { command: 'getClipboardBase64', params: { optional: ['contentType'] } },
    'windows: setClipboard': {
        command: 'emSetClipboard',
        params: { required: ['b64Content'], optional: ['contentType'] },
    },
    'windows: startRecordingScreen': {
        command: 'emStartRecordingScreen',
        params: {
            optional: [
                'outputPath', 'timeLimit', 'videoFps', 'videoFilter', 'preset',
                'captureCursor', 'captureClicks', 'audioInput', 'forceRestart',
            ],
        },
    },
    'windows: stopRecordingScreen': {
        command: 'emStopRecordingScreen',
        params: { optional: ['remotePath', 'user', 'pass', 'method', 'headers', 'fileFieldName', 'formFields'] },
    },
    'windows: deleteFile': { command: 'emDeleteFile', params: { required: ['path'] } },
    'windows: deleteFolder': { command: 'emDeleteFolder', params: { required: ['path'], optional: ['recursive'] } },
    'windows: clickAndDrag': {
        command: 'emClickAndDrag',
        params: {
            optional: [
                'startElementId', 'startX', 'startY', 'endElementId', 'endX', 'endY',
                'modifierKeys', 'durationMs', 'button',
            ],
        },
    },
    'windows: getDeviceTime': { command: 'emGetDeviceTime', params: { optional: ['format'] } },
    'windows: getWindowElement': { command: 'getWindowElement' },
    'windows: getMonitors': { command: 'windowsGetMonitors' },
    'windows: getDpiScale': { command: 'emGetDpiScale' },
    'windows: attachJavaSwing': { command: 'emAttachJavaSwing', params: { optional: ['jdkPath'] } },
    'windows: attachDotnetBridge': { command: 'emAttachDotnetBridge', params: {} },
    'windows: findElementViaDotnetBridge': {
        command: 'emFindElementViaDotnetBridge',
        params: { required: ['using', 'value'], optional: ['contextElementId'] },
    },
    'windows: findElementsViaDotnetBridge': {
        command: 'emFindElementsViaDotnetBridge',
        params: { required: ['using', 'value'], optional: ['contextElementId'] },
    },
    'windows: getPageSourceViaDotnetBridge': {
        command: 'emGetPageSourceViaDotnetBridge',
        params: { optional: ['contextElementId'] },
    },
    'windows: switchToWindowByTitle': {
        command: 'emSwitchToWindowByTitle',
        params: { optional: ['title', 'exact'] },
    },
    'windows: getWindows': { command: 'windowsGetWindows' },
    'windows: getPerfMetrics': { command: 'windowsGetPerfMetrics' },
    'windows: resetPerfMetrics': { command: 'windowsResetPerfMetrics' },
    'windows: getNativeChildren': { command: 'emGetNativeChildren', params: { required: ['elementId'] } },
};
