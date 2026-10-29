import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {giconForKey, wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';

export function buildNightLight() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.color'});

    const button = new St.Button({
        style_class: 'material-panel-nightlight-btn material-panel-chip',
        reactive: true,
        child: new St.Icon({
            style_class: 'material-panel-nightlight-icon',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
            icon_name: 'night-light-symbolic',
        }),
    });

    const icon = button.get_child();
    let iconKey = 'night-light';
    const press = wireFileIconPress(button, () => [{key: iconKey, icon}]);

    const update = () => {
        const on = settings.get_boolean('night-light-enabled');
        iconKey = 'night-light';
        const fileIcon = giconForKey(iconKey, false, 'neutral');
        try {
            icon.gicon = fileIcon;
            icon.icon_name = fileIcon ? '' : (on ? 'night-light-symbolic' : 'weather-clear-symbolic');
        } catch (e) {}
        setChipA11y(button, `Night light, ${on ? 'on' : 'off'}`);
        press.applyIcons?.();
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
