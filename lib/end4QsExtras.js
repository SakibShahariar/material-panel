/**
 * end-4 QS: notification cards + calendar (reference-matched).
 */
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {listNotifications, clearAllNotifications} from '../modules/notifications.js';
import {getCalendarWeekStart, getCalendarWeekdayLabels, buildCalendarCells} from './calendarGrid.js';
import {loadCalendarDocument, indexEventsByDate, eventsForDateKey, dateKeyFromYmd, dateKeyToday, formatEventTimeRange} from './calendarEvents.js';

function style(actor, css) {
    try { actor.style = css; } catch (e) {}
}

export function buildEnd4NotiSection() {
    const outer = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti',
    });
    style(outer, 'spacing: 8px;');

    const list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style_class: 'material-panel-qs-end4-noti-list',
    });
    style(list, 'spacing: 6px;');
    outer.add_child(list);

    // Footer like end-4: count pill
    const footer = new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, x_expand: true});
    style(footer, 'spacing: 8px; padding-top: 4px;');
    const countLbl = new St.Label({
        text: '0 notifications',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(countLbl, 'font-size: 11px; opacity: 0.75; background-color: transparent; border-radius: 999px; padding: 6px 14px;');
    footer.add_child(countLbl);
    const clearBtn = new St.Button({
        style_class: 'material-panel-e4-noti-clear',
        label: 'Clear all',
        reactive: true,
        track_hover: true,
        can_focus: true,
    });
    style(clearBtn, 'font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 999px;');
    footer.add_child(clearBtn);
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
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
                reactive: true,
            });
            row.add_style_class_name('material-panel-e4-noti-row');
            style(row, 'border-radius: 14px; padding: 10px 12px; spacing: 10px;');

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

            const mid = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            style(mid, 'spacing: 2px;');
            const title = new St.Label({
                text: (it.title || it.appName || 'Notification').slice(0, 42),
                style_class: 'material-panel-e4-noti-title',
            });
            style(title, 'font-weight: 700; font-size: 12px;');
            mid.add_child(title);
            if (it.body) {
                const body = new St.Label({
                    text: it.body.slice(0, 72),
                    style_class: 'material-panel-e4-noti-body',
                });
                try { body.clutter_text.line_wrap = true; } catch (e) {}
                style(body, 'font-size: 11px; opacity: 0.8;');
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

    clearBtn.connect('clicked', () => {
        try { clearAllNotifications(); } catch (e) {}
        try { rebuild(); } catch (e) {}
    });
    rebuild();
    let refreshId = 0;
    const stopRefresh = () => {
        if (refreshId) {
            try { GLib.source_remove(refreshId); } catch (e) {}
            refreshId = 0;
        }
    };
    const startRefresh = () => {
        if (refreshId || !outer.is_mapped)
            return;
        refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => {
            if (!outer.is_mapped) {
                refreshId = 0;
                return GLib.SOURCE_REMOVE;
            }
            try { rebuild(); } catch (e) {}
            return GLib.SOURCE_CONTINUE;
        });
    };
    outer.connect('notify::mapped', () => {
        if (outer.is_mapped)
            startRefresh();
        else
            stopRefresh();
    });
    outer.connect('destroy', stopRefresh);
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
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal',
    });
    style(outer, 'background-color: transparent; border-radius: 16px; padding: 12px; spacing: 8px;');

    const hdr = new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const prev = new St.Button({label: '‹', reactive: true});
    style(prev, 'width: 28px; height: 28px; border-radius: 999px; background-color: transparent;');
    const title = new St.Label({
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    style(title, 'font-weight: 700; font-size: 13px;');
    const next = new St.Button({label: '›', reactive: true});
    style(next, 'width: 28px; height: 28px; border-radius: 999px; background-color: transparent;');
    hdr.add_child(prev);
    hdr.add_child(title);
    hdr.add_child(next);
    outer.add_child(hdr);

    const CELL = 40;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const weekStart = getCalendarWeekStart(locale);
    const weekdayLabels = getCalendarWeekdayLabels(locale, weekStart);
    const dowRow = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
    });
    style(dowRow, `width: ${CELL * 7}px;`);
    try { dowRow.width = CELL * 7; } catch (e) {}
    for (const d of weekdayLabels) {
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
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: false,
        x_align: Clutter.ActorAlign.CENTER,
    });
    style(daysBox, `spacing: 4px; width: ${CELL * 7}px;`);
    try { daysBox.width = CELL * 7; } catch (e) {}
    outer.add_child(daysBox);

    const agendaTitle = new St.Label({
        text: 'Today',
        x_expand: true,
        style_class: 'material-panel-qs-end4-cal-agenda-title',
    });
    style(agendaTitle, 'font-size: 11px; font-weight: 700; opacity: 0.7; padding-top: 4px;');
    outer.add_child(agendaTitle);
    const agendaBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
    style(agendaBox, 'spacing: 4px;');
    outer.add_child(agendaBox);

    const todayKey = dateKeyToday();
    let selectedKey = todayKey;
    let eventIndex = new Map();

    const rebuild = () => {
        daysBox.destroy_all_children();
        const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
        if (!first) {
            title.text = `${month}/${year}`;
            return;
        }
        title.text = first.format('%B %Y') || `${month}/${year}`;
        const daysInMonth = GLib.Date.get_days_in_month(month, year);
        const today = GLib.DateTime.new_now_local();
        const isThisMonth = today.get_year() === year && today.get_month() === month;
        const todayDay = today.get_day_of_month();

        const cells = buildCalendarCells(year, month, daysInMonth, weekStart);

        for (let i = 0; i < cells.length; i += 7) {
            const row = new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, x_expand: false});
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
                const key = dateKeyFromYmd(year, month, d);
                const isSelected = selectedKey === key;
                const hasEvents = eventsForDateKey(eventIndex, key).length > 0;
                const dayBtn = new St.Button({
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                    x_expand: false,
                });
                try { dayBtn.width = CELL; dayBtn.height = 32; } catch (e) {}
                const dayContent = new St.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: 'spacing: 0;',
                });
                const lab = new St.Label({
                    text: String(d),
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                const eventDot = new St.Widget({width: 4, height: 4});
                style(eventDot, `border-radius: 999px; background-color: ${globalThis._materialPanelPrimary ?? '#89b4fa'};`);
                eventDot.visible = hasEvents;
                dayContent.add_child(lab);
                dayContent.add_child(eventDot);
                const prim = () => globalThis._materialPanelPrimary ?? '#89b4fa';
                const onP = () => globalThis._materialPanelOnPrimary ?? '#1e1e2e';
                const paintDay = () => {
                    let bg = 'transparent';
                    let fg = 'font-size: 12px; opacity: 0.9;';
                    if (isSelected || isToday) {
                        bg = prim();
                        fg = `font-size: 12px; font-weight: 700; color: ${onP()};`;
                    } else if (dayBtn.hover) {
                        // Resolve inherited text color at hover time for light/dark themes.
                        const foreground = dayBtn.get_theme_node().get_foreground_color();
                        bg = `alpha(${foreground.to_string()}, 0.14)`;
                        fg = 'font-size: 12px; opacity: 1;';
                    }
                    style(dayBtn, `width: ${CELL}px; height: 32px; border-radius: 999px; background-color: ${bg};`);
                    style(lab, fg);
                    style(eventDot, `width: 4px; height: 4px; border-radius: 999px; background-color: ${isSelected || isToday ? onP() : prim()};`);
                };
                dayBtn.set_child(dayContent);
                dayBtn.connect('notify::hover', paintDay);
                dayBtn.connect('clicked', () => {
                    selectedKey = key;
                    rebuild();
                });
                paintDay();
                wrap.set_child(dayBtn);
                row.add_child(wrap);
            }
            daysBox.add_child(row);
        }

        agendaBox.destroy_all_children();
        const selectedEvents = eventsForDateKey(eventIndex, selectedKey);
        agendaTitle.text = selectedKey === todayKey ? 'Today' : selectedKey;
        if (!selectedEvents.length) {
            const empty = new St.Label({text: 'No events this day'});
            style(empty, 'font-size: 11px; opacity: 0.45; padding: 2px 4px;');
            agendaBox.add_child(empty);
        } else {
            agendaTitle.text = `${selectedKey === todayKey ? 'Today' : selectedKey} · ${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'}`;
            for (const event of selectedEvents.slice(0, 4)) {
                const row = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    x_expand: true,
                });
                style(row, 'spacing: 8px; padding: 5px 6px; border-radius: 8px;');
                const eventName = new St.Label({
                    text: String(event.title || 'Event'),
                    x_expand: true,
                });
                try { eventName.clutter_text.ellipsize = 3; } catch (e) {}
                style(eventName, 'font-size: 11px;');
                const eventTime = new St.Label({text: formatEventTimeRange(event)});
                style(eventTime, 'font-size: 10px; opacity: 0.65;');
                row.add_child(eventName);
                row.add_child(eventTime);
                agendaBox.add_child(row);
            }
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

    const refreshEvents = () => {
        const document = loadCalendarDocument();
        eventIndex = indexEventsByDate(document?.events || []);
        rebuild();
    };
    outer.connect('notify::mapped', () => {
        if (outer.is_mapped)
            refreshEvents();
    });
    refreshEvents();
    return outer;
}
