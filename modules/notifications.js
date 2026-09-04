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

const MAX_SHOWN = 40;

function listNotifications() {
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
                    let timeText = '';
                    try {
                        const d = n.datetime || n._timestamp;
                        if (d && d.format)
                            timeText = d.format('%H:%M') || '';
                    } catch (e) {}
                    out.push({
                        source,
                        notification: n,
                        appName: String(appName),
                        title: String(title),
                        body: String(body),
                        timeText,
                    });
                } catch (e) {}
            }
        }
    } catch (e) {
        logError(e, 'material-panel: listNotifications');
    }
    return out;
}

function groupByApp(items) {
    const map = new Map();
    for (const it of items) {
        const key = it.appName || 'System';
        if (!map.has(key))
            map.set(key, []);
        map.get(key).push(it);
    }
    return map;
}

function destroyNotification(n) {
    try {
        n.destroy?.(2);
    } catch (e) {
        try { n.destroy?.(0); } catch (e2) {}
    }
}

function openSystemNotificationCenter() {
    try {
        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (dateMenu?.menu) {
            dateMenu.menuOpen(menu);
            return;
        }
    } catch (e) {}
}

export function buildNotifications(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('notifications'))),
    });
    const countLabel = new St.Label({
        text: '',
        style_class: 'material-panel-notifications-count',
        y_align: Clutter.ActorAlign.CENTER,
    });
    countLabel.visible = false;

    const box = new St.BoxLayout({
        style_class: 'material-panel-notifications',
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(countLabel);

    const button = new St.Button({
        style_class: 'material-panel-notifications-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
        visible: false,
    });
    wireChipPress(button, {
        getIcons: () => [{icon, key: 'notifications'}],
        stickyUntilLeave: true,
        restingIcon: 'primary',
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-notifications-popup');
    // uiGroup + manager handled inside attachPopupDismiss
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const root = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-body',
        x_expand: true,
    });

    // Header like notification center
    const header = new St.BoxLayout({
        style_class: 'material-panel-notifications-header',
        x_expand: true,
    });
    const headerTitle = new St.Label({
        text: 'Notifications',
        style_class: 'material-panel-notifications-header-title',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const clearAllBtn = new St.Button({
        style_class: 'material-panel-notifications-clear-all',
        label: 'Clear all',
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    wireChipPress(clearAllBtn, {stickyUntilLeave: true});
    header.add_child(headerTitle);
    header.add_child(clearAllBtn);
    root.add_child(header);

    // Scroll for many notifications
    const scroll = new St.ScrollView({
        style_class: 'material-panel-notifications-scroll',
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
    });
    try {
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    } catch (e) {}
    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-list',
        x_expand: true,
    });
    try {
        scroll.add_child(listBox);
    } catch (e) {
        try { scroll.add_actor(listBox); } catch (e2) {}
    }
    root.add_child(scroll);

    const moreLabel = new St.Label({
        text: '',
        style_class: 'material-panel-notifications-more',
        visible: false,
    });
    root.add_child(moreLabel);

    const footer = new St.Button({
        style_class: 'material-panel-notifications-footer',
        label: 'Open notification center…',
        reactive: true,
        track_hover: true,
        x_expand: true,
    });
    wireChipPress(footer, {stickyUntilLeave: true});
    footer.connect('clicked', () => {
        menuClose(menu);
        openSystemNotificationCenter();
    });
    root.add_child(footer);

    section.actor.add_child(root);
    menu.addMenuItem(section);

    // Cap height so 50 notifs scroll inside
    const applyMaxHeight = () => {
        try {
            const mon = Main.layoutManager.primaryMonitor;
            const maxH = Math.floor((mon?.height || 900) * 0.55);
            scroll.style = `max-height: ${maxH}px;`;
        } catch (e) {}
    };

    const setCount = count => {
        button.visible = count > 0;
        if (count > 0) {
            countLabel.text = count > 99 ? '99+' : String(count);
            countLabel.visible = true;
        } else {
            countLabel.text = '';
            countLabel.visible = false;
        }
    };

    const makeCard = item => {
        const card = new St.Button({
            style_class: 'material-panel-notifications-card',
            reactive: true,
            track_hover: true,
            x_expand: true,
        });
        wireChipPress(card, {stickyUntilLeave: true});
        const row = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'material-panel-notifications-card-row',
        });
        const textCol = new St.BoxLayout({vertical: true, x_expand: true});
        const topLine = new St.BoxLayout({vertical: false, x_expand: true});
        const title = new St.Label({
            text: item.title,
            style_class: 'material-panel-notifications-row-title',
            x_expand: true,
        });
        try { title.clutter_text.ellipsize = Pango.EllipsizeMode.END; } catch (e) {}
        topLine.add_child(title);
        if (item.timeText) {
            topLine.add_child(new St.Label({
                text: item.timeText,
                style_class: 'material-panel-notifications-row-time',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
        textCol.add_child(topLine);
        if (item.body) {
            const b = new St.Label({
                text: item.body,
                style_class: 'material-panel-notifications-row-body',
                x_expand: true,
            });
            try {
                b.clutter_text.line_wrap = true;
                b.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            } catch (e) {}
            textCol.add_child(b);
        }
        const dismiss = new St.Button({
            style_class: 'material-panel-notifications-dismiss',
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 14}),
        });
        wireChipPress(dismiss, {stickyUntilLeave: true});
        dismiss.connect('clicked', () => {
            destroyNotification(item.notification);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                rebuild();
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_STOP;
        });
        row.add_child(textCol);
        row.add_child(dismiss);
        card.set_child(row);
        card.connect('clicked', () => {
            try { item.notification?.activate?.(); } catch (e) {}
            try { menuClose(menu); } catch (e) {}
            openSystemNotificationCenter();
        });
        return card;
    };

    const rebuild = () => {
        listBox.destroy_all_children();
        const items = listNotifications();
        setCount(items.length);
        applyMaxHeight();

        if (items.length === 0) {
            listBox.add_child(new St.Label({
                text: 'No notifications',
                style_class: 'material-panel-notifications-empty',
            }));
            moreLabel.visible = false;
            return;
        }

        const shown = items.slice(0, MAX_SHOWN);
        const grouped = groupByApp(shown);
        for (const [appName, group] of grouped) {
            const appHeader = new St.Label({
                text: appName,
                style_class: 'material-panel-notifications-app-header',
                x_expand: true,
            });
            listBox.add_child(appHeader);
            for (const item of group)
                listBox.add_child(makeCard(item));
        }

        if (items.length > MAX_SHOWN) {
            moreLabel.text = `+${items.length - MAX_SHOWN} more — open notification center`;
            moreLabel.visible = true;
        } else {
            moreLabel.visible = false;
        }
    };

    clearAllBtn.connect('clicked', () => {
        for (const item of listNotifications())
            destroyNotification(item.notification);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            rebuild();
            try { menuClose(menu); } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    });

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            rebuild();
    });
    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            rebuild();
            if (listNotifications().length === 0) {
                openSystemNotificationCenter();
                return;
            }
            menuOpen(menu);
        }
    });

    rebuild();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
        rebuild();
        return GLib.SOURCE_CONTINUE;
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        menu.destroy();
    });
    return button;
}
