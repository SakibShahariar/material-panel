import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from '../lib/configStore.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

function formatNow(use12h) {
    const now = GLib.DateTime.new_now_local();
    const fmt = use12h ? '%a, %d %b  %l:%M %p' : '%a, %d %b  %H:%M';
    return (now.format(fmt) ?? '').replace(/\s+/g, ' ').trim();
}

function buildCalendarActor(year, month /* 1-12 */) {
    // month is 1-12
    const outer = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-cal',
        x_expand: true,
    });
    const title = new St.Label({
        text: GLib.DateTime.new_local(year, month, 1, 0, 0, 0).format('%B %Y') ?? '',
        style_class: 'material-panel-clock-cal-title',
    });
    outer.add_child(title);

    const dow = new St.BoxLayout({style_class: 'material-panel-clock-cal-dow', x_expand: true});
    for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
        const l = new St.Label({text: d, style_class: 'material-panel-clock-cal-dow-label', x_expand: true});
        dow.add_child(l);
    }
    outer.add_child(dow);

    // Monday-first grid
    const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
    let startDow = first.get_day_of_week(); // 1=Mon .. 7=Sun
    const daysInMonth = first.get_days_in_month();
    const today = GLib.DateTime.new_now_local();
    const isThisMonth = today.get_year() === year && today.get_month() === month;
    const todayDay = today.get_day_of_month();

    let day = 1;
    for (let row = 0; row < 6; row++) {
        const line = new St.BoxLayout({style_class: 'material-panel-clock-cal-row', x_expand: true});
        for (let col = 0; col < 7; col++) {
            const cellIndex = row * 7 + col;
            const cell = new St.Label({
                text: ' ',
                style_class: 'material-panel-clock-cal-day',
                x_expand: true,
            });
            if (cellIndex >= startDow - 1 && day <= daysInMonth) {
                cell.text = String(day);
                if (isThisMonth && day === todayDay)
                    cell.add_style_class_name('today');
                day++;
            }
            line.add_child(cell);
        }
        outer.add_child(line);
        if (day > daysInMonth)
            break;
    }
    return outer;
}

export function buildClock() {
    const label = new St.Label({
        style_class: 'material-panel-clock',
        y_align: Clutter.ActorAlign.CENTER,
        text: '',
        reactive: true,
    });

    const store = new ConfigStore();
    let use12h = store.load().clockFormat === '12h';

    const update = () => {
        label.text = formatNow(use12h);
        return GLib.SOURCE_CONTINUE;
    };
    update();
    const sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, update);
    store.watch(cfg => {
        use12h = cfg.clockFormat === '12h';
        update();
    });

    const button = new St.Button({
        style_class: 'material-panel-clock-btn',
        reactive: true,
        child: label,
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-clock-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    menu.addMenuItem(section);

    const rebuildCal = () => {
        section.actor.destroy_all_children();
        const now = GLib.DateTime.new_now_local();
        const big = new St.Label({
            text: now.format(use12h ? '%l:%M %p' : '%H:%M')?.trim() ?? '',
            style_class: 'material-panel-clock-popup-time',
        });
        const date = new St.Label({
            text: now.format('%A, %d %B %Y') ?? '',
            style_class: 'material-panel-clock-popup-date',
        });
        section.actor.add_child(big);
        section.actor.add_child(date);
        section.actor.add_child(buildCalendarActor(now.get_year(), now.get_month()));
    };

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            rebuildCal();
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else
            menu.open();
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(sourceId); } catch (e) {}
        try { store.unwatch(); } catch (e) {}
        menu.destroy();
    });

    return button;
}
