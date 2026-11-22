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
import {filterNotifications, groupNotificationsByApp, hasUnreadNotificationState, notificationAppNames} from '../lib/notificationFilters.js';
import {getNotificationActions, activateNotificationAction} from '../lib/notificationActions.js';
import {createPopupHeader} from '../lib/popupHeader.js';

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
                        unread: typeof n.acknowledged === 'boolean' ? !n.acknowledged : null,
                        actions: getNotificationActions(n),
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
    if (!unix)
        return {key: 'unknown', label: 'Date unknown'};
    try {
        const now = GLib.DateTime.new_now_local();
        const dt = GLib.DateTime.new_from_unix_local(unix);
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
 * Notification chip + notification-center popup.
 * The surface is a custom card-based actor hosted by the standard PopupMenu
 * frame, so outside clicks, Escape, focus and teardown work like every other
 * popup while the layout stays under our control.
 */
export function buildNotifications(_extensionPath, scale = 1.0) {
    let destroyed = false;

    // ---- chip ----------------------------------------------------------
    const icon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('notifications'))),
    });
    const countLabel = new St.Label({
        style_class: 'material-panel-notifications-count',
        text: '', y_align: Clutter.ActorAlign.CENTER, visible: false,
    });
    const chipBox = new St.BoxLayout({
        style_class: 'material-panel-notifications',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'spacing: 4px;',
    });
    chipBox.add_child(icon);
    chipBox.add_child(countLabel);
    const button = new St.Button({
        style_class: 'material-panel-notifications-btn material-panel-chip',
        reactive: true, track_hover: true, can_focus: true, child: chipBox,
    });
    setChipA11y(button, 'Notifications');
    try {
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

    // ---- popup frame ----------------------------------------------------
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-notifications-popup');
    attachPopupDismiss(menu, button);
    try { menu.box.style = 'width: 420px; min-width: 360px; max-width: 440px; border-radius: 18px;'; }
    catch (e) {}

    const ui = (text, style) => new St.Label({text: String(text ?? ''), style});
    const FONT = 'font-family: "Noto Sans", sans-serif;';
    const eyebrow = t => ui(t, `${FONT} font-size: 9px; font-weight: 700; opacity: 0.55; letter-spacing: 1px;`);

    const surface = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-nc-surface',
        x_expand: true,
        // The PopupMenu frame already paints the popup surface. Keep this
        // inner box transparent so only one rounded layer is visible.
        style: 'spacing: 10px; padding: 14px; width: 400px; background-color: transparent; border: none;',
    });

    // ---- list page ------------------------------------------------------
    const listPage = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style: 'spacing: 10px;',
    });
    surface.add_child(listPage);

    const dndSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});

    const headerTitle = ui('NOTIFICATIONS', `${FONT} font-size: 11px; font-weight: 700; opacity: 0.8;`);
    headerTitle.x_expand = true;
    const countPill = ui('0', `${FONT} font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;`);
    countPill.style_class = 'material-panel-nc-count-pill';
    const dndBtn = new St.Button({
        style_class: 'material-panel-nc-dnd',
        reactive: true, track_hover: true, can_focus: true,
    });
    try { dndBtn.style = `${FONT} font-size: 9px; font-weight: 700; padding: 5px 9px; border-radius: 999px;`; } catch (e) {}
    const syncDnd = () => {
        const on = !dndSettings.get_boolean('show-banners');
        // Text label instead of an emoji: coloured emoji glyphs ignore the
        // shell theme and looked out of place in the header.
        dndBtn.set_child(ui(on ? 'DND on' : 'DND', `${FONT} font-size: 9px; font-weight: 700;`));
        if (on) dndBtn.add_style_class_name('active');
        else dndBtn.remove_style_class_name('active');
        setChipA11y(dndBtn, on ? 'Do Not Disturb on; click to turn off' : 'Do Not Disturb off; click to turn on');
    };
    syncDnd();
    dndBtn.connect('clicked', () => {
        dndSettings.set_boolean('show-banners', !dndSettings.get_boolean('show-banners'));
    });
    const dndChangedId = dndSettings.connect('changed::show-banners', syncDnd);

    const clearBtn = new St.Button({
        label: 'Clear', style_class: 'material-panel-nc-clear',
        reactive: true, track_hover: true, can_focus: true,
    });
    try { clearBtn.style = `${FONT} font-size: 10px; font-weight: 600; padding: 5px 10px; border-radius: 999px;`; } catch (e) {}
    try { clearBtn.set_child(ui('Clear', `${FONT} font-size: 10px; font-weight: 600;`)); } catch (e) {}

    const header = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
    header.add_child(headerTitle);
    header.add_child(countPill);
    header.add_child(dndBtn);
    header.add_child(clearBtn);
    listPage.add_child(header);

    // Search
    const searchEntry = new St.Entry({
        hint_text: 'Search notifications  /',
        can_focus: true, x_expand: true,
        style_class: 'material-panel-nc-search',
    });
    setChipA11y(searchEntry, 'Search notifications');
    try { searchEntry.style = `${FONT} font-size: 11px; border-radius: 10px; padding: 7px 10px;`; } catch (e) {}
    listPage.add_child(searchEntry);

    // Filters
    let filterText = '';
    let selectedApp = null;
    let unreadOnly = false;
    let filterAppsSignature = '';
    let unreadStateAvailable = false;
    const filterButtons = new Map();
    // A plain row of pills: the old horizontal ScrollView rendered its track
    // as one grey slab behind the chips and looked like a broken control.
    const filterBar = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-nc-filter-bar', x_expand: true,
        style: 'spacing: 6px;',
    });
    listPage.add_child(filterBar);

    const updateFilterControls = items => {
        const apps = notificationAppNames(items);
        const signature = JSON.stringify(apps);
        const supportsUnread = hasUnreadNotificationState(items);
        if (selectedApp && !apps.includes(selectedApp))
            selectedApp = null;
        if (signature !== filterAppsSignature || supportsUnread !== unreadStateAvailable) {
            filterBar.destroy_all_children();
            filterButtons.clear();
            const addFilterButton = (key, text, onClick) => {
                const b = new St.Button({
                    label: text, style_class: 'material-panel-nc-filter-chip',
                    reactive: true, track_hover: true, can_focus: true,
                    x_expand: false,
                });
                try { b.style = `${FONT} font-size: 10px; padding: 4px 9px; border-radius: 999px;`; } catch (e) {}
                b.connect('clicked', onClick);
                filterBar.add_child(b);
                filterButtons.set(key, b);
            };
            addFilterButton('all', 'All apps', () => {
                selectedApp = null;
                updateFilterControls(listNotifications());
                scheduleSearchRebuild();
            });
            if (supportsUnread) {
                addFilterButton('unread', 'Unread', () => {
                    unreadOnly = !unreadOnly;
                    updateFilterControls(listNotifications());
                    scheduleSearchRebuild();
                });
            } else {
                unreadOnly = false;
            }
            // Keep the pill row inside the popup width; app names are also
            // reachable through search, so the remainder is not lost.
            const shownApps = apps.slice(0, 4);
            for (const name of shownApps) {
                addFilterButton(`app:${name}`, name, () => {
                    selectedApp = selectedApp === name ? null : name;
                    updateFilterControls(listNotifications());
                    scheduleSearchRebuild();
                });
            }
            if (apps.length > shownApps.length) {
                const more = ui(`+${apps.length - shownApps.length}`,
                    `${FONT} font-size: 9px; opacity: 0.5; padding: 4px 2px;`);
                filterBar.add_child(more);
            }
            filterAppsSignature = signature;
            unreadStateAvailable = supportsUnread;
        }
        for (const [key, b] of filterButtons) {
            const active = key === 'all' ? selectedApp === null
                : key === 'unread' ? unreadOnly
                    : selectedApp === key.slice(4);
            try { b.set_style_class_name(`material-panel-nc-filter-chip${active ? ' active' : ''}`); }
            catch (e) {}
        }
        filterBar.visible = apps.length > 0 || supportsUnread;
        const clearText = selectedApp ? 'Clear app' : 'Clear';
        try { clearBtn.set_child(ui(clearText, `${FONT} font-size: 10px; font-weight: 600;`)); }
        catch (e) { clearBtn.label = clearText; }
    };

    // Scrollable list
    const scroll = new St.ScrollView({
        style_class: 'material-panel-nc-scroll',
        x_expand: true, y_expand: true, overlay_scrollbars: true,
    });
    try {
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scroll.style = 'max-height: 460px;';
    } catch (e) {}
    const listBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-nc-list', x_expand: true,
        style: 'spacing: 6px;',
    });
    try { scroll.set_child(listBox); } catch (e) { scroll.add_child(listBox); }
    listPage.add_child(scroll);

    // Footer with key hints
    const footer = new St.Button({
        style_class: 'material-panel-nc-footer',
        reactive: true, track_hover: true, x_expand: true,
    });
    try {
        footer.set_child(ui('↑↓ navigate   Enter details   x dismiss   / search   d DND',
            `${FONT} font-size: 9px; opacity: 0.55;`));
    } catch (e) {}
    footer.connect('clicked', () => {
        menuClose(menu);
        openSystemNotificationCenter();
    });
    listPage.add_child(footer);

    // ---- detail page ----------------------------------------------------
    const detailPage = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, visible: false,
        style: 'spacing: 10px;',
    });
    surface.add_child(detailPage);
    const backBtn = new St.Button({label: '← Back', reactive: true, style_class: 'material-panel-nc-back'});
    try { backBtn.style = `${FONT} font-size: 10px; padding: 5px 10px; border-radius: 999px;`; } catch (e) {}
    detailPage.add_child(backBtn);
    const detailIcon = new St.Icon({icon_size: 40, style_class: 'material-panel-nc-avatar'});
    const detailApp = ui('', `${FONT} font-size: 10px; font-weight: 700; opacity: 0.6;`);
    const detailTime = ui('', `${FONT} font-size: 9px; opacity: 0.5;`);
    const detailMeta = new St.BoxLayout({x_expand: true, style: 'spacing: 10px;'});
    detailMeta.add_child(detailIcon);
    const detailMetaText = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style: 'spacing: 2px;'});
    detailMetaText.add_child(detailApp);
    detailMetaText.add_child(detailTime);
    detailMeta.add_child(detailMetaText);
    detailPage.add_child(detailMeta);
    const detailTitle = ui('', `${FONT} font-size: 16px; font-weight: 700;`);
    detailTitle.clutter_text.line_wrap = true;
    detailPage.add_child(detailTitle);
    const detailBody = ui('', `${FONT} font-size: 11px; opacity: 0.8;`);
    detailBody.clutter_text.line_wrap = true;
    detailPage.add_child(detailBody);
    const detailActions = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style: 'spacing: 8px; padding-top: 6px;',
    });
    detailPage.add_child(detailActions);
    const makeDetailButton = (label, onClick) => {
        const b = new St.Button({label, style_class: 'material-panel-nc-detail-action'});
        try { b.style = `${FONT} font-size: 10px; padding: 6px 12px; border-radius: 999px;`; } catch (e) {}
        b.connect('clicked', onClick);
        return b;
    };

    let detailItem = null;
    const showDetail = item => {
        detailItem = item;
        detailPage.visible = true;
        listPage.visible = false;
        detailApp.text = item.appName || 'Application';
        detailTime.text = relativeTime(item.unix);
        detailTitle.text = item.title || item.appName || 'Notification';
        detailBody.text = item.body || 'No message body';
        try { detailIcon.gicon = item.gicon || null; }
        catch (e) { detailIcon.icon_name = 'dialog-information-symbolic'; }
        // Buttons are created fresh for each detail view. Re-adding the actors
        // destroyed by destroy_all_children() triggers a Clutter parent failure
        // and leaves the detail page broken after the second card click.
        detailActions.destroy_all_children();
        if (item.actions?.length) {
            for (const entry of item.actions) {
                detailActions.add_child(makeDetailButton(entry.label, () => {
                    activateNotificationAction(item.notification, entry.action,
                        n => listNotifications().some(c => c.notification === n),
                        error => logError(error, 'material-panel: notification action'));
                    closeDetail();
                    scheduleRebuild(40);
                }));
            }
        }
        detailActions.add_child(makeDetailButton('Open app', () => {
            if (!detailItem) return;
            try { detailItem.notification?.activate?.(); } catch (e) {}
            closeDetail();
            menuClose(menu);
        }));
        detailActions.add_child(makeDetailButton('Dismiss', () => {
            if (!detailItem) return;
            destroyNotification(detailItem.notification);
            closeDetail();
            scheduleRebuild(40);
        }));
    };
    const closeDetail = () => {
        detailItem = null;
        detailPage.visible = false;
        listPage.visible = true;
    };
    backBtn.connect('clicked', closeDetail);

    const hostItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    hostItem.add_child(surface);
    menu.addMenuItem(hostItem);

    // ---- rebuild / debounce ---------------------------------------------
    let destroyedFlag = false;
    const rebuildTimerIds = new Set();
    let searchDebounceId = 0;
    const cancelSearchRebuild = () => {
        if (!searchDebounceId) return;
        try { GLib.source_remove(searchDebounceId); } catch (e) {}
        rebuildTimerIds.delete(searchDebounceId);
        searchDebounceId = 0;
    };
    const cancelRebuildTimers = () => {
        for (const id of rebuildTimerIds) {
            try { GLib.source_remove(id); } catch (e) {}
        }
        rebuildTimerIds.clear();
        searchDebounceId = 0;
    };
    const scheduleRebuild = (delay = 40) => {
        if (destroyedFlag) return;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            rebuildTimerIds.delete(id);
            if (!destroyedFlag) {
                try { rebuild(); } catch (e) {}
            }
            return GLib.SOURCE_REMOVE;
        });
        rebuildTimerIds.add(id);
    };
    const scheduleSearchRebuild = () => {
        cancelSearchRebuild();
        if (destroyedFlag) return;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            rebuildTimerIds.delete(id);
            if (searchDebounceId === id) searchDebounceId = 0;
            if (!destroyedFlag) {
                try { rebuild(); } catch (e) {}
            }
            return GLib.SOURCE_REMOVE;
        });
        searchDebounceId = id;
        rebuildTimerIds.add(id);
    };

    let selection = -1;
    let visibleCards = [];

    const makeCard = item => {
        const card = new St.Button({
            style_class: 'material-panel-nc-card' + (item.unread ? ' unread' : ''),
            reactive: true, track_hover: true, can_focus: true, x_expand: true,
        });
        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 10px; padding: 9px 10px;'});
        const plate = new St.BoxLayout({
            style_class: 'material-panel-nc-avatar-plate',
            style: 'width: 34px; height: 34px; border-radius: 10px; padding: 4px;',
        });
        const avatar = new St.Icon({icon_size: 22, style_class: 'material-panel-nc-avatar'});
        try { avatar.gicon = item.gicon || null; }
        catch (e) { avatar.icon_name = 'dialog-information-symbolic'; }
        plate.add_child(avatar);
        row.add_child(plate);
        const mid = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, style: 'spacing: 2px;',
        });
        const top = new St.BoxLayout({x_expand: true, style: 'spacing: 6px;'});
        if (item.unread) {
            const dot = new St.Widget({
                style_class: 'material-panel-nc-unread-dot', width: 6, height: 6,
                y_align: Clutter.ActorAlign.CENTER,
            });
            top.add_child(dot);
        }
        const app = ui(item.appName || 'App', `${FONT} font-size: 9px; font-weight: ${item.unread ? '700' : '600'}; opacity: 0.6;`);
        app.x_expand = true;
        const time = ui(relativeTime(item.unix), `${FONT} font-size: 9px; opacity: 0.5;`);
        top.add_child(app);
        top.add_child(time);
        mid.add_child(top);
        const title = ui(item.title || item.appName || 'Notification', `${FONT} font-size: 11px; font-weight: 700;`);
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        mid.add_child(title);
        if (item.body) {
            const body = ui(item.body.slice(0, 120), `${FONT} font-size: 10px; opacity: 0.7;`);
            body.clutter_text.line_wrap = true;
            body.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            mid.add_child(body);
        }
        row.add_child(mid);
        const dismiss = new St.Button({
            style_class: 'material-panel-nc-dismiss',
            reactive: true, track_hover: true, can_focus: true,
            y_align: Clutter.ActorAlign.START,
        });
        try { dismiss.set_child(ui('×', `${FONT} font-size: 13px; opacity: 0.6;`)); } catch (e) {}
        setChipA11y(dismiss, `Dismiss notification from ${item.appName || item.title || 'application'}`);
        dismiss.connect('button-press-event', () => Clutter.EVENT_STOP);
        dismiss.connect('clicked', () => {
            destroyNotification(item.notification);
            scheduleRebuild(40);
            return Clutter.EVENT_STOP;
        });
        row.add_child(dismiss);
        if (item.actions?.length) {
            const badge = ui(String(item.actions.length), `${FONT} font-size: 9px; opacity: 0.6; padding: 2px 6px; border-radius: 999px;`);
            row.add_child(badge);
        }
        card.set_child(row);
        setChipA11y(card, `Notification from ${item.appName || 'App'}: ${item.title || 'Notification'}`);
        card.connect('clicked', () => showDetail(item));
        card.connect('button-press-event', (_a, event) => {
            if (event.get_button() === 3) {
                destroyNotification(item.notification);
                scheduleRebuild(40);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        card.connect('key-press-event', (_actor, event) => {
            if (!card.has_key_focus()) return Clutter.EVENT_PROPAGATE;
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter || key === Clutter.KEY_space) {
                showDetail(item);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace) {
                destroyNotification(item.notification);
                scheduleRebuild(40);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        return card;
    };

    const rebuild = () => {
        if (destroyedFlag) return;
        listBox.destroy_all_children();
        visibleCards = [];
        selection = -1;
        let items = listNotifications();
        setCount(items.length);
        countPill.text = String(items.length);
        updateFilterControls(items);
        items = filterNotifications(items, {query: filterText, appName: selectedApp, unreadOnly});
        const shown = items.slice(0, MAX_SHOWN);
        if (shown.length === 0) {
            listBox.add_child(ui(filterText || selectedApp || unreadOnly
                ? 'No matching notifications' : 'No notifications',
                `${FONT} font-size: 11px; opacity: 0.55; padding: 24px 12px; text-align: center;`));
            return;
        }
        for (const group of groupByDay(shown)) {
            listBox.add_child(eyebrow(group.label.toUpperCase()));
            for (const item of group.items) {
                const card = makeCard(item);
                visibleCards.push(card);
                listBox.add_child(card);
            }
        }
        if (items.length > MAX_SHOWN)
            listBox.add_child(ui(`+${items.length - MAX_SHOWN} more`,
                `${FONT} font-size: 10px; opacity: 0.5; padding: 6px;`));
    };

    // ---- interactions ---------------------------------------------------
    const selectCard = delta => {
        if (!visibleCards.length) return;
        if (selection >= 0 && visibleCards[selection])
            visibleCards[selection].remove_style_class_name('selected');
        selection = (selection + delta + visibleCards.length) % visibleCards.length;
        const card = visibleCards[selection];
        card.add_style_class_name('selected');
        card.grab_key_focus();
    };
    let clearArmed = false;
    const clearAll = () => {
        const items = listNotifications().filter(item => !selectedApp || item.appName === selectedApp);
        for (const item of items) destroyNotification(item.notification);
        scheduleRebuild(60);
    };
    clearBtn.connect('clicked', () => {
        if (!clearArmed) {
            clearArmed = true;
            try { clearBtn.set_child(ui('Confirm?', `${FONT} font-size: 10px; font-weight: 700;`)); } catch (e) {}
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                if (!destroyedFlag && clearArmed) {
                    clearArmed = false;
                    try { clearBtn.set_child(ui(selectedApp ? 'Clear app' : 'Clear', `${FONT} font-size: 10px; font-weight: 600;`)); } catch (e) {}
                }
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        clearArmed = false;
        clearAll();
    });

    try {
        searchEntry.clutter_text.connect('text-changed', () => {
            filterText = searchEntry.get_text()?.trim() || '';
            scheduleSearchRebuild();
        });
    } catch (e) {}

    surface.connect('key-press-event', (_actor, event) => {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_slash) {
            try { searchEntry.grab_key_focus(); } catch (e) {}
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_d) {
            dndSettings.set_boolean('show-banners', !dndSettings.get_boolean('show-banners'));
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_j || key === Clutter.KEY_Down) {
            selectCard(1);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_k || key === Clutter.KEY_Up) {
            selectCard(-1);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Return && selection >= 0 && visibleCards[selection]) {
            showDetail(listNotifications()[selection]);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_x && selection >= 0) {
            const items = listNotifications();
            const item = items[selection];
            if (item) {
                destroyNotification(item.notification);
                scheduleRebuild(40);
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            filterText = '';
            selectedApp = null;
            unreadOnly = false;
            try { searchEntry.set_text(''); } catch (e) {}
            cancelSearchRebuild();
            closeDetail();
            rebuild();
        }
    });
    button.connect('clicked', () => {
        if (menu.isOpen) menuClose(menu);
        else { rebuild(); menuOpen(menu); }
    });

    rebuild();

    // ---- MessageTray signals -------------------------------------------
    const trayIds = [];
    const sourceIds = new Map();
    const notificationIds = new Map();
    let countDebounce = 0;
    const scheduleCount = () => {
        if (destroyedFlag || countDebounce) return;
        countDebounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            countDebounce = 0;
            if (destroyedFlag) return GLib.SOURCE_REMOVE;
            try { setCount(listNotifications().length); } catch (e) {}
            if (menu.isOpen) { try { rebuild(); } catch (e) {} }
            return GLib.SOURCE_REMOVE;
        });
    };
    const unhookNotification = notification => {
        const ids = notificationIds.get(notification);
        if (!ids) return;
        for (const id of ids) {
            try { notification.disconnect(id); } catch (e) {}
        }
        notificationIds.delete(notification);
    };
    const hookNotification = notification => {
        if (!notification || notificationIds.has(notification)) return;
        const ids = [];
        try { ids.push(notification.connect('notify::acknowledged', scheduleCount)); } catch (e) {}
        try { ids.push(notification.connect('action-added', scheduleCount)); } catch (e) {}
        try { ids.push(notification.connect('action-removed', scheduleCount)); } catch (e) {}
        try { ids.push(notification.connect('destroy', () => unhookNotification(notification))); } catch (e) {}
        if (ids.length) notificationIds.set(notification, ids);
    };
    const unhookSource = source => {
        const ids = sourceIds.get(source);
        if (ids) {
            for (const id of ids) { try { source.disconnect(id); } catch (e) {} }
            sourceIds.delete(source);
        }
        const notifications = source?.notifications ?? source?._notifications ?? [];
        for (const n of notifications) unhookNotification(n);
    };
    const hookSource = source => {
        if (!source || sourceIds.has(source)) return;
        const ids = [];
        for (const n of source.notifications ?? source._notifications ?? []) hookNotification(n);
        try { ids.push(source.connect('notification-added', (_s, n) => { hookNotification(n); scheduleCount(); })); } catch (e) {}
        try { ids.push(source.connect('notification-removed', (_s, n) => { unhookNotification(n); scheduleCount(); })); } catch (e) {}
        try { ids.push(source.connect('destroy', () => { unhookSource(source); scheduleCount(); })); } catch (e) {}
        if (ids.length) sourceIds.set(source, ids);
    };
    try {
        const tray = Main.messageTray;
        if (tray) {
            try { trayIds.push(tray.connect('source-added', (_t, s) => { hookSource(s); scheduleCount(); })); } catch (e) {}
            try { trayIds.push(tray.connect('source-removed', (_t, s) => { unhookSource(s); scheduleCount(); })); } catch (e) {}
            const sources = typeof tray.getSources === 'function' ? tray.getSources() : (tray._sources ? [...tray._sources] : []);
            for (const s of sources) hookSource(s);
        }
    } catch (e) { logError(e, 'material-panel: notification tray signals'); }
    scheduleCount();

    button.connect('destroy', () => {
        destroyedFlag = true;
        destroyed = true;
        cancelRebuildTimers();
        if (countDebounce) {
            try { GLib.source_remove(countDebounce); } catch (e) {}
            countDebounce = 0;
        }
        for (const source of [...sourceIds.keys()]) unhookSource(source);
        for (const notification of [...notificationIds.keys()]) unhookNotification(notification);
        for (const id of trayIds) {
            try { Main.messageTray?.disconnect?.(id); } catch (e) {}
        }
        try { dndSettings.disconnect(dndChangedId); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    return button;
}
