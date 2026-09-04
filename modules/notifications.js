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

/**
 * Right-zone notification chip (badge on icon).
 * Lists MessageTray notifications with dismiss / clear-all / open system center.
 */

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
            for (const n of notifs) {
                try {
                    if (n.isTransient)
                        continue;
                    const title = n.title || source?.title || 'Notification';
                    let body = '';
                    try {
                        body = n.bannerBodyText || n.body || '';
                    } catch (e) {}
                    if (body === 'undefined' || body === undefined)
                        body = '';
                    out.push({
                        source,
                        notification: n,
                        title: String(title),
                        body: String(body || ''),
                    });
                } catch (e) {}
            }
        }
    } catch (e) {
        logError(e, 'material-panel: listNotifications');
    }
    return out;
}

function destroyNotification(n) {
    try {
        if (typeof n.destroy === 'function')
            n.destroy(0); // NotificationDestroyedReason.DISMISSED ≈ 0/2 depending on version
        else if (typeof n.destroy === 'function')
            n.destroy();
    } catch (e1) {
        try {
            n.destroy?.(2);
        } catch (e2) {}
    }
}

function openSystemNotificationCenter() {
    try {
        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (dateMenu?.menu) {
            dateMenu.menu.open();
            return;
        }
    } catch (e) {}
    try {
        Main.messageTray?.toggle?.();
    } catch (e) {}
}

export function buildNotifications(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('notifications'))),
    });

    // Badge count overlaid on the icon (right-top)
    const badge = new St.Label({
        text: '',
        style_class: 'material-panel-notifications-badge',
        y_align: Clutter.ActorAlign.START,
        x_align: Clutter.ActorAlign.END,
    });
    badge.visible = false;

    const iconWrap = new St.Widget({
        style_class: 'material-panel-notifications-icon-wrap',
        layout_manager: new Clutter.BinLayout(),
        y_align: Clutter.ActorAlign.CENTER,
    });
    iconWrap.add_child(icon);
    iconWrap.add_child(badge);

    const button = new St.Button({
        style_class: 'material-panel-notifications-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: iconWrap,
        visible: false,
    });
    wireChipPress(button, {
        getIcons: () => [{icon, key: 'notifications'}],
        stickyUntilLeave: true,
        restingIcon: 'primary',
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-notifications-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-body',
        x_expand: true,
    });

    const header = new St.BoxLayout({
        style_class: 'material-panel-notifications-header',
        x_expand: true,
        vertical: false,
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
        y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(headerTitle);
    header.add_child(clearAllBtn);
    body.add_child(header);

    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-list',
        x_expand: true,
    });
    body.add_child(listBox);
    section.actor.add_child(body);
    menu.addMenuItem(section);

    const footer = new PopupMenu.PopupMenuItem('Open notification center…');
    footer.connect('activate', () => {
        menu.close();
        openSystemNotificationCenter();
    });
    menu.addMenuItem(footer);

    const setCount = count => {
        button.visible = count > 0;
        if (count > 0) {
            badge.text = count > 99 ? '99+' : String(count);
            badge.visible = true;
        } else {
            badge.text = '';
            badge.visible = false;
        }
        try {
            button.set_tooltip_text(count > 0
                ? `${count} notification${count === 1 ? '' : 's'}`
                : '');
        } catch (e) {}
    };

    const rebuild = () => {
        listBox.destroy_all_children();
        const items = listNotifications();
        setCount(items.length);

        if (items.length === 0) {
            listBox.add_child(new St.Label({
                text: 'No notifications',
                style_class: 'material-panel-notifications-empty',
            }));
            return;
        }

        for (const item of items.slice(0, 20)) {
            const card = new St.BoxLayout({
                vertical: false,
                style_class: 'material-panel-notifications-card',
                x_expand: true,
            });

            const textCol = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                style_class: 'material-panel-notifications-card-text',
            });
            const title = new St.Label({
                text: item.title,
                style_class: 'material-panel-notifications-row-title',
                x_expand: true,
            });
            try {
                title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            } catch (e) {}
            textCol.add_child(title);
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
                y_align: Clutter.ActorAlign.START,
                child: new St.Icon({
                    icon_name: 'window-close-symbolic',
                    icon_size: 14,
                }),
            });
            dismiss.connect('clicked', () => {
                destroyNotification(item.notification);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                    rebuild();
                    return GLib.SOURCE_REMOVE;
                });
                return Clutter.EVENT_STOP;
            });

            const openBtn = new St.Button({
                style_class: 'material-panel-notifications-open',
                reactive: true,
                x_expand: true,
                child: textCol,
            });
            openBtn.connect('clicked', () => {
                try {
                    item.notification?.activate?.();
                } catch (e) {}
                try {
                    menu.close();
                } catch (e) {}
                openSystemNotificationCenter();
            });

            card.add_child(openBtn);
            card.add_child(dismiss);
            listBox.add_child(card);
        }
    };

    clearAllBtn.connect('clicked', () => {
        for (const item of listNotifications())
            destroyNotification(item.notification);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            rebuild();
            try { menu.close(); } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    });

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            rebuild();
    });
    button.connect('clicked', () => {
        if (menu.isOpen)
            menu.close();
        else {
            rebuild();
            if (listNotifications().length === 0) {
                openSystemNotificationCenter();
                return;
            }
            menu.open();
        }
    });

    rebuild();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
        rebuild();
        return GLib.SOURCE_CONTINUE;
    });
    const signalIds = [];
    try {
        const tray = Main.messageTray;
        if (tray?.connect) {
            signalIds.push([tray, tray.connect('source-added', () => rebuild())]);
            signalIds.push([tray, tray.connect('source-removed', () => rebuild())]);
        }
    } catch (e) {}

    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        for (const [obj, sid] of signalIds) {
            try { obj.disconnect(sid); } catch (e) {}
        }
        menu.destroy();
    });

    return button;
}
