/**
 * Clock chip + Omarchy-inspired calendar popup:
 * month grid, event dots, day agenda, next-event countdown.
 * Events: ~/.config/material-panel/calendar-events.json
 */
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from '../lib/configStore.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {wirePressedClass} from '../lib/pressFx.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {
    loadCalendarDocument,
    indexEventsByDate,
    eventsForDateKey,
    dateKeyFromYmd,
    dateKeyToday,
    nextEvent,
    formatCountdown,
    formatEventTimeRange,
    meetingUrl,
} from '../lib/calendarEvents.js';

const CELL = 36;

function formatEnd4(use12h) {
    const now = GLib.DateTime.new_now_local();
    const time = (now.format(use12h ? '%-I:%M %p' : '%H:%M') ?? '').replace(/\s+/g, ' ').trim();
    const date = (now.format('%a, %d %b') ?? '').replace(/\s+/g, ' ').trim();
    return `${time} · ${date}`;
}

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

/**
 * @param {number} year
 * @param {number} month
 * @param {Map} eventIndex
 * @param {string} selectedKey
 * @param {function} onSelectKey
 * @param {function} onPrev
 * @param {function} onNext
 */
function buildCalendarActor(year, month, eventIndex, selectedKey, onSelectKey, onPrev, onNext) {
    const outer = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-cal',
        x_expand: true,
    });
    try { outer.style = 'spacing: 8px;'; } catch (e) {}

    const nav = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-clock-cal-nav',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const prevBtn = new St.Button({
        style_class: 'material-panel-clock-cal-nav-btn',
        label: '‹',
        reactive: true,
        track_hover: true,
    });
    const nextBtn = new St.Button({
        style_class: 'material-panel-clock-cal-nav-btn',
        label: '›',
        reactive: true,
        track_hover: true,
    });
    wirePressedClass(prevBtn);
    wirePressedClass(nextBtn);
    const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
    const title = new St.Label({
        text: first.format('%B %Y') ?? `${month}/${year}`,
        style_class: 'material-panel-clock-cal-title',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { title.style = 'font-weight: 700; font-size: 13px;'; } catch (e) {}
    prevBtn.connect('clicked', () => onPrev?.());
    nextBtn.connect('clicked', () => onNext?.());
    nav.add_child(prevBtn);
    nav.add_child(title);
    nav.add_child(nextBtn);
    outer.add_child(nav);

    const grid = new St.Widget({
        style_class: 'material-panel-clock-cal-grid',
        layout_manager: new Clutter.GridLayout({column_homogeneous: true}),
        x_expand: true,
    });
    const layout = grid.layout_manager;
    const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    for (let c = 0; c < 7; c++) {
        const lab = new St.Label({
            text: dows[c],
            style_class: 'material-panel-clock-cal-dow-label',
            x_align: Clutter.ActorAlign.CENTER,
        });
        try { lab.style = 'font-size: 10px; opacity: 0.55; font-weight: 600;'; } catch (e) {}
        layout.attach(lab, c, 0, 1, 1);
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
                label: '',
                reactive: false,
                track_hover: true,
                can_focus: true,
                width: CELL,
                height: CELL,
            });
            try {
                cell.style =
                    `width: ${CELL}px; height: ${CELL}px; border-radius: 999px; padding: 0;`;
            } catch (e) {}

            if (cellIndex >= startDow - 1 && day <= dim) {
                const d = day;
                const key = dateKeyFromYmd(year, month, d);
                cell.label = String(d);
                cell.reactive = true;
                const hasEvents = (eventIndex?.get(key)?.length || 0) > 0;
                if (isThisMonth && d === todayDay)
                    cell.add_style_class_name('today');
                if (selectedKey === key)
                    cell.add_style_class_name('selected');
                if (hasEvents)
                    cell.add_style_class_name('has-events');
                cell.connect('clicked', () => onSelectKey?.(key));
                day++;
            }
            layout.attach(cell, col, row + 1, 1, 1);
        }
    }

    outer.add_child(grid);
    return outer;
}

