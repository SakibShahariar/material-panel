import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {iconPath} from '../lib/iconTheme.js';

export function buildNightLight() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});

    const button = new St.Button({
        style_class: 'material-panel-nightlight-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-nightlight-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPath('night-light'))),
        }),
    });

    const update = () => {
        const on = settings.get_boolean('night-light-enabled');
        button.set_style_class_name(
            `material-panel-nightlight-btn material-panel-chip${on ? ' active' : ''}`);
    };
    update();

    button.connect('clicked', () => {
        settings.set_boolean('night-light-enabled', !settings.get_boolean('night-light-enabled'));
    });

    const id = settings.connect('changed::night-light-enabled', update);
    button.connect('destroy', () => settings.disconnect(id));

    return button;
}
