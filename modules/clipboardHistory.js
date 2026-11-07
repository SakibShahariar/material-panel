import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {menuToggle} from '../lib/shellCompat.js';
import {setChipA11y} from '../lib/a11y.js';

let historyController = null;
let onPauseToggle = null;

export function setClipboardHistoryController(controller, pauseCallback = null) {
    historyController = controller;
    onPauseToggle = typeof pauseCallback === 'function' ? pauseCallback : null;
}

function previewText(value) {
    const preview = String(value).replace(/\s+/g, ' ').trim();
    return preview.length > 72 ? `${preview.slice(0, 69)}…` : preview;
}

export function buildClipboardHistory() {
    const controller = historyController;
    if (!controller?.enabled)
        return null;

    const button = new St.Button({
        style_class: 'material-panel-clipboard-history-btn material-panel-chip',
        reactive: true,
        can_focus: true,
        track_hover: true,
        child: new St.Icon({
            icon_name: 'edit-paste-symbolic',
            icon_size: 18,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    setChipA11y(button, 'Clipboard history');
    button.set_tooltip_text('Clipboard history');

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-clipboard-history-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();

    const rebuildMenu = () => {
        menu.removeAll();
        const header = new PopupMenu.PopupMenuItem(
            controller.paused ? 'Clipboard history · Paused' : 'Clipboard history · Recording');
        header.setSensitive(false);
        menu.addMenuItem(header);
        const pause = new PopupMenu.PopupMenuItem(
            controller.paused ? 'Resume recording' : 'Pause recording');
        pause.connect('activate', () => {
            if (onPauseToggle)
                onPauseToggle(!controller.paused);
            else if (controller.paused)
                controller.resume();
            else
                controller.pause();
            menu.close();
        });
        menu.addMenuItem(pause);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const entries = controller.entries;
        if (!entries.length) {
            const empty = new PopupMenu.PopupMenuItem('No copied text yet');
            empty.setSensitive(false);
            menu.addMenuItem(empty);
            return;
        }

        for (const entry of entries) {
            const item = new PopupMenu.PopupMenuItem(previewText(entry.text));
            item.connect('activate', () => controller.copyEntry(entry.id));
            menu.addMenuItem(item);
        }
    };

    menu.connect('open-state-changed', (_menu, open) => {
        if (open)
            rebuildMenu();
    });
    button.connect('clicked', () => menuToggle(menu));
    button.connect('destroy', () => menu.destroy());
    return button;
}
