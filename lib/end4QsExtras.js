/**
 * end-4 QS sections: notification list + compact calendar.
 */
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {listNotifications} from '../modules/notifications.js';

function style(actor, css) {
    try { actor.style = css; } catch (e) {}
}

export function buildEnd4NotiSection() {
    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti',
    });
    style(outer, 'spacing: 6px;');

    const list = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti-list',
    });
    outer.add_child(list);

    const countLbl = new St.Label({
        text: '0 notifications',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    style(countLbl, 'font-size: 11px; opacity: 0.7; padding: 4px;');
    outer.add_child(countLbl);

    const rebuild = () => {
        list.destroy_all_children();
        const items = listNotifications().slice(0, 4);
        countLbl.text = `${items.length} notification${items.length === 1 ? '' : 's'}`;
        if (items.length === 0) {
            const empty = new St.Label({
                text: 'No notifications',
                x_align: Clutter.ActorAlign.CENTER,
            });
            style(empty, 'font-size: 12px; opacity: 0.55; padding: 6px;');
            list.add_child(empty);
            return;
        }
        for (const it of items) {
            const row = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                reactive: true,
            });
            style(row, 'background-color: rgba(255,255,255,0.07); border-radius: 12px; padding: 8px 10px;');
            const title = new St.Label({text: (it.title || it.appName || 'Notification').slice(0, 40)});
            style(title, 'font-weight: 700; font-size: 12px;');
            row.add_child(title);
            if (it.body) {
                const body = new St.Label({text: it.body.slice(0, 60)});
                style(body, 'font-size: 11px; opacity: 0.7;');
                row.add_child(body);
            }
            row.connect('button-press-event', () => {
                try { it.notification?.activate?.(); } catch (e) {}
                return Clutter.EVENT_STOP;
            });
            list.add_child(row);
        }
    };

    rebuild();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
        try { rebuild(); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    });
    outer.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });
    return outer;
}

export function buildEnd4CalendarSection() {
    let year, month;
    {
        const now = GLib.DateTime.new_now_local();
        year = now.get_year();
        month = now.get_month(); // 1–12
    }

    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal',
    });
    style(outer, 'background-color: rgba(255,255,255,0.07); border-radius: 14px; padding: 10px 6px; spacing: 6px;');

    // Header: ‹  Month Year  ›
    const hdr = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const prev = new St.Button({label: '‹', reactive: true});
    style(prev, 'width: 28px; height: 28px; border-radius: 999px; background-color: rgba(255,255,255,0.08);');
    const title = new St.Label({
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { title.clutter_text.ellipsize = 3; } catch (e) {}
    style(title, 'font-weight: 700; font-size: 13px;');
    const next = new St.Button({label: '›', reactive: true});
    style(next, 'width: 28px; height: 28px; border-radius: 999px; background-color: rgba(255,255,255,0.08);');
    hdr.add_child(prev);
    hdr.add_child(title);
    hdr.add_child(next);
    outer.add_child(hdr);

    // Day-of-week headers
    const dowRow = new St.BoxLayout({vertical: false, x_expand: true});
    style(dowRow, 'spacing: 0;');
    for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
        const lab = new St.Label({
            text: d,
            x_align: Clutter.ActorAlign.CENTER,
        });
        style(lab, 'font-size: 10px; opacity: 0.55; width: 36px; text-align: center;');
        try { lab.width = 36; } catch (e) {}
        dowRow.add_child(lab);
    }
    outer.add_child(dowRow);

    // Days grid — fixed 7 columns via BoxLayout rows (avoids GridLayout width blow-up)
    const daysBox = new St.BoxLayout({vertical: true, x_expand: true});
    style(daysBox, 'spacing: 2px;');
    outer.add_child(daysBox);

    const rebuild = () => {
        daysBox.destroy_all_children();
        const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
        if (!first) {
            title.text = `${month}/${year}`;
            return;
        }
        title.text = first.format('%B %Y') || `${month}/${year}`;

        // Monday=1 … Sunday=7
        const startCol = first.get_day_of_week() - 1;
        const daysInMonth = GLib.Date.get_days_in_month(month, year);
        const today = GLib.DateTime.new_now_local();
        const isThisMonth = today.get_year() === year && today.get_month() === month;
        const todayDay = today.get_day_of_month();

        // cells: leading blanks + days
        const cells = [];
        for (let i = 0; i < startCol; i++)
            cells.push(null);
        for (let d = 1; d <= daysInMonth; d++)
            cells.push(d);
        while (cells.length % 7 !== 0)
            cells.push(null);

        for (let i = 0; i < cells.length; i += 7) {
            const row = new St.BoxLayout({vertical: false, x_expand: true});
            style(row, 'spacing: 0;');
            for (let c = 0; c < 7; c++) {
                const d = cells[i + c];
                if (d === null) {
                    const spacer = new St.Widget();
                    try { spacer.width = 36; spacer.height = 28; } catch (e) {}
                    row.add_child(spacer);
                    continue;
                }
                const isToday = isThisMonth && d === todayDay;
                const wrap = new St.Bin({x_expand: false});
                try { wrap.width = 36; wrap.height = 28; } catch (e) {}
                const lab = new St.Label({
                    text: String(d),
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                if (isToday) {
                    const bub = new St.Bin({
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                    });
                    try { bub.width = 26; bub.height = 26; } catch (e) {}
                    style(bub, 'width: 26px; height: 26px; background-color: #f5b8d0; border-radius: 999px;');
                    style(lab, 'font-size: 11px; font-weight: 700; color: #1a1a1a;');
                    bub.set_child(lab);
                    wrap.set_child(bub);
                } else {
                    style(lab, 'font-size: 11px; opacity: 0.9;');
                    wrap.set_child(lab);
                }
                row.add_child(wrap);
            }
            daysBox.add_child(row);
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
