import St from 'gi://St';
import Clutter from 'gi://Clutter';

// A minimal draggable slider built from plain St primitives (width,
// background-color, border-radius) rather than GNOME's own Slider actor,
// whose CSS theming properties (-slider-*) proved unreliable to get right
// from outside gnome-shell's own stylesheet after two failed attempts.
// Fixed pixel width rather than reading allocation at runtime - simpler,
// deterministic, and matches how every other sized element in this
// project (workspace pills, chips) is already built.
const TRACK_WIDTH = 200;
const TRACK_HEIGHT = 16;
const KNOB_SIZE = 16;

export function createSlider({initialValue = 0, onChange}) {
    const container = new St.Widget({
        reactive: true,
        style_class: 'material-panel-simple-slider',
        y_align: Clutter.ActorAlign.CENTER,
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
    container.add_child(fill);
    container.add_child(knob);

    let value = initialValue;
    let dragging = false;

    const applyValue = (v, emit) => {
        value = Math.max(0, Math.min(1, v));
        const fillPx = Math.round(TRACK_WIDTH * value);
        fill.width = fillPx;
        knob.set_position(Math.max(0, Math.min(TRACK_WIDTH - KNOB_SIZE, fillPx - KNOB_SIZE / 2)), 0);
        if (emit && onChange)
            onChange(value);
    };

    const setFromEventX = event => {
        const [containerX] = container.get_transformed_position();
        const [eventX] = event.get_coords();
        applyValue((eventX - containerX) / TRACK_WIDTH, true);
    };

    container.connect('button-press-event', (_a, event) => {
        dragging = true;
        setFromEventX(event);
        return Clutter.EVENT_STOP;
    });
    container.connect('motion-event', (_a, event) => {
        if (dragging)
            setFromEventX(event);
        return Clutter.EVENT_STOP;
    });
    container.connect('button-release-event', () => {
        dragging = false;
        return Clutter.EVENT_STOP;
    });
    container.connect('leave-event', () => {
        dragging = false;
        return Clutter.EVENT_PROPAGATE;
    });

    applyValue(initialValue, false);

    return {
        actor: container,
        // setValue: for programmatic updates (e.g. syncing from an
        // external volume change) without re-emitting onChange, which
        // would otherwise cause a feedback loop.
        setValue: v => applyValue(v, false),
        getValue: () => value,
    };
}