export function buildClock(_extensionPath, scale = 1.0) {
    const store = new ConfigStore();
    let use12h = false;
    try {
        const cfg = store.load();
        use12h = cfg?.clockFormat === '12h';
    } catch (e) {}

    const isEnd4 = () => globalThis._materialPanelLayoutStyle === 'end4';
    const label = new St.Label({
        style_class: 'material-panel-clock-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: isEnd4() ? formatEnd4(use12h) : formatNow(use12h),
    });

    const button = new St.Button({
        style_class: 'material-panel-clock-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: label,
    });

    // Tick
    const tick = () => {
        try {
            use12h = store.load()?.clockFormat === '12h';
        } catch (e) {}
        label.text = isEnd4() ? formatEnd4(use12h) : formatNow(use12h);
        // Optional: announce next event on chip when close
        try {
            const doc = loadCalendarDocument();
            if (doc?.events?.length) {
                const n = nextEvent(doc.events);
                if (n) {
                    const st = n.start;
                    const dt = GLib.DateTime.new_from_iso8601(String(st), null);
                    if (dt) {
                        const mins = (dt.to_unix() - GLib.DateTime.new_now_local().to_unix()) / 60;
                        if (mins >= 0 && mins <= 30) {
                            const title = String(n.title || 'Event').slice(0, 22);
                            const cd = formatCountdown(n);
                            label.text = isEnd4()
                                ? `${title} · ${cd}`
                                : `${title}  ${cd}`;
                        }
                    }
                }
            }
        } catch (e) {}
    };
    const tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
        tick();
        return GLib.SOURCE_CONTINUE;
    });
    tick();

    // Popup
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name(
        'material-panel-popup material-panel-clock-popup material-panel-calendar-popup');
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-popup-body',
        x_expand: true,
    });
    try {
        body.style = 'spacing: 10px; padding: 12px 14px; min-width: 280px; max-width: 340px;';
    } catch (e) {}

    // Next event banner
    const nextBanner = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-cal-next',
        x_expand: true,
        visible: false,
    });
    try {
        nextBanner.style =
            'spacing: 2px; padding: 10px 12px; border-radius: 14px;';
    } catch (e) {}
    const nextTitle = new St.Label({
        text: '',
        style_class: 'material-panel-cal-next-title',
        x_expand: true,
    });
    try {
        nextTitle.style = 'font-weight: 700; font-size: 12px;';
        nextTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    } catch (e) {}
    const nextMeta = new St.Label({
        text: '',
        style_class: 'material-panel-cal-next-meta',
    });
    try { nextMeta.style = 'font-size: 11px; opacity: 0.7;'; } catch (e) {}
    nextBanner.add_child(nextTitle);
    nextBanner.add_child(nextMeta);
    body.add_child(nextBanner);

    // Calendar host (rebuilt on nav)
    const calHost = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-cal-host',
        x_expand: true,
    });
    body.add_child(calHost);

    // Agenda
    const agendaTitle = new St.Label({
        text: 'Agenda',
        style_class: 'material-panel-cal-agenda-title',
    });
    try {
        agendaTitle.style = 'font-size: 11px; font-weight: 700; opacity: 0.65; padding-top: 4px;';
    } catch (e) {}
    body.add_child(agendaTitle);

    const agendaBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-cal-agenda',
        x_expand: true,
    });
    try { agendaBox.style = 'spacing: 4px;'; } catch (e) {}
    body.add_child(agendaBox);

    const hint = new St.Label({
        text: '',
        style_class: 'material-panel-cal-hint',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    try {
        hint.style = 'font-size: 10px; opacity: 0.4; padding-top: 6px;';
    } catch (e) {}
    body.add_child(hint);

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    let viewYear, viewMonth;
    let selectedKey = dateKeyToday();
    let eventIndex = new Map();
    let allEvents = [];

    const refreshEvents = () => {
        const doc = loadCalendarDocument();
        allEvents = doc?.events || [];
        eventIndex = indexEventsByDate(allEvents);
        if (doc?.source)
            hint.text = `Events · ${doc.source}`;
        else if (!doc)
            hint.text = 'Add ~/.config/material-panel/calendar-events.json';
        else
            hint.text = allEvents.length ? `${allEvents.length} events` : 'No events synced';
    };

    const fillNext = () => {
        const n = nextEvent(allEvents);
        if (!n) {
            nextBanner.visible = false;
            return;
        }
        nextBanner.visible = true;
        nextTitle.text = String(n.title || 'Event');
        const when = formatEventTimeRange(n);
        const cd = formatCountdown(n);
        nextMeta.text = [when, cd].filter(Boolean).join(' · ');
    };

    const fillAgenda = () => {
        agendaBox.destroy_all_children();
        const list = eventsForDateKey(eventIndex, selectedKey);
        const pretty = selectedKey === dateKeyToday()
            ? 'Today'
            : selectedKey;
        agendaTitle.text = list.length
            ? `${pretty} · ${list.length}`
            : pretty;

        if (list.length === 0) {
            const empty = new St.Label({
                text: 'No events',
                style_class: 'material-panel-cal-empty',
            });
            try {
                empty.style = 'font-size: 11px; opacity: 0.5; padding: 6px 4px;';
            } catch (e) {}
            agendaBox.add_child(empty);
            return;
        }

        for (const ev of list.slice(0, 8)) {
            const row = new St.Button({
                style_class: 'material-panel-cal-event-row',
                reactive: true,
                track_hover: true,
                x_expand: true,
            });
            try {
                row.style =
                    'padding: 8px 10px; border-radius: 12px;';
            } catch (e) {}
            const col = new St.BoxLayout({
                vertical: true,
                x_expand: true,
            });
            try { col.style = 'spacing: 2px;'; } catch (e) {}
            const top = new St.BoxLayout({vertical: false, x_expand: true});
            const t = new St.Label({
                text: String(ev.title || 'Event'),
                style_class: 'material-panel-cal-event-title',
                x_expand: true,
            });
            try {
                t.style = 'font-size: 12px; font-weight: 600;';
                t.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            } catch (e) {}
            const tm = new St.Label({
                text: formatEventTimeRange(ev),
                style_class: 'material-panel-cal-event-time',
            });
            try { tm.style = 'font-size: 11px; opacity: 0.65;'; } catch (e) {}
            top.add_child(t);
            top.add_child(tm);
            col.add_child(top);
            if (ev.location) {
                const loc = new St.Label({
                    text: String(ev.location).slice(0, 40),
                    style_class: 'material-panel-cal-event-loc',
                });
                try { loc.style = 'font-size: 10px; opacity: 0.55;'; } catch (e) {}
                col.add_child(loc);
            }
            row.set_child(col);
            const url = meetingUrl(ev) || (ev.htmlLink && /^https?:/i.test(ev.htmlLink) ? ev.htmlLink : null);
            row.connect('clicked', () => {
                if (url) {
                    try {
                        Gio.AppInfo.launch_default_for_uri_async(url, null, null, null);
                    } catch (e) {
                        try {
                            GLib.spawn_command_line_async(`xdg-open '${url.replace(/'/g, '')}'`);
                        } catch (e2) {}
                    }
                }
                return Clutter.EVENT_STOP;
            });
            agendaBox.add_child(row);
        }
    };

    const rebuildCal = () => {
        calHost.destroy_all_children();
        calHost.add_child(buildCalendarActor(
            viewYear,
            viewMonth,
            eventIndex,
            selectedKey,
            key => {
                selectedKey = key;
                rebuildCal();
                fillAgenda();
            },
            () => {
                viewMonth--;
                if (viewMonth < 1) {
                    viewMonth = 12;
                    viewYear--;
                }
                rebuildCal();
            },
            () => {
                viewMonth++;
                if (viewMonth > 12) {
                    viewMonth = 1;
                    viewYear++;
                }
                rebuildCal();
            },
        ));
    };

    const openRefresh = () => {
        const now = GLib.DateTime.new_now_local();
        viewYear = now.get_year();
        viewMonth = now.get_month();
        selectedKey = dateKeyToday();
        refreshEvents();
        fillNext();
        rebuildCal();
        fillAgenda();
    };

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            openRefresh();
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            openRefresh();
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(tickId); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    try { wirePressedClass(button); } catch (e) {}

    return button;
}
