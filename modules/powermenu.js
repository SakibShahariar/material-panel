import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';

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
    attachPopupDismiss(menu, button);

    for (const {label, command} of ACTIONS) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', closeAfter(menu, () => {
            try {
                GLib.spawn_command_line_async(command);
            } catch (e) {
                logError(e, `material-panel: failed to run "${command}"`);
            }
        }));
        menu.addMenuItem(item);
    }

    button.connect('clicked', () => menu.toggle());
    button.connect('destroy', () => menu.destroy());

    return button;
}
