import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {giconForKey, wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';

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
    let iconKey = 'dnd-inactive';
    const press = wireFileIconPress(button, () => [{key: iconKey, icon}]);

    const isDndOn = () => !settings.get_boolean('show-banners');

    const update = () => {
        const on = isDndOn();
        iconKey = on ? 'dnd-active' : 'dnd-inactive';
        const fileIcon = giconForKey(iconKey, false, 'neutral');
        try {
            icon.gicon = fileIcon;
            icon.icon_name = fileIcon ? '' : (on ? 'notifications-disabled-symbolic' : 'notifications-symbolic');
        } catch (e) {}
        setChipA11y(button, `Do not disturb, ${on ? 'on' : 'off'}`);
        button.set_style_class_name(
            `material-panel-dnd-btn material-panel-chip${on ? ' active' : ''}`);
        press.applyIcons?.();
    };
    update();

    button.connect('clicked', () => {
        settings.set_boolean('show-banners', isDndOn());
    });

    const id = settings.connect('changed::show-banners', update);
    button.connect('destroy', () => settings.disconnect(id));

    return button;
}
