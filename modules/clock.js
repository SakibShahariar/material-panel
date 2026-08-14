import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

export function buildClock() {
    const label = new St.Label({
        style_class: 'material-panel-clock',
        y_align: Clutter.ActorAlign.CENTER,
        text: '',
    });

    const update = () => {
        const now = GLib.DateTime.new_now_local();
        label.text = now.format('%H:%M') ?? '';
        return GLib.SOURCE_CONTINUE;
    };
    update();
    const sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, update);

    label.connect('destroy', () => GLib.source_remove(sourceId));

    return label;
}
