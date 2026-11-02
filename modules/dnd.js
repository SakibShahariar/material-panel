import GLib from 'gi://GLib';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {giconForKey, wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {getDndFocusSession} from '../lib/dndSession.js';

export function buildDnd() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    const session = getDndFocusSession(settings, {
        now: Date.now,
        schedule: (callback, delayMs) => GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Math.max(1, Math.min(0x7fffffff, Math.ceil(delayMs))),
            () => {
                callback();
                return GLib.SOURCE_REMOVE;
            }),
        cancelSchedule: id => GLib.source_remove(id),
    });

    const button = new St.Button({
        style_class: 'material-panel-dnd-btn material-panel-chip',
        reactive: true,
        can_focus: true,
        accessible_role: St.AccessibleRole.BUTTON,
        child: new St.Icon({
            style_class: 'material-panel-dnd-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    const icon = button.get_child();
    let iconKey = 'dnd-inactive';
    const press = wireFileIconPress(button, () => [{key: iconKey, icon}]);
    const isDndOn = () => !settings.get_boolean('show-banners');

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    const statusItem = new PopupMenu.PopupMenuItem('No active focus session');
    const cancelItem = new PopupMenu.PopupMenuItem('End focus session');
    menu.addMenuItem(statusItem);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    for (const minutes of [25, 50, 90]) {
        const item = new PopupMenu.PopupMenuItem(`Focus for ${minutes} minutes`);
        item.connect('activate', () => {
            session.start(minutes * 60 * 1000);
            menu.close();
        });
        menu.addMenuItem(item);
    }
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    cancelItem.connect('activate', () => {
        session.cancel();
        menu.close();
    });
    menu.addMenuItem(cancelItem);

    const updateMenu = active => {
        statusItem.label.text = active ? 'Focus session active' : 'No active focus session';
        try {
            cancelItem.setSensitive(active);
        } catch (e) {
            cancelItem.actor.reactive = active;
            cancelItem.actor.can_focus = active;
        }
    };

    const update = () => {
        const on = isDndOn();
        const focusActive = session.isActive();
        iconKey = on ? 'dnd-active' : 'dnd-inactive';
        const fileIcon = giconForKey(iconKey, false, 'neutral');
        try {
            icon.gicon = fileIcon;
            icon.icon_name = fileIcon ? '' : (on ? 'notifications-disabled-symbolic' : 'notifications-symbolic');
        } catch (e) {}
        setChipA11y(button,
            `Do not disturb, ${on ? 'on' : 'off'}${focusActive ? ', focus session active' : ''}`);
        button.set_style_class_name(
            `material-panel-dnd-btn material-panel-chip${on ? ' active' : ''}${focusActive ? ' focus-session-active' : ''}`);
        button.set_tooltip_text(focusActive
            ? 'Do not disturb · Focus session active · Right-click to end'
            : 'Do not disturb · Right-click or press Menu for focus sessions');
        press.applyIcons?.();
        updateMenu(focusActive);
    };
    update();

    button.connect('clicked', () => {
        if (session.isActive()) {
            // A direct manual toggle is an explicit override: end the session
            // and turn banners back on, rather than leaving a hidden timer.
            session.cancel();
            settings.set_boolean('show-banners', true);
            return;
        }
        settings.set_boolean('show-banners', isDndOn());
    });

    const settingsId = settings.connect('changed::show-banners', update);
    const unsubscribe = session.subscribe(update);
    const disposePopup = attachPopupDismiss(menu, button);

    button.connect('button-press-event', (_actor, event) => {
        if (event.get_button() !== 3)
            return Clutter.EVENT_PROPAGATE;
        menu.open();
        return Clutter.EVENT_STOP;
    });
    button.connect('key-press-event', (_actor, event) => {
        if (event.get_key_symbol() !== Clutter.KEY_Menu)
            return Clutter.EVENT_PROPAGATE;
        menu.open();
        return Clutter.EVENT_STOP;
    });

    button.connect('destroy', () => {
        try { settings.disconnect(settingsId); } catch (e) {}
        unsubscribe();
        disposePopup();
    });

    return button;
}
