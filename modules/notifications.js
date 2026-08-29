import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';

// Notification widget for right panel
// Shows notification count, click to open notification list
// Auto-hides when no notifications

export function buildNotifications(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-notifications material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
        visible: false, // Start hidden
    });

    // Notification icon
    let notifGicon;
    try {
        const p = iconPath('notifications');
        if (Gio.File.new_for_path(p).query_exists(null))
            notifGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            notifGicon = Gio.ThemedIcon.new('mail-unread-symbolic');
    } catch (e) {
        notifGicon = Gio.ThemedIcon.new('mail-unread-symbolic');
    }
    const notifIcon = new St.Icon({
        style_class: 'material-panel-notifications-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: notifGicon,
    });

    const label = new St.Label({
        style_class: 'material-panel-notifications-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(notifIcon);
    box.add_child(label);

    let notificationCount = 0;
    let sourceId = 0;

    const updateVisibility = () => {
        box.visible = notificationCount > 0;
        label.text = notificationCount > 0 ? String(notificationCount) : '';
        try {
            box.set_tooltip_text(notificationCount > 0 ? `${notificationCount} notification${notificationCount > 1 ? 's' : ''}` : 'No notifications');
        } catch (e) {}
    };

    const countNotifications = () => {
        try {
            // Access GNOME Shell's message tray
            const tray = Main.messageTray;
            if (!tray) return 0;

            // Get all sources and sum up their notification counts
            let count = 0;
            if (tray._sources) {
                for (const source of tray._sources) {
                    if (source._notifications) {
                        for (const notif of source._notifications) {
                            if (!notif.isResident && !notif.isTransient) {
                                count++;
                            }
                        }
                    }
                }
            }
            // Also check the summary source (if exists)
            if (tray._summarySource && tray._summarySource._notifications) {
                for (const notif of tray._summarySource._notifications) {
                    if (!notif.isResident && !notif.isTransient) {
                        count++;
                    }
                }
            }
            return count;
        } catch (e) {
            logError(e, 'material-panel: failed to count notifications');
            return 0;
        }
    };

    const update = () => {
        notificationCount = countNotifications();
        updateVisibility();
        return GLib.SOURCE_CONTINUE;
    };

    const onNotificationAdded = () => {
        // Debounce to avoid excessive updates
        if (sourceId) return;
        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            sourceId = 0;
            update();
            return GLib.SOURCE_REMOVE;
        });
    };

    const onNotificationRemoved = () => {
        if (sourceId) return;
        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            sourceId = 0;
            update();
            return GLib.SOURCE_REMOVE;
        });
    };

    // Connect to message tray signals
    let traySignalId = 0;
    let summarySignalId = 0;

    const connectSignals = () => {
        try {
            const tray = Main.messageTray;
            if (tray) {
                traySignalId = tray.connect('notify::sources', onNotificationAdded);
                if (tray._summarySource) {
                    summarySignalId = tray._summarySource.connect('notification-added', onNotificationAdded);
                    tray._summarySource.connect('notification-removed', onNotificationRemoved);
                }
                // Also connect to individual sources
                if (tray._sources) {
                    for (const source of tray._sources) {
                        source.connect('notification-added', onNotificationAdded);
                        source.connect('notification-removed', onNotificationRemoved);
                    }
                }
            }
        } catch (e) {
            logError(e, 'material-panel: failed to connect notification signals');
        }
    };

    const disconnectSignals = () => {
        try {
            const tray = Main.messageTray;
            if (tray) {
                if (traySignalId) tray.disconnect(traySignalId);
                if (tray._summarySource && summarySignalId) tray._summarySource.disconnect(summarySignalId);
                if (tray._sources) {
                    for (const source of tray._sources) {
                        try {
                            source.disconnectByFunc(onNotificationAdded);
                            source.disconnectByFunc(onNotificationRemoved);
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
    };

    // Click to open message tray
    const button = new St.Button({
        style_class: 'material-panel-notifications-btn',
        reactive: true,
        can_focus: true,
        child: box,
    });

    button.connect('clicked', () => {
        try {
            const tray = Main.messageTray;
            if (tray) {
                if (tray.isOpen) {
                    tray.hide();
                } else {
                    tray.show();
                }
            }
        } catch (e) {
            logError(e, 'material-panel: failed to toggle message tray');
        }
        return Clutter.EVENT_STOP;
    });

    // Initial update and periodic check
    connectSignals();
    update();
    const updateId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, update);

    button.connect('destroy', () => {
        disconnectSignals();
        try { GLib.source_remove(updateId); } catch (e) {}
        if (sourceId) {
            GLib.source_remove(sourceId);
            sourceId = 0;
        }
    });

    return button;
}