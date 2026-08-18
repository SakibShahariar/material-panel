import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

// A minimal draggable slider built from plain St primitives, rather than
// GNOME's own Slider actor (whose CSS theming properties proved
// unreliable to get right from outside gnome-shell's own stylesheet).
//
// The track is an explicit child widget, not the container's own
// background - the container's background silently failed to render in
// testing, while a child widget's background-color (same technique as
// `fill`) is proven to work.
const TRACK_WIDTH = 200;
const TRACK_HEIGHT = 16;
const KNOB_SIZE = 16;

// onChange callbacks here do real, expensive work (spawning brightnessctl,
// pushing a volume change to PipeWire) - calling that on every single
// motion-event during a drag (which can fire dozens of times per second)
// caused visibly bad performance, especially for brightness where each
// call spawns a whole new process. Visual feedback (fill/knob position)
// stays instant on every event; the onChange callback itself is
// throttled to this interval, with a guaranteed final call on release so
// the exact released value always actually gets committed.
const EMIT_THROTTLE_MS = 80;

export function createSlider({initialValue = 0, onChange}) {
    const container = new St.Widget({
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
    });
    const track = new St.Widget({
        style_class: 'material-panel-simple-slider-track',
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
    });
    const fill = new St.Widget({
        style_class: 'material-panel-simple-slider-fill',
        height: TRACK_HEIGHT,
    });
    const knob = new St.Widget({
        style_class: 'material-panel-simple-slider-knob',
        width: KNOB_SIZE,
        height: KNOB_SIZE,
    });
    container.add_child(track);
    container.add_child(fill);
    container.add_child(knob);

    let value = initialValue;
    let dragging = false;
    let throttleTimeoutId = null;

    const updateVisual = v => {
        value = Math.max(0, Math.min(1, v));
        const fillPx = Math.round(TRACK_WIDTH * value);
        fill.width = fillPx;
        knob.set_position(Math.max(0, Math.min(TRACK_WIDTH - KNOB_SIZE, fillPx - KNOB_SIZE / 2)), 0);
    };

    const emitNow = () => {
        if (onChange)
            onChange(value);
    };

    // Trailing-edge throttle: at most one onChange call per
    // EMIT_THROTTLE_MS, always using whatever the value is at the moment
    // the timer actually fires (not whatever it was when scheduled) - so
    // rapid drag updates collapse into the latest value, not a stale one.
    const emitThrottled = () => {
        if (throttleTimeoutId)
            return;
        throttleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, EMIT_THROTTLE_MS, () => {
            throttleTimeoutId = null;
            emitNow();
            return GLib.SOURCE_REMOVE;
        });
    };

    const cancelThrottle = () => {
        if (throttleTimeoutId) {
            GLib.source_remove(throttleTimeoutId);
            throttleTimeoutId = null;
        }
    };

    const setFromEventX = event => {
        const [containerX] = container.get_transformed_position();
        const [eventX] = event.get_coords();
        updateVisual((eventX - containerX) / TRACK_WIDTH);
        emitThrottled();
    };

    // Without a device grab, motion-event only fires while the cursor is
    // physically over this actor's (narrow, 16px-tall) bounds - real drags
    // are never perfectly horizontal, so the cursor drifting even slightly
    // off the track mid-drag would silently stop the slider from tracking,
    // requiring a fresh press to resume. Grabbing the device on press
    // makes it keep delivering events to us regardless of where the
    // cursor actually is on screen, until we explicitly ungrab on release
    // - the same technique GNOME Shell's own Slider actor uses internally.
    container.connect('button-press-event', (_a, event) => {
        dragging = true;
        event.get_device().grab(container);
        setFromEventX(event);
        return Clutter.EVENT_STOP;
    });
    container.connect('motion-event', (_a, event) => {
        if (dragging)
            setFromEventX(event);
        return Clutter.EVENT_STOP;
    });
    container.connect('button-release-event', (_a, event) => {
        if (dragging) {
            dragging = false;
            event.get_device().ungrab();
            // Guaranteed final commit at the exact released position, even
            // if a throttle window was still pending.
            cancelThrottle();
            emitNow();
        }
        return Clutter.EVENT_STOP;
    });
    container.connect('destroy', () => cancelThrottle());

    updateVisual(initialValue);

    return {
        actor: container,
        // setValue: for programmatic updates (e.g. syncing from an
        // external volume change) without re-emitting onChange, which
        // would otherwise cause a feedback loop.
        setValue: v => updateVisual(v),
        getValue: () => value,
    };
}
