import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath} from '../lib/iconTheme.js';

// Uses loginctl/systemctl via spawn rather than talking to logind's D-Bus
// interface directly - much less risk of a subtly wrong method signature,
// and these commands are stable across distros with systemd.
const ACTIONS = [
    {label: 'Lock', command: 'loginctl lock-session'},
    {label: 'Suspend', command: 'systemctl suspend'},
    {label: 'Restart', command: 'systemctl reboot'},
    {label: 'Shut Down', command: 'systemctl poweroff'},
];

export function buildPowerMenu() {
    const button = new St.Button({
        style_class: 'material-panel-powermenu-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-powermenu-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('shutdown'))),
        }),
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    // Dismiss on outside click / Esc (same logic as network/quicksettings)
    {
        const stage = global.stage;
        const isMenuOpen = () => menu.isOpen ?? menu.actor.visible;
        const clickId = stage.connect('captured-event', (actor, event) => {
            if (!isMenuOpen()) return Clutter.EVENT_PROPAGATE;
            if (event.type() !== Clutter.EventType.BUTTON_PRESS) return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
            if (!target) return Clutter.EVENT_PROPAGATE;
            let cur = target;
            while (cur) {
                if (cur === menu.actor || cur === button) return Clutter.EVENT_PROPAGATE;
                cur = cur.get_parent();
            }
            try {
                if (menu.actor.contains(target) || button.contains(target))
                    return Clutter.EVENT_PROPAGATE;
            } catch (e) {}
            menu.close();
            return Clutter.EVENT_PROPAGATE;
        });
        const keyId = stage.connect('captured-event', (actor, event) => {
            if (!isMenuOpen()) return Clutter.EVENT_PROPAGATE;
            if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                menu.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const cleanup = () => {
            try { stage.disconnect(clickId); } catch (e) {}
            try { stage.disconnect(keyId); } catch (e) {}
        };
        menu.actor.connect('destroy', cleanup);
        button.connect('destroy', cleanup);
    }

    for (const {label, command} of ACTIONS) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', () => {
            try {
                GLib.spawn_command_line_async(command);
            } catch (e) {
                logError(e, `material-panel: failed to run "${command}"`);
            }
        });
        menu.addMenuItem(item);
    }

    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => menu.destroy());

    return button;
}
