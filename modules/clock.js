import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {ConfigStore} from '../lib/configStore.js';

// clockFormat: '24h' (default) or '12h' (AM/PM)
function formatNow(use12h) {
    const now = GLib.DateTime.new_now_local();
    // 12h: "Fri, 14 Aug  6:47 PM"  |  24h: "Fri, 14 Aug  18:47"
    const fmt = use12h ? '%a, %d %b  %l:%M %p' : '%a, %d %b  %H:%M';
    return (now.format(fmt) ?? '').replace(/\s+/g, ' ').trim();
}

export function buildClock() {
    const label = new St.Label({
        style_class: 'material-panel-clock',
        y_align: Clutter.ActorAlign.CENTER,
        text: '',
    });

    const store = new ConfigStore();
    let use12h = store.load().clockFormat === '12h';

    const update = () => {
        label.text = formatNow(use12h);
        return GLib.SOURCE_CONTINUE;
    };
    update();
    // 1s keeps minute and AM/PM transitions accurate
    const sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, update);

    store.watch(cfg => {
        use12h = cfg.clockFormat === '12h';
        update();
    });

    label.connect('destroy', () => {
        try { GLib.source_remove(sourceId); } catch (e) {}
        try { store.unwatch(); } catch (e) {}
    });

    return label;
}
