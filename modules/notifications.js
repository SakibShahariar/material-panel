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
                    if (!body || body === 'undefined')
                        body = '';
                    out.push({
                        source,
                        notification: n,
                        title: String(title),
                        body: String(body),
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
        n.destroy?.(2);
    } catch (e) {
        try { n.destroy?.(0); } catch (e2) {}
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
}

export function buildNotifications(_extensionPath, scale = 1.0) {
    // Clean layout: bell + count as text (Waybar-style), not a broken overlay
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
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    // Open animation (Hyprland-ish fade + slight slide)
    menu.connect('open-state-changed', (_m, open) => {
        try {
            if (open) {
                menu.actor.opacity = 0;
                menu.actor.translation_y = -8;
                menu.actor.ease({
                    opacity: 255,
                    translation_y: 0,
                    duration: 160,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            }
        } catch (e) {}
    });

    const section = new PopupMenu.PopupMenuSection();
    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-body',
        x_expand: true,
    });

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
    body.add_child(header);

    const listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-notifications-list',
        x_expand: true,
    });
    body.add_child(listBox);
    section.actor.add_child(body);
    menu.addMenuItem(section);

    const footer = new St.Button({
        style_class: 'material-panel-notifications-footer',
        label: 'Open notification center…',
        reactive: true,
        track_hover: true,
        x_expand: true,
    });
    wireChipPress(footer, {stickyUntilLeave: true});
    footer.connect('clicked', () => {
        menu.close();
        openSystemNotificationCenter();
    });
    const footerItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    footerItem.add_child(footer);
    menu.addMenuItem(footerItem);

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
            const textCol = new St.BoxLayout({
                vertical: true,
                x_expand: true,
            });
            const title = new St.Label({
                text: item.title,
                style_class: 'material-panel-notifications-row-title',
                x_expand: true,
            });
            try { title.clutter_text.ellipsize = Pango.EllipsizeMode.END; } catch (e) {}
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
                track_hover: true,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 14}),
            });
            wireChipPress(dismiss, {stickyUntilLeave: true});
            dismiss.connect('clicked', () => {
                destroyNotification(item.notification);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
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
                try { menu.close(); } catch (e) {}
                openSystemNotificationCenter();
            });
            listBox.add_child(card);
        }
    };

    clearAllBtn.connect('clicked', () => {
        for (const item of listNotifications())
            destroyNotification(item.notification);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
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
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        menu.destroy();
    });
    return button;
}
