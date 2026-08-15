import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {iconPath} from '../lib/iconTheme.js';

// Simple GSettings-backed toggle, no dropdown needed - click flips the value.
export function buildDarkMode() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

    const button = new St.Button({
        style_class: 'material-panel-darkmode-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-darkmode-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    const icon = button.get_child();

    const isDark = () => settings.get_string('color-scheme') === 'prefer-dark';

    const update = () => {
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(iconPath(isDark() ? 'dark-mode' : 'light-mode')));
        button.set_style_class_name(
            `material-panel-darkmode-btn material-panel-chip${isDark() ? ' active' : ''}`);
    };
    update();

    button.connect('clicked', () => {
        settings.set_string('color-scheme', isDark() ? 'default' : 'prefer-dark');
    });

    const id = settings.connect('changed::color-scheme', update);
    button.connect('destroy', () => settings.disconnect(id));

    return button;
}
