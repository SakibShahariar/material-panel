import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPathPrimary} from '../lib/iconTheme.js';

export function buildActivities(_extensionPath, scale = 1.0) {
    const button = new St.Button({
        style_class: 'material-panel-activities-btn material-panel-chip',
        child: new St.Icon({
            style_class: 'material-panel-activities-icon',
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('apps'))),
            icon_size: Math.round(17 * scale),
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    button.connect('clicked', () => Main.overview.toggle());
    return button;
}
