/**
 * Notification chip + Omarchy-inspired center popup (default layout).
 * Data: GNOME MessageTray. UI: day sections, cards, clear, relative time.
 */
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {wireChipPress} from '../lib/pressFx.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {setChipA11y} from '../lib/a11y.js';

const MAX_SHOWN = 60;
const PANEL_MIN_W = 340;
const PANEL_MAX_H_RATIO = 0.72;

export function listNotifications() {
    const out = [];
    try {
        const tray = Main.messageTray;
        if (!tray)
            return out;
        const sources = typeof tray.getSources === 'function'
            ? tray.getSources()
            : (tray._sources ? [...tray._sources] : []);
        for (const source of sources) {
            let notifs = [];
            try {
                if (Array.isArray(source.notifications))
                    notifs = source.notifications;
                else if (source._notifications)
                    notifs = [...source._notifications];
            } catch (e) {}
            const appName = source?.title || source?.name || 'System';
            let appIcon = null;
            try {
                appIcon = source.get_icon?.() || source.icon || null;
            } catch (e) {}
            for (const n of notifs) {
                try {
                    if (n.isTransient)
                        continue;
                    const title = n.title || appName;
                    let body = '';
                    try {
                        body = n.bannerBodyText || n.body || '';
                    } catch (e) {}
                    if (!body || body === 'undefined')
                        body = '';
                    // Strip crude HTML
                    body = String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

                    let dt = null;
                    try {
                        dt = n.datetime || n._timestamp || null;
                    } catch (e) {}
                    let unix = 0;
                    try {
                        if (dt && typeof dt.to_unix === 'function')
                            unix = dt.to_unix();
                        else if (typeof dt === 'number')
                            unix = dt;
                    } catch (e) {}

                    let gicon = appIcon;
                    try {
                        if (n.gicon)
                            gicon = n.gicon;
                        else if (typeof n.get_icon === 'function')
                            gicon = n.get_icon() || gicon;
                    } catch (e) {}

                    out.push({
                        source,
                        notification: n,
                        appName: String(appName),
                        title: String(title),
                        body: String(body),
                        unix,
                        gicon,
                    });
                } catch (e) {}
            }
        }
    } catch (e) {
        logError(e, 'material-panel: listNotifications');
    }
    // Newest first
    out.sort((a, b) => (b.unix || 0) - (a.unix || 0));
    return out;
}

export function destroyNotification(n) {
    try {
        n.destroy?.(2);
    } catch (e) {
        try { n.destroy?.(0); } catch (e2) {}
    }
}

export function clearAllNotifications() {
    for (const item of listNotifications()) {
        try { destroyNotification(item.notification); } catch (e) {}
    }
}

function relativeTime(unix) {
    if (!unix)
        return '';
    try {
        const now = GLib.get_real_time() / 1e6;
        // GLib.DateTime.to_unix is seconds since epoch; get_real_time is µs monotonic — wrong.
        // Use wall clock:
        const nowSec = GLib.DateTime.new_now_local().to_unix();
        let diff = Math.max(0, nowSec - unix);
        if (diff < 45)
            return 'now';
        if (diff < 3600)
            return `${Math.floor(diff / 60)}m`;
        if (diff < 86400)
            return `${Math.floor(diff / 3600)}h`;
        if (diff < 86400 * 7)
            return `${Math.floor(diff / 86400)}d`;
        const dt = GLib.DateTime.new_from_unix_local(unix);
        return dt.format('%b %d') || '';
    } catch (e) {
        return '';
    }
}

function dayKey(unix) {
    try {
        const now = GLib.DateTime.new_now_local();
        const dt = unix
            ? GLib.DateTime.new_from_unix_local(unix)
            : now;
        const today = now.format('%F');
        const yest = now.add_days(-1).format('%F');
        const key = dt.format('%F');
        if (key === today)
            return {key: 'today', label: 'Today'};
        if (key === yest)
            return {key: 'yesterday', label: 'Yesterday'};
        return {key, label: dt.format('%A, %b %d') || key};
    } catch (e) {
        return {key: 'other', label: 'Earlier'};
    }
}

