// Shell-side registry only. Factories import St/Clutter/Main — never load
// this file from prefs.js. Use lib/moduleIds.js for prefs-safe lookups.

import {buildClock} from '../modules/clock.js';
import {buildWorkspaces} from '../modules/workspaces.js';
import {buildActivities} from '../modules/activities.js';
import {buildBattery} from '../modules/battery.js';
import {buildVolume} from '../modules/volume.js';
import {buildNetwork} from '../modules/network.js';
import {buildNetworkSpeed} from '../modules/networkSpeed.js';
import {buildWeather} from '../modules/weather.js';
import {buildNotifications} from '../modules/notifications.js';
import {buildDarkMode} from '../modules/darkmode.js';
import {buildNightLight} from '../modules/nightlight.js';
import {buildDnd} from '../modules/dnd.js';
import {buildPowerMenu} from '../modules/powermenu.js';
import {buildBluetooth} from '../modules/bluetooth.js';
import {buildQuickSettings} from '../modules/quicksettings.js';
import {buildQuickSettingsEnd4} from '../modules/quicksettingsEnd4.js';
import {buildCpu} from '../modules/cpu.js';
import {buildMedia} from '../modules/mediaPlayer.js';
import {buildFocusedWindow} from '../modules/focusedWindow.js';
import {buildBtConnected} from '../modules/btConnected.js';

import {hasBuiltin as hasBuiltinId} from './moduleIds.js';

const registry = {
    clock: buildClock,
    workspaces: buildWorkspaces,
    activities: buildActivities,
    battery: buildBattery,
    volume: buildVolume,
    network: buildNetwork,
    networkSpeed: buildNetworkSpeed,
    weather: buildWeather,
    notifications: buildNotifications,
    darkmode: buildDarkMode,
    nightlight: buildNightLight,
    dnd: buildDnd,
    powermenu: buildPowerMenu,
    bluetooth: buildBluetooth,
    quicksettings: (path, scale) => {
        if (globalThis._materialPanelLayoutStyle === 'end4')
            return buildQuickSettingsEnd4(path, scale);
        return buildQuickSettings(path, scale);
    },
    cpu: buildCpu,
    media: buildMedia,
    focusedWindow: buildFocusedWindow,
    btConnected: buildBtConnected,
};

// extensionPath and scale are passed to every factory (even ones that
// don't use them, like clock/workspaces) so the signature stays uniform -
// simpler than tracking which modules need what.
export function resolveBuiltin(id, extensionPath, scale) {
    const factory = registry[id];
    return factory ? factory(extensionPath, scale) : null;
}

// Distinguishes "id not in registry" (a config typo - worth logging) from
// "id is registered but its factory intentionally returned null" (e.g.
// battery module on a desktop with no battery - not an error).
export function hasBuiltin(id) {
    return hasBuiltinId(id);
}
