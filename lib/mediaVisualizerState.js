/**
 * Module-scoped preference controlling the optional media playback visualizer.
 * The extension owns updates and resets the value during teardown.
 */
let enabled = false;

export function setMediaVisualizerEnabled(value) {
    enabled = value === true;
}

export function isMediaVisualizerEnabled() {
    return enabled;
}

export function clearMediaVisualizerState() {
    enabled = false;
}
