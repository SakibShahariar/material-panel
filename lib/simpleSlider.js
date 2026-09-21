import Atk from 'gi://Atk';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

// Soft end-4 style slider: tall pill track, primary fill, floating white knob.
const DEFAULT_TRACK_WIDTH = 200;
const TRACK_HEIGHT = 28;
const KNOB_SIZE = 22;
const EMIT_THROTTLE_MS = 80;

function primary() {
    return globalThis._materialPanelPrimary ?? '#89b4fa';
}

export function createSlider({initialValue = 0, onChange, width = DEFAULT_TRACK_WIDTH}) {
    const TRACK_WIDTH = Math.max(48, Math.round(width));
    const container = new St.Widget({
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: false,
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
    });
    try {
        container.style = `width: ${TRACK_WIDTH}px; height: ${TRACK_HEIGHT}px;`;
    } catch (e) {}

    const track = new St.Widget({
        style_class: 'material-panel-simple-slider-track',
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
    });
    try {
        // ~22% white — readable on dark capsule/surface (was 10%, invisible on dual-slider)
        track.style =
            `width: ${TRACK_WIDTH}px; height: ${TRACK_HEIGHT}px;`
            + ' background-color: rgba(255,255,255,0.22); border-radius: 999px;';
    } catch (e) {}

    const fill = new St.Widget({
        style_class: 'material-panel-simple-slider-fill',
        height: TRACK_HEIGHT,
    });
    try {
        fill.style =
            `height: ${TRACK_HEIGHT}px; background-color: ${primary()}; border-radius: 999px;`;
    } catch (e) {}

    const knob = new St.Widget({
        style_class: 'material-panel-simple-slider-knob',
        width: KNOB_SIZE,
        height: KNOB_SIZE,
    });
    try {
        // onPrimary tracks theme; dark ring keeps contrast when fill is light primary
        const knobBg = globalThis._materialPanelOnPrimary ?? '#1e1e2e';
        knob.style =
            `width: ${KNOB_SIZE}px; height: ${KNOB_SIZE}px; background-color: ${knobBg};`
            + ' border-radius: 999px; box-shadow: 0 0 0 2px rgba(255,255,255,0.35), 0 2px 6px rgba(0,0,0,0.4);';
    } catch (e) {}

    container.add_child(track);
    container.add_child(fill);
    container.add_child(knob);

    let value = initialValue;
    let dragging = false;
    let throttleTimeoutId = null;

    const updateVisual = v => {
        value = Math.max(0, Math.min(1, v));
        const fillPx = Math.round(TRACK_WIDTH * value);
        fill.width = Math.max(KNOB_SIZE, fillPx);
        // Refresh fill color if theme changed
        try {
            fill.style =
                `height: ${TRACK_HEIGHT}px; background-color: ${primary()}; border-radius: 999px;`;
        } catch (e) {}
        const ky = Math.round((TRACK_HEIGHT - KNOB_SIZE) / 2);
        const kx = Math.max(0, Math.min(TRACK_WIDTH - KNOB_SIZE, fillPx - KNOB_SIZE / 2));
        knob.set_position(kx, ky);
    };

    const emitNow = () => {
        if (onChange)
            onChange(value);
    };

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

    let stageMotionId = 0;
    let stageReleaseId = 0;
    const tryGrab = (event, actor) => {
        try {
            if (global.display.set_cursor)
                global.display.set_cursor(0);
        } catch (e) {}
        return false;
    };
    const tryUngrab = () => {};

    const attachStageDrag = () => {
        if (stageMotionId)
            return;
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
                    global.stage.disconnect(stageReleaseId);
                    stageReleaseId = 0;
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
            global.stage.disconnect(stageMotionId);
            stageMotionId = 0;
        }
        if (stageReleaseId) {
            global.stage.disconnect(stageReleaseId);
            stageReleaseId = 0;
        }
    };

        try {
        container.can_focus = true;
        container.reactive = true;
        container.accessible_role = Atk.Role.SLIDER;
        container.accessible_name = 'Slider';
    } catch (e) {}
    container.connect('key-press-event', (_a, event) => {
        const step = 0.05;
        let sym = 0;
        try { sym = event.get_key_symbol(); } catch (e) { return Clutter.EVENT_PROPAGATE; }
        if (sym === Clutter.KEY_Left || sym === Clutter.KEY_Down || sym === Clutter.KEY_KP_Subtract) {
            updateVisual(value - step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Right || sym === Clutter.KEY_Up || sym === Clutter.KEY_KP_Add) {
            updateVisual(value + step);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Home) {
            updateVisual(0);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_End) {
            updateVisual(1);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    container.connect('scroll-event', (_a, event) => {
        let dir;
        try { dir = event.get_scroll_direction(); } catch (e) { return Clutter.EVENT_PROPAGATE; }
        if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.RIGHT) {
            updateVisual(value + 0.05);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.LEFT) {
            updateVisual(value - 0.05);
            emitNow();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

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
        setValue: v => updateVisual(v),
        getValue: () => value,
    };
}
