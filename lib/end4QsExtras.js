/**
 * end-4 QS: notification cards + calendar (reference-matched).
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
    style(outer, 'spacing: 8px;');

    const list = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti-list',
    });
    style(list, 'spacing: 6px;');
    outer.add_child(list);

    // Footer like end-4: count pill
    const footer = new St.BoxLayout({vertical: false, x_expand: true});
    style(footer, 'spacing: 8px; padding-top: 4px;');
    const countLbl = new St.Label({
        text: '0 notifications',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(countLbl, 'font-size: 11px; opacity: 0.75; background-color: rgba(255,255,255,0.08); border-radius: 999px; padding: 6px 14px;');
    footer.add_child(countLbl);
    outer.add_child(footer);

    const rebuild = () => {
        list.destroy_all_children();
        const items = listNotifications().slice(0, 5);
        countLbl.text = `${items.length} notification${items.length === 1 ? '' : 's'}`;
        if (items.length === 0) {
            const empty = new St.Label({
                text: 'No notifications',
                x_align: Clutter.ActorAlign.CENTER,
            });
            style(empty, 'font-size: 12px; opacity: 0.5; padding: 10px;');
            list.add_child(empty);
            return;
        }
        for (const it of items) {
            const row = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                reactive: true,
            });
            style(row, 'background-color: rgba(255,255,255,0.07); border-radius: 14px; padding: 10px 12px; spacing: 10px;');

            // Left app glyph
            const avatar = new St.Icon({
                icon_name: 'dialog-information-symbolic',
                icon_size: 22,
                y_align: Clutter.ActorAlign.START,
            });
            try {
                if (it.appIcon)
                    avatar.gicon = it.appIcon;
                else if (it.gicon)
                    avatar.gicon = it.gicon;
            } catch (e) {}
            row.add_child(avatar);

            const mid = new St.BoxLayout({vertical: true, x_expand: true});
            style(mid, 'spacing: 2px;');
            const title = new St.Label({text: (it.title || it.appName || 'Notification').slice(0, 42)});
            style(title, 'font-weight: 700; font-size: 12px;');
            mid.add_child(title);
            if (it.body) {
                const body = new St.Label({text: it.body.slice(0, 72)});
                try { body.clutter_text.line_wrap = true; } catch (e) {}
                style(body, 'font-size: 11px; opacity: 0.75;');
                mid.add_child(body);
            }
            row.add_child(mid);

            row.connect('button-press-event', () => {
                try { it.notification?.activate?.(); } catch (e) {}
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
    let year, month;
    {
        const now = GLib.DateTime.new_now_local();
        year = now.get_year();
        month = now.get_month();
    }

    const outer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal',
    });
    style(outer, 'background-color: rgba(255,255,255,0.07); border-radius: 16px; padding: 12px; spacing: 8px;');

    const hdr = new St.BoxLayout({vertical: false, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const prev = new St.Button({label: '‹', reactive: true});
    style(prev, 'width: 28px; height: 28px; border-radius: 999px; background-color: rgba(255,255,255,0.08);');
    const title = new St.Label({
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(title, 'font-weight: 700; font-size: 13px;');
    const next = new St.Button({label: '›', reactive: true});
    style(next, 'width: 28px; height: 28px; border-radius: 999px; background-color: rgba(255,255,255,0.08);');
    hdr.add_child(prev);
    hdr.add_child(title);
    hdr.add_child(next);
    outer.add_child(hdr);

    const CELL = 40;
    const dowRow = new St.BoxLayout({
        vertical: false,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
    });
    style(dowRow, `width: ${CELL * 7}px;`);
    try { dowRow.width = CELL * 7; } catch (e) {}
    for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
        const lab = new St.Label({
            text: d,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        style(lab, `font-size: 10px; opacity: 0.55; width: ${CELL}px;`);
        try { lab.width = CELL; } catch (e) {}
        dowRow.add_child(lab);
    }
    outer.add_child(dowRow);

    const daysBox = new St.BoxLayout({
        vertical: true,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
    });
    style(daysBox, `spacing: 4px; width: ${CELL * 7}px;`);
    try { daysBox.width = CELL * 7; } catch (e) {}
    outer.add_child(daysBox);

    const rebuild = () => {
        daysBox.destroy_all_children();
        const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
        if (!first) {
            title.text = `${month}/${year}`;
            return;
        }
        title.text = first.format('%B %Y') || `${month}/${year}`;
        const startCol = first.get_day_of_week() - 1;
        const daysInMonth = GLib.Date.get_days_in_month(month, year);
        const today = GLib.DateTime.new_now_local();
        const isThisMonth = today.get_year() === year && today.get_month() === month;
        const todayDay = today.get_day_of_month();

        const cells = [];
        for (let i = 0; i < startCol; i++)
            cells.push(null);
        for (let d = 1; d <= daysInMonth; d++)
            cells.push(d);
        while (cells.length % 7 !== 0)
            cells.push(null);

        for (let i = 0; i < cells.length; i += 7) {
            const row = new St.BoxLayout({vertical: false, x_expand: false});
            style(row, `width: ${CELL * 7}px;`);
            try { row.width = CELL * 7; } catch (e) {}
            for (let c = 0; c < 7; c++) {
                const d = cells[i + c];
                const wrap = new St.Bin({
                    x_expand: false,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                try { wrap.width = CELL; wrap.height = 32; } catch (e) {}
                if (d === null) {
                    row.add_child(wrap);
                    continue;
                }
                const isToday = isThisMonth && d === todayDay;
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
                    try { bub.width = 28; bub.height = 28; } catch (e) {}
                    style(bub, `width: 28px; height: 28px; background-color: ${globalThis._materialPanelPrimary ?? '#89b4fa'}; border-radius: 999px;`);
                    style(lab, `font-size: 12px; font-weight: 700; color: ${globalThis._materialPanelOnPrimary ?? '#1e1e2e'};`);
                    bub.set_child(lab);
                    wrap.set_child(bub);
                } else {
                    style(lab, 'font-size: 12px; opacity: 0.9;');
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
