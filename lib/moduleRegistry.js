import {buildClock} from '../modules/clock.js';
import {buildWorkspaces} from '../modules/workspaces.js';
import {buildActivities} from '../modules/activities.js';
import {buildBattery} from '../modules/battery.js';
import {buildVolume} from '../modules/volume.js';
import {buildNetwork} from '../modules/network.js';

const registry = {
    clock: buildClock,
    workspaces: buildWorkspaces,
    activities: buildActivities,
    battery: buildBattery,
    volume: buildVolume,
    network: buildNetwork,
};

// extensionPath is passed to every factory (even ones that don't use it,
// like clock/workspaces) so the signature stays uniform - simpler than
// tracking which modules need it.
export function resolveBuiltin(id, extensionPath) {
    const factory = registry[id];
    return factory ? factory(extensionPath) : null;
}

// Distinguishes "id not in registry" (a config typo - worth logging) from
// "id is registered but its factory intentionally returned null" (e.g.
// battery module on a desktop with no battery - not an error).
export function hasBuiltin(id) {
    return Object.prototype.hasOwnProperty.call(registry, id);
}
