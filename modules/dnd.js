import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {iconPath} from '../lib/iconTheme.js';

// show-banners=false means Do Not Disturb is ON - inverted from the schema
// key's own naming, worth keeping the inversion contained to this module.
export function buildDnd() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});

    const button = new St.Button({
        style_class: 'material-panel-dnd-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-dnd-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    const icon = button.get_child();

    const isDndOn = () => !settings.get_boolean('show-banners');

    const update = () => {
        icon.gicon = Gio.FileIcon.new(
            Gio.File.new_for_path(iconPath(isDndOn() ? 'dnd-active' : 'dnd-inactive')));
        button.set_style_class_name(
            `material-panel-dnd-btn material-panel-chip${isDndOn() ? ' active' : ''}`);
    };
    update();

    button.connect('clicked', () => {
        settings.set_boolean('show-banners', isDndOn());
    });

    const id = settings.connect('changed::show-banners', update);
    button.connect('destroy', () => settings.disconnect(id));

    return button;
}
