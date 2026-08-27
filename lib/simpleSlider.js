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

    const setFromEventX = (event, immediate = false) => {
        const [containerX] = container.get_transformed_position();
        const [eventX] = event.get_coords();
        updateVisual((eventX - containerX) / TRACK_WIDTH);
        if (immediate) {
            cancelThrottle();
            emitNow();
        } else {
            emitThrottled();
        }
    };

    // Shell 50: Clutter.Event.get_device() was removed — guard it and
    // fall back to stage-level captured-event motion tracking so a drag
    // still follows the cursor even if it leaves the 16px track. This
    // matches the technique used in end4/Noctalia sliders (track + grab
    // fallback) and fixes the JS ERROR at simpleSlider.js:111 seen in
    // journalctl.
    let stageMotionId = 0;
    let stageReleaseId = 0;

    const tryGrab = (event, actor) => {
        try {
            if (event && typeof event.get_device === 'function') {
                event.get_device().grab(actor);
                return true;
            }
            if (event && typeof event.get_seat === 'function') {
                event.get_seat().grab(actor);
                return true;
            }
        } catch (e) {}
        return false;
    };
    const tryUngrab = event => {
        try {
            if (event && typeof event.get_device === 'function') {
                event.get_device().ungrab();
                return true;
            }
            if (event && typeof event.get_seat === 'function') {
                event.get_seat().ungrab();
                return true;
            }
        } catch (e) {}
        return false;
    };
    const attachStageDrag = () => {
        if (stageMotionId || stageReleaseId)
            return;
        // Stage-level fallback: keeps tracking even when cursor leaves
        // the narrow track while dragging.
        stageMotionId = global.stage.connect('captured-event', (_actor, ev) => {
            if (!dragging)
                return Clutter.EVENT_PROPAGATE;
            if (ev.type() === Clutter.EventType.MOTION) {
                setFromEventX(ev, false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        stageReleaseId = global.stage.connect('captured-event', (_actor, ev) => {
            if (!dragging)
                return Clutter.EVENT_PROPAGATE;
            if (ev.type() === Clutter.EventType.BUTTON_RELEASE) {
                dragging = false;
                tryUngrab(ev);
                if (stageMotionId) {
                    global.stage.disconnect(stageMotionId);
                    stageMotionId = 0;
                }
                if (stageReleaseId) {
                    const id = stageReleaseId;
                    stageReleaseId = 0;
                    // disconnect after current handler returns to avoid
                    // disconnecting while emitting
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        try { global.stage.disconnect(id); } catch (e) {}
                        return GLib.SOURCE_REMOVE;
                    });
                }
                cancelThrottle();
                emitNow();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    };
    const detachStageDrag = () => {
        if (stageMotionId) {
            try { global.stage.disconnect(stageMotionId); } catch (e) {}
            stageMotionId = 0;
        }
        if (stageReleaseId) {
            try { global.stage.disconnect(stageReleaseId); } catch (e) {}
            stageReleaseId = 0;
        }
    };

    container.connect('button-press-event', (_a, event) => {
        dragging = true;
        const grabbed = tryGrab(event, container);
        if (!grabbed)
            attachStageDrag();
        setFromEventX(event, true);
        return Clutter.EVENT_STOP;
    });
    container.connect('motion-event', (_a, event) => {
        if (dragging)
            setFromEventX(event, false);
        return Clutter.EVENT_STOP;
    });
    container.connect('button-release-event', (_a, event) => {
        if (dragging) {
            dragging = false;
            tryUngrab(event);
            detachStageDrag();
            // Guaranteed final commit at the exact released position, even
            // if a throttle window was still pending.
            cancelThrottle();
            emitNow();
        }
        return Clutter.EVENT_STOP;
    });
    container.connect('destroy', () => {
        detachStageDrag();
        cancelThrottle();
    });

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
