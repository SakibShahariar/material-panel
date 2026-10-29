import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {giconForKey, wireFileIconPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';

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
    let iconKey = 'dark-mode';
    const press = wireFileIconPress(button, () => [{key: iconKey, icon}]);

    const isDark = () => settings.get_string('color-scheme') === 'prefer-dark';

    const update = () => {
        const on = isDark();
        iconKey = on ? 'dark-mode' : 'light-mode';
        const fileIcon = giconForKey(iconKey, false, 'neutral');
        try {
            icon.gicon = fileIcon;
            icon.icon_name = fileIcon ? '' : (on ? 'weather-clear-night-symbolic' : 'weather-clear-symbolic');
        } catch (e) {}
        setChipA11y(button, `Dark mode, ${on ? 'on' : 'off'}`);
        button.set_style_class_name(
            `material-panel-darkmode-btn material-panel-chip${on ? ' active' : ''}`);
        press.applyIcons?.();
    };
    update();

    button.connect('clicked', () => {
        settings.set_string('color-scheme', isDark() ? 'default' : 'prefer-dark');
    });

    const id = settings.connect('changed::color-scheme', update);
    button.connect('destroy', () => settings.disconnect(id));

    return button;
}
