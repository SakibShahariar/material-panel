/**
 * end-4 QS sidebar sections: compact notification list + mini calendar.
 */
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {listNotifications} from '../modules/notifications.js';

export function buildEnd4NotiSection() {
    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti',
    });

    const list = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti-list',
    });
    outer.add_child(list);

    const footer = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti-footer',
    });
    const countLbl = new St.Label({
        text: '0 notifications',
        style_class: 'material-panel-qs-end4-noti-count',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    footer.add_child(countLbl);
    outer.add_child(footer);

    const rebuild = () => {
        list.destroy_all_children();
        const items = listNotifications().slice(0, 5);
        countLbl.text = `${items.length} notification${items.length === 1 ? '' : 's'}`;
        if (items.length === 0) {
            list.add_child(new St.Label({
                text: 'No notifications',
                style_class: 'material-panel-qs-bt-empty',
            }));
            return;
        }
        for (const it of items) {
            const row = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                style_class: 'material-panel-qs-end4-noti-row',
                reactive: true,
            });
            try {
                row.style = 'background-color: rgba(255,255,255,0.06); border-radius: 14px; padding: 8px 10px; margin-bottom: 6px;';
            } catch (e) {}
            const title = new St.Label({
                text: it.title || it.appName || 'Notification',
                style_class: 'material-panel-qs-end4-noti-title',
            });
            try { title.style = 'font-weight: 700; font-size: 12px;'; } catch (e) {}
            row.add_child(title);
            if (it.body) {
                const body = new St.Label({
                    text: it.body.slice(0, 80),
                    style_class: 'material-panel-qs-end4-noti-body',
                });
                try { body.style = 'font-size: 11px; opacity: 0.75;'; } catch (e) {}
                row.add_child(body);
            }
            row.connect('button-press-event', () => {
                try {
                    it.notification?.activate?.();
                } catch (e) {}
                return Clutter.EVENT_STOP;
            });
            list.add_child(row);
        }
    };

    rebuild();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => {
        try { rebuild(); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    });
    outer.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });

    return outer;
}

export function buildEnd4CalendarSection() {
    const now = GLib.DateTime.new_now_local();
    let year = now.get_year();
    let month = now.get_month(); // 1-12

    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal',
    });
    try {
        outer.style = 'background-color: rgba(255,255,255,0.06); border-radius: 16px; padding: 10px;';
    } catch (e) {}

    const hdr = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal-hdr',
    });
    const title = new St.Label({
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-qs-end4-cal-title',
    });
    try { title.style = 'font-weight: 700; font-size: 13px;'; } catch (e) {}
    const prev = new St.Button({
        label: '‹',
        style_class: 'material-panel-qs-end4-cal-nav',
        reactive: true,
    });
    const next = new St.Button({
        label: '›',
        style_class: 'material-panel-qs-end4-cal-nav',
        reactive: true,
    });
    hdr.add_child(prev);
    hdr.add_child(title);
    hdr.add_child(next);
    outer.add_child(hdr);

    const grid = new St.Widget({
        style_class: 'material-panel-qs-end4-cal-grid',
        x_expand: true,
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: true,
            column_spacing: 2,
            row_spacing: 2,
        }),
    });
    outer.add_child(grid);

    const rebuild = () => {
        grid.destroy_all_children();
        const gl = grid.layout_manager;
        const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
        title.text = first.format('%B %Y') ?? `${month}/${year}`;
        const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
        for (let c = 0; c < 7; c++) {
            const lab = new St.Label({
                text: days[c],
                x_align: Clutter.ActorAlign.CENTER,
            });
            try { lab.style = 'font-size: 10px; opacity: 0.6;'; } catch (e) {}
            gl.attach(lab, c, 0, 1, 1);
        }
        // Monday-based
        let dow = first.get_day_of_week(); // 1=Mon .. 7=Sun
        const startCol = dow - 1;
        const daysInMonth = first.get_days_in_month();
        const today = GLib.DateTime.new_now_local();
        for (let d = 1; d <= daysInMonth; d++) {
            const idx = startCol + d - 1;
            const r = Math.floor(idx / 7) + 1;
            const c = idx % 7;
            const isToday = today.get_year() === year && today.get_month() === month && today.get_day_of_month() === d;
            const cell = new St.Label({
                text: String(d),
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                cell.style = isToday
                    ? 'font-size: 11px; font-weight: 700; background-color: #f5b8d0; color: #1a1a1a; border-radius: 999px; min-width: 22px; min-height: 22px;'
                    : 'font-size: 11px; min-width: 22px; min-height: 22px;';
            } catch (e) {}
            gl.attach(cell, c, r, 1, 1);
        }
    };

    prev.connect('clicked', () => {
        month -= 1;
        if (month < 1) {
            month = 12;
            year -= 1;
        }
        rebuild();
    });
    next.connect('clicked', () => {
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
        rebuild();
    });
    rebuild();
    return outer;
}
