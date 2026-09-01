import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from '../lib/configStore.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

const CELL = 32; // fixed day cell size — avoids x_expand collapse in popup menus

function formatNow(use12h) {
    const now = GLib.DateTime.new_now_local();
    const fmt = use12h ? '%a, %d %b  %l:%M %p' : '%a, %d %b  %H:%M';
    return (now.format(fmt) ?? '').replace(/\s+/g, ' ').trim();
}

function daysInMonth(year, month) {
    try {
        return GLib.Date.get_days_in_month(month, year);
    } catch (e) {
        return new Date(year, month, 0).getDate();
    }
}

function buildCalendarActor(year, month) {
    const outer = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-cal',
    });
    const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
    outer.add_child(new St.Label({
        text: first.format('%B %Y') ?? `${month}/${year}`,
        style_class: 'material-panel-clock-cal-title',
    }));

    const grid = new St.Widget({
        style_class: 'material-panel-clock-cal-grid',
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
            column_spacing: 2,
            row_spacing: 2,
        }),
    });
    const gl = grid.layout_manager;

    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    for (let c = 0; c < 7; c++) {
        const lab = new St.Label({
            text: days[c],
            style_class: 'material-panel-clock-cal-dow-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            width: CELL,
            height: 20,
        });
        gl.attach(lab, c, 0, 1, 1);
    }

    const startDow = first.get_day_of_week(); // 1=Mon..7=Sun
    const dim = daysInMonth(year, month);
    const today = GLib.DateTime.new_now_local();
    const isThisMonth = today.get_year() === year && today.get_month() === month;
    const todayDay = today.get_day_of_month();

    let day = 1;
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const cellIndex = row * 7 + col;
            const cell = new St.Button({
                style_class: 'material-panel-clock-cal-day',
                reactive: false,
                width: CELL,
                height: CELL,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            if (cellIndex >= startDow - 1 && day <= dim) {
                cell.set_label(String(day));
                if (isThisMonth && day === todayDay)
                    cell.add_style_class_name('today');
                day++;
            }
            gl.attach(cell, col, row + 1, 1, 1);
        }
        if (day > dim)
            break;
    }

    outer.add_child(grid);
    return outer;
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

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-popup-body',
    });
    const timeLabel = new St.Label({text: '—', style_class: 'material-panel-clock-popup-time'});
    const dateLabel = new St.Label({text: '—', style_class: 'material-panel-clock-popup-date'});
    const calHost = new St.BoxLayout({vertical: true, style_class: 'material-panel-clock-cal-host'});
    body.add_child(timeLabel);
    body.add_child(dateLabel);
    body.add_child(calHost);

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const rebuildCal = () => {
        const now = GLib.DateTime.new_now_local();
        timeLabel.text = (now.format(use12h ? '%l:%M %p' : '%H:%M') ?? '').trim();
        dateLabel.text = now.format('%A, %d %B %Y') ?? '';
        calHost.destroy_all_children();
        calHost.add_child(buildCalendarActor(now.get_year(), now.get_month()));
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
