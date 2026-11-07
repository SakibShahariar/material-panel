import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {ConfigStore} from '../lib/configStore.js';
import {normalizeStatusIndicatorPreferences} from '../lib/statusIndicatorState.js';

function openSettings(schemaId) {
    try {
        return new Gio.Settings({schema_id: schemaId});
    } catch (error) {
        logError(error, `material-panel: status indicator schema unavailable: ${schemaId}`);
        return null;
    }
}

/** Informational-only aggregate; existing modules retain control ownership. */
export function buildStatusIndicators(_extensionPath, scale = 1.0) {
    const dndSettings = openSettings('org.gnome.desktop.notifications');
    const nightLightSettings = openSettings('org.gnome.settings-daemon.plugins.color');
    const box = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-status-indicators material-panel-chip',
        style: 'spacing: 5px;',
        reactive: false,
        can_focus: true,
        visible: false,
    });
    try { box.accessible_role = St.AccessibleRole.GROUP; } catch (e) {}

    const entries = [];
    const addEntry = (id, settings, key, activeIcon, inactiveIcon, label) => {
        if (!settings)
            return;
        const icon = new St.Icon({
            style_class: `material-panel-status-indicator-icon material-panel-status-indicator-${id}`,
            icon_size: Math.round(16 * (scale || 1.0)),
            y_align: Clutter.ActorAlign.CENTER,
            icon_name: inactiveIcon,
        });
        box.add_child(icon);
        entries.push({id, settings, key, activeIcon, inactiveIcon, label, icon, handlerId: 0});
    };
    addEntry('dnd', dndSettings, 'show-banners',
        'notifications-disabled-symbolic', 'notifications-symbolic', 'Do Not Disturb');
    addEntry('nightlight', nightLightSettings, 'night-light-enabled',
        'night-light-symbolic', 'weather-clear-symbolic', 'Night Light');

    let preferences = normalizeStatusIndicatorPreferences(null);
    let destroyed = false;
    const update = () => {
        if (destroyed)
            return;
        const visibleLabels = [];
        for (const entry of entries) {
            let active = false;
            try {
                active = entry.id === 'dnd'
                    ? !entry.settings.get_boolean(entry.key)
                    : entry.settings.get_boolean(entry.key);
            } catch (error) {
                entry.icon.hide();
                continue;
            }
            const option = preferences[entry.id];
            const visible = option.enabled && (active || option.showInactive);
            entry.icon.visible = visible;
            entry.icon.icon_name = active ? entry.activeIcon : entry.inactiveIcon;
            entry.icon.set_style_class_name(
                `material-panel-status-indicator-icon material-panel-status-indicator-${entry.id}${active ? ' active' : ' inactive'}`);
            if (visible)
                visibleLabels.push(`${entry.label} ${active ? 'on' : 'off'}`);
        }
        box.visible = visibleLabels.length > 0;
        const accessibleName = visibleLabels.join(', ');
        try {
            box.accessible_name = accessibleName || 'No visible system status indicators';
            box.set_tooltip_text(accessibleName || 'No visible system status indicators');
        } catch (e) {}
    };

    for (const entry of entries)
        entry.handlerId = entry.settings.connect(`changed::${entry.key}`, update);

    new ConfigStore().loadAsync().then(config => {
        if (destroyed)
            return;
        preferences = normalizeStatusIndicatorPreferences(config.statusIndicatorPreferences);
        update();
    }).catch(error => {
        logError(error, 'material-panel: failed to load status indicator preferences');
        if (!destroyed)
            update();
    });

    box.connect('destroy', () => {
        destroyed = true;
        for (const entry of entries) {
            if (entry.handlerId) {
                try { entry.settings.disconnect(entry.handlerId); } catch (e) {}
                entry.handlerId = 0;
            }
        }
    });
    return box;
}
