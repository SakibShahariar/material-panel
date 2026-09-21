/**
 * Ryoku-inspired QS structure (rail + stage). Matugen colors only.
 * Builders injected from quicksettings.js to avoid circular imports.
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {buildProfileCard} from './profileCard.js';
import {buildMediaPlayerRow} from './mediaPlayer.js';
import {menuClose} from '../lib/shellCompat.js';

const ROUTES = [
    {id: 'sound', label: 'Sound'},
    {id: 'network', label: 'Net'},
    {id: 'bluetooth', label: 'BT'},
    {id: 'session', label: 'Session'},
];

/**
 * @param {object} menu
 * @param {object} api - builders from quicksettings.js
 */
export function fillRyokuQsMenu(menu, api) {
    const {
        volumeSliderRow,
        brightnessSliderRow,
        darkModeTile,
        nightLightTile,
        dndTile,
        powerRow,
        wifiQsBlock,
        bluetoothTile,
        openExtensionPrefs,
    } = api;

    const root = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-ryoku-qs',
        x_expand: true,
        style: 'spacing: 10px; min-width: 360px; max-width: 400px;',
    });

    root.add_child(buildProfileCard({
        onPrefs: () => {
            try { openExtensionPrefs(); } catch (e) {}
            try { menuClose(menu); } catch (e) {}
        },
    }));
    root.add_child(buildMediaPlayerRow());

    const body = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-ryoku-body',
        x_expand: true,
        style: 'spacing: 10px;',
    });
    const rail = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-ryoku-rail',
        style: 'spacing: 4px; min-width: 72px;',
    });
    const stageHost = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-ryoku-stage',
        x_expand: true,
        style: 'spacing: 8px; min-width: 260px;',
    });

    const stages = {};
    const mk = (id, title, fill) => {
        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 8px;',
            visible: false,
        });
        box.add_child(new St.Label({
            text: title,
            style_class: 'material-panel-ryoku-stage-title',
        }));
        try { fill(box); } catch (e) { logError(e, `material-panel: ryoku stage ${id}`); }
        stages[id] = box;
        stageHost.add_child(box);
    };

    mk('sound', 'Sound & display', box => {
        box.add_child(volumeSliderRow());
        box.add_child(brightnessSliderRow());
    });
    mk('network', 'Network', box => {
        box.add_child(wifiQsBlock());
    });
    mk('bluetooth', 'Bluetooth', box => {
        box.add_child(bluetoothTile());
    });
    mk('session', 'Session', box => {
        try { box.add_child(darkModeTile()); } catch (e) {}
        try { box.add_child(nightLightTile()); } catch (e) {}
        try { box.add_child(dndTile()); } catch (e) {}
        try { box.add_child(powerRow(menu)); } catch (e) {}
    });

    let route = 'sound';
    const railButtons = {};
    const setRoute = id => {
        route = id;
        for (const r of ROUTES) {
            const on = r.id === id;
            try {
                railButtons[r.id].set_style_class_name(
                    `material-panel-ryoku-rail-btn${on ? ' active' : ''}`);
            } catch (e) {}
            try { stages[r.id].visible = on; } catch (e) {}
        }
    };

    for (const r of ROUTES) {
        const b = new St.Button({
            style_class: `material-panel-ryoku-rail-btn${r.id === route ? ' active' : ''}`,
            label: r.label,
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
        });
        try { b.style = 'padding: 10px 8px; border-radius: 12px; font-weight: 600;'; } catch (e) {}
        railButtons[r.id] = b;
        b.connect('clicked', () => setRoute(r.id));
        rail.add_child(b);
    }

    body.add_child(rail);
    body.add_child(stageHost);
    root.add_child(body);
    setRoute('sound');

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(root);
    menu.addMenuItem(item);
}
