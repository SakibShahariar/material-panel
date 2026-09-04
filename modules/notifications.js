import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPathPrimary} from '../lib/iconTheme.js';
import {wireChipPress} from '../lib/pressFx.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

/**
 * Center-zone chip: visible only while GNOME MessageTray has notifications.
 * Click opens a compact list; footer opens the system notification center.
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
                    const title = n.title || source.title || 'Notification';
                    let body = '';
                    try {
                        body = n.bannerBodyText || n.body || '';
                    } catch (e) {}
                    out.push({source, notification: n, title: String(title), body: String(body || '')});
                } catch (e) {}
            }
        }
    } catch (e) {
        logError(e, 'material-panel: listNotifications');
    }
    return out;
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
        if (Main.messageTray?.toggle)
            Main.messageTray.toggle();
    } catch (e) {}
}

export function buildNotifications(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('notifications'))),
    });
    const label = new St.Label({
        text: '',
        style_class: 'material-panel-notifications-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const box = new St.BoxLayout({
        style_class: 'material-panel-notifications',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });
    box.add_child(icon);
    box.add_child(label);

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
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-list',
        x_expand: true,
    });
    section.actor.add_child(listBox);
    menu.addMenuItem(section);

    const footer = new PopupMenu.PopupMenuItem('Open notification center…');
    footer.connect('activate', () => {
        menu.close();
        openSystemNotificationCenter();
    });
    menu.addMenuItem(footer);

    const rebuild = () => {
        listBox.destroy_all_children();
        const items = listNotifications();
        const count = items.length;
        button.visible = count > 0;
        label.text = count > 0 ? String(count) : '';
        try {
            button.set_tooltip_text(count > 0
                ? `${count} notification${count === 1 ? '' : 's'}`
                : '');
        } catch (e) {}

        if (count === 0) {
            listBox.add_child(new St.Label({
                text: 'No notifications',
                style_class: 'material-panel-notifications-empty',
            }));
            return;
        }

        for (const item of items.slice(0, 12)) {
            const row = new St.Button({
                style_class: 'material-panel-notifications-row',
                reactive: true,
                x_expand: true,
            });
            const col = new St.BoxLayout({vertical: true, x_expand: true});
            col.add_child(new St.Label({
                text: item.title,
                style_class: 'material-panel-notifications-row-title',
                x_expand: true,
            }));
            if (item.body) {
                const b = new St.Label({
                    text: item.body,
                    style_class: 'material-panel-notifications-row-body',
                    x_expand: true,
                });
                try {
                    b.clutter_text.line_wrap = true;
                } catch (e) {}
                col.add_child(b);
            }
            row.set_child(col);
            row.connect('clicked', () => {
                try {
                    item.notification?.activate?.();
                } catch (e) {}
                try {
                    menu.close();
                } catch (e) {}
                openSystemNotificationCenter();
            });
            listBox.add_child(row);
        }
    };

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

    const tick = () => {
        rebuild();
        return GLib.SOURCE_CONTINUE;
    };
    rebuild();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, tick);

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