function groupByDay(items) {
    const order = [];
    const map = new Map();
    for (const it of items) {
        const {key, label} = dayKey(it.unix);
        if (!map.has(key)) {
            map.set(key, {label, items: []});
            order.push(key);
        }
        map.get(key).items.push(it);
    }
    return order.map(k => map.get(k));
}

function openSystemNotificationCenter() {
    try {
        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (dateMenu?.menu) {
            dateMenu.menu.open?.(true);
            return;
        }
    } catch (e) {}
}

/**
 * Panel chip + Omarchy-style notification center popup.
 */
export function buildNotifications(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('notifications'))),
    });
    const countLabel = new St.Label({
        style_class: 'material-panel-notifications-count',
        text: '',
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });
    const box = new St.BoxLayout({
        style_class: 'material-panel-notifications',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { box.style = 'spacing: 4px;'; } catch (e) {}
    box.add_child(icon);
    box.add_child(countLabel);

    const button = new St.Button({
        style_class: 'material-panel-notifications-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
    });
    try {
        setChipA11y(button, 'Notifications');
    wireChipPress(button, {
            stickyUntilLeave: true,
            getIcons: () => [{icon, key: 'notifications'}],
        });
    } catch (e) {}

    const setCount = n => {
        if (n > 0) {
            countLabel.text = n > 99 ? '99+' : String(n);
            countLabel.visible = true;
        } else {
            countLabel.text = '';
            countLabel.visible = false;
        }
    };

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name(
        'material-panel-popup material-panel-notifications-popup material-panel-nc-omarchy');
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const root = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-nc-body',
        x_expand: true,
    });
    try {
        root.style = `min-width: ${PANEL_MIN_W}px; spacing: 0; padding: 0;`;
    } catch (e) {}

    // ── Header ──
    const header = new St.BoxLayout({
        style_class: 'material-panel-nc-header',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        header.style = 'spacing: 8px; padding: 12px 14px 8px 14px;';
    } catch (e) {}

    const headerTitle = new St.Label({
        text: 'Notifications',
        style_class: 'material-panel-nc-title',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        headerTitle.style = 'font-weight: 700; font-size: 15px;';
    } catch (e) {}

    const clearBtn = new St.Button({
        style_class: 'material-panel-nc-clear',
        label: 'Clear',
        reactive: true,
        track_hover: true,
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        clearBtn.style = 'font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px;';
    } catch (e) {}
    wireChipPress(clearBtn, {stickyUntilLeave: true});

    header.add_child(headerTitle);
    header.add_child(clearBtn);
    root.add_child(header);

    // ── Search ──
    const searchWrap = new St.BoxLayout({
        style_class: 'material-panel-nc-search-wrap',
        x_expand: true,
    });
    try {
        searchWrap.style = 'padding: 0 14px 10px 14px;';
    } catch (e) {}
    const searchEntry = new St.Entry({
        style_class: 'material-panel-nc-search',
        hint_text: 'Search notifications',
        can_focus: true,
        x_expand: true,
    });
    try {
        searchEntry.style =
            'border-radius: 12px; padding: 8px 12px; font-size: 12px;';
    } catch (e) {}
    searchWrap.add_child(searchEntry);
    root.add_child(searchWrap);

    // ── Scroll list ──
    const scroll = new St.ScrollView({
        style_class: 'material-panel-nc-scroll',
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
    });
    try {
        scroll.overlay_scrollbars = true;
        if (St.PolicyType) {
            scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
            scroll.hscrollbar_policy = St.PolicyType.NEVER;
        }
        if (scroll.set_policy)
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    } catch (e) {}

    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-nc-list',
        x_expand: true,
    });
    try {
        listBox.style = 'spacing: 6px; padding: 0 10px 10px 10px;';
    } catch (e) {}
    try {
        scroll.add_child(listBox);
    } catch (e) {
        try { scroll.add_actor(listBox); } catch (e2) {}
    }
    root.add_child(scroll);

    // ── Footer ──
    const footer = new St.Button({
        style_class: 'material-panel-nc-footer',
        label: 'Open system calendar / notifications…',
        reactive: true,
        track_hover: true,
        x_expand: true,
    });
    try {
        footer.style = 'font-size: 11px; padding: 10px; opacity: 0.75;';
    } catch (e) {}
    wireChipPress(footer, {stickyUntilLeave: true});
    footer.connect('clicked', () => {
        menuClose(menu);
        openSystemNotificationCenter();
    });
    root.add_child(footer);

    section.actor.add_child(root);
    menu.addMenuItem(section);

    const applyMaxHeight = () => {
        try {
            const mon = Main.layoutManager.primaryMonitor;
            const maxH = mon ? Math.floor(mon.height * PANEL_MAX_H_RATIO) : 520;
            scroll.style = `max-height: ${maxH - 120}px;`;
            menu.box.style =
                `min-width: ${PANEL_MIN_W}px; max-width: 420px; border-radius: 18px;`;
        } catch (e) {}
    };

    const makeCard = item => {
        const card = new St.BoxLayout({
            vertical: false,
            style_class: 'material-panel-nc-card',
            x_expand: true,
            reactive: true,
            track_hover: true,
        });
        try {
            card.style =
                'spacing: 10px; padding: 10px 12px; border-radius: 14px;';
        } catch (e) {}

        // App / notif icon
        const avatar = new St.Icon({
            style_class: 'material-panel-nc-avatar',
            icon_size: 28,
            y_align: Clutter.ActorAlign.START,
        });
        try {
            if (item.gicon)
                avatar.gicon = item.gicon;
            else
                avatar.icon_name = 'dialog-information-symbolic';
        } catch (e) {
            avatar.icon_name = 'dialog-information-symbolic';
        }
        card.add_child(avatar);

        // Text column
        const mid = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-nc-mid',
        });
        try { mid.style = 'spacing: 2px;'; } catch (e) {}

        const topRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });
        try { topRow.style = 'spacing: 6px;'; } catch (e) {}

        const title = new St.Label({
            text: (item.title || item.appName || 'Notification').slice(0, 64),
            style_class: 'material-panel-nc-card-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            title.style = 'font-weight: 700; font-size: 12px;';
        } catch (e) {}

        const timeLbl = new St.Label({
            text: relativeTime(item.unix),
            style_class: 'material-panel-nc-card-time',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            timeLbl.style = 'font-size: 11px; opacity: 0.65;';
        } catch (e) {}

        topRow.add_child(title);
        topRow.add_child(timeLbl);
        mid.add_child(topRow);

        if (item.appName && item.appName !== item.title) {
            const app = new St.Label({
                text: item.appName,
                style_class: 'material-panel-nc-card-app',
            });
            try {
                app.style = 'font-size: 11px; opacity: 0.7;';
            } catch (e) {}
            mid.add_child(app);
        }

        if (item.body) {
            const body = new St.Label({
                text: item.body.slice(0, 160),
                style_class: 'material-panel-nc-card-body',
                x_expand: true,
            });
            try {
                body.clutter_text.line_wrap = true;
                body.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                body.style = 'font-size: 11px; opacity: 0.85;';
            } catch (e) {}
            mid.add_child(body);
        }
        card.add_child(mid);

        // Dismiss ×
        const dismiss = new St.Button({
            style_class: 'material-panel-nc-dismiss',
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.START,
        });
        dismiss.set_child(new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: 14,
        }));
        try {
            dismiss.style = 'padding: 4px; border-radius: 999px;';
        } catch (e) {}
        wireChipPress(dismiss, {stickyUntilLeave: true});
        dismiss.connect('clicked', () => {
            destroyNotification(item.notification);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
                rebuild();
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_STOP;
        });
        card.add_child(dismiss);

        // Click card → activate
        card.connect('button-press-event', (_a, event) => {
            try {
                if (event.get_button() === 1) {
                    item.notification?.activate?.();
                    menuClose(menu);
                    return Clutter.EVENT_STOP;
                }
                if (event.get_button() === 3) {
                    destroyNotification(item.notification);
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
                        rebuild();
                        return GLib.SOURCE_REMOVE;
                    });
                    return Clutter.EVENT_STOP;
                }
            } catch (e) {}
            return Clutter.EVENT_PROPAGATE;
        });

        return card;
    };

    let filterText = '';
    const rebuild = () => {
        listBox.destroy_all_children();
        let items = listNotifications();
        setCount(items.length);
        applyMaxHeight();

        if (filterText) {
            const q = filterText.toLowerCase();
            items = items.filter(it =>
                (it.title || '').toLowerCase().includes(q) ||
                (it.body || '').toLowerCase().includes(q) ||
                (it.appName || '').toLowerCase().includes(q));
        }

        const shown = items.slice(0, MAX_SHOWN);

        if (shown.length === 0) {
            const empty = new St.Label({
                text: filterText ? 'No matches' : 'No notifications',
                style_class: 'material-panel-nc-empty',
                x_align: Clutter.ActorAlign.CENTER,
            });
            try {
                empty.style = 'padding: 24px 12px; opacity: 0.55; font-size: 12px;';
            } catch (e) {}
            listBox.add_child(empty);
            return;
        }

        for (const group of groupByDay(shown)) {
            const dayLbl = new St.Label({
                text: group.label,
                style_class: 'material-panel-nc-day',
                x_expand: true,
            });
            try {
                dayLbl.style =
                    'font-size: 11px; font-weight: 700; opacity: 0.55; padding: 8px 4px 4px 4px;';
            } catch (e) {}
            listBox.add_child(dayLbl);
            for (const item of group.items)
                listBox.add_child(makeCard(item));
        }

        if (items.length > MAX_SHOWN) {
            const more = new St.Label({
                text: `+${items.length - MAX_SHOWN} more`,
                style_class: 'material-panel-nc-more',
            });
            try {
                more.style = 'font-size: 11px; opacity: 0.6; padding: 6px;';
            } catch (e) {}
            listBox.add_child(more);
        }
    };

    clearBtn.connect('clicked', () => {
        clearAllNotifications();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            rebuild();
            return GLib.SOURCE_REMOVE;
        });
    });

    try {
        searchEntry.clutter_text.connect('text-changed', () => {
            filterText = searchEntry.get_text()?.trim() || '';
            rebuild();
        });
    } catch (e) {}

    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            filterText = '';
            try { searchEntry.set_text(''); } catch (e) {}
            rebuild();
        }
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            rebuild();
            menuOpen(menu);
        }
    });

    rebuild();

    // MessageTray signals — no 3s full rebuild while user is reading
    const trayIds = [];
    const sourceIds = new Map(); // source → [signal ids]
    let countDebounce = 0;
    const scheduleCount = () => {
        if (countDebounce)
            return;
        countDebounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            countDebounce = 0;
            try {
                setCount(listNotifications().length);
            } catch (e) {}
            // Only refresh list if popup is open — preserve scroll by not doing it every 3s
            try {
                if (menu.isOpen)
                    rebuild();
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    };
    const unhookSource = (source) => {
        const ids = sourceIds.get(source);
        if (!ids)
            return;
        for (const id of ids) {
            try { source.disconnect(id); } catch (e) {}
        }
        sourceIds.delete(source);
    };
    const hookSource = (source) => {
        if (!source || sourceIds.has(source))
            return;
        const ids = [];
        for (const sig of ['notification-added', 'notification-removed', 'destroy']) {
            try {
                ids.push(source.connect(sig, () => {
                    if (sig === 'destroy')
                        unhookSource(source);
                    scheduleCount();
                }));
            } catch (e) {}
        }
        if (ids.length)
            sourceIds.set(source, ids);
    };
    try {
        const tray = Main.messageTray;
        if (tray) {
            try {
                trayIds.push(tray.connect('source-added', (_t, source) => {
                    hookSource(source);
                    scheduleCount();
                }));
            } catch (e) {}
            try {
                trayIds.push(tray.connect('source-removed', (_t, source) => {
                    unhookSource(source);
                    scheduleCount();
                }));
            } catch (e) {}
            const sources = typeof tray.getSources === 'function'
                ? tray.getSources()
                : (tray._sources ? [...tray._sources] : []);
            for (const s of sources)
                hookSource(s);
        }
    } catch (e) {
        logError(e, 'material-panel: notification tray signals');
    }
    scheduleCount();

    button.connect('destroy', () => {
        if (countDebounce) {
            try { GLib.source_remove(countDebounce); } catch (e) {}
            countDebounce = 0;
        }
        for (const source of [...sourceIds.keys()])
            unhookSource(source);
        for (const id of trayIds) {
            try { Main.messageTray?.disconnect?.(id); } catch (e) {}
        }
        try { menu.destroy(); } catch (e) {}
    });

    return button;
}
