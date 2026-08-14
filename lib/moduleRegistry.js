import {buildClock} from '../modules/clock.js';
import {buildWorkspaces} from '../modules/workspaces.js';
import {buildActivities} from '../modules/activities.js';

const registry = {
    clock: buildClock,
    workspaces: buildWorkspaces,
    activities: buildActivities,
};

export function resolveBuiltin(id) {
    const factory = registry[id];
    return factory ? factory() : null;
}
