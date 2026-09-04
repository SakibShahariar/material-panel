import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore} from '../lib/configStore.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {wirePressedClass} from '../lib/pressFx.js';

const CELL = 34;

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

function buildCalendarActor(year, month, onPrev, onNext) {
    const outer = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-cal',
    });

    const nav = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-clock-cal-nav',
        x_expand: true,
    });
    const prevBtn = new St.Button({
        style_class: 'material-panel-clock-cal-nav-btn',
        label: '‹',
        reactive: true,
    });
    const nextBtn = new St.Button({
        style_class: 'material-panel-clock-cal-nav-btn',
        label: '›',
        reactive: true,
    });
    const first = GLib.DateTime.new_local(year, month, 1, 0, 0, 0);
    const title = new St.Label({
        text: first.format('%B %Y') ?? `${month}/${year}`,
        style_class: 'material-panel-clock-cal-title',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    prevBtn.connect('clicked', () => onPrev?.());
    nextBtn.connect('clicked', () => onNext?.());
    nav.add_child(prevBtn);
    nav.add_child(title);
    nav.add_child(nextBtn);
    outer.add_child(nav);

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
                x_expand: false,
                y_expand: false,
            });
            if (cellIndex >= startDow - 1 && day <= dim) {
                cell.label = String(day);
                if (isThisMonth && day === todayDay)
                    cell.add_style_class_name('today');
                day++;
            } else {
                cell.label = '';
                cell.add_style_class_name('empty');
            }
            gl.attach(cell, col, row + 1, 1, 1);
        }
    }
    outer.add_child(grid);
    return outer;
}

export function buildClock(_extensionPath, scale = 1.0) {
    const label = new St.Label({
        style_class: 'material-panel-clock',
        y_align: Clutter.ActorAlign.CENTER,
        text: '—',
    });

    const store = new ConfigStore();
    let use12h = store.load().clockFormat === '12h';
    try {
        // Prefer GNOME session clock format when panel config is unset/default
        const gs = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const gf = gs.get_string('clock-format');
        if (gf === '12h' || gf === '24h')
            use12h = gf === '12h';
    } catch (e) {}

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
        style_class: 'material-panel-clock-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: label,
    });
    wirePressedClass(button);

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-clock-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-clock-popup-body',
    });

    // Hero card
    const hero = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-card material-panel-clock-popup-hero',
    });
    const timeLabel = new St.Label({
        text: '—',
        style_class: 'material-panel-clock-popup-time',
        x_align: Clutter.ActorAlign.CENTER,
    });
    const dateLabel = new St.Label({
        text: '—',
        style_class: 'material-panel-clock-popup-date',
        x_align: Clutter.ActorAlign.CENTER,
    });
    const metaLabel = new St.Label({
        text: '',
        style_class: 'material-panel-clock-popup-meta',
        x_align: Clutter.ActorAlign.CENTER,
    });
    hero.add_child(timeLabel);
    hero.add_child(dateLabel);
    hero.add_child(metaLabel);
    body.add_child(hero);

    const calCard = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-card material-panel-clock-cal-host',
    });
    body.add_child(calCard);

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    let viewYear = GLib.DateTime.new_now_local().get_year();
    let viewMonth = GLib.DateTime.new_now_local().get_month();

    const rebuildCal = () => {
        const now = GLib.DateTime.new_now_local();
        timeLabel.text = (now.format(use12h ? '%l:%M:%S %p' : '%H:%M:%S') ?? '').trim();
        dateLabel.text = now.format('%A, %d %B %Y') ?? '';
        const week = now.get_week_of_year?.() ?? '';
        const tz = now.get_timezone_abbreviation?.() || '';
        metaLabel.text = [week ? `Week ${week}` : '', tz].filter(Boolean).join(' · ');

        calCard.destroy_all_children();
        calCard.add_child(buildCalendarActor(
            viewYear,
            viewMonth,
            () => {
                viewMonth -= 1;
                if (viewMonth < 1) {
                    viewMonth = 12;
                    viewYear -= 1;
                }
                rebuildCal();
            },
            () => {
                viewMonth += 1;
                if (viewMonth > 12) {
                    viewMonth = 1;
                    viewYear += 1;
                }
                rebuildCal();
            },
        ));
    };

    let liveId = 0;
    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            const now = GLib.DateTime.new_now_local();
            viewYear = now.get_year();
            viewMonth = now.get_month();
            rebuildCal();
            if (liveId)
                GLib.source_remove(liveId);
            liveId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                if (!menu.isOpen)
                    return GLib.SOURCE_REMOVE;
                const n = GLib.DateTime.new_now_local();
                timeLabel.text = (n.format(use12h ? '%l:%M:%S %p' : '%H:%M:%S') ?? '').trim();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (liveId) {
            try { GLib.source_remove(liveId); } catch (e) {}
            liveId = 0;
        }
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else
            menu.open();
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(sourceId); } catch (e) {}
        if (liveId) try { GLib.source_remove(liveId); } catch (e) {}
        try { store.unwatch(); } catch (e) {}
        menu.destroy();
    });

    return button;
}
