/**
 * Standalone End-4 Quick Settings — not a skin over the default QS.
 * Layout mirrors end-4 sidebarRight: header, dual slider, toggles, noti, calendar, power.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {buildEnd4NotiSection, buildEnd4CalendarSection} from '../lib/end4QsExtras.js';
import {
    volumeSliderRow,
    brightnessSliderRow,
    darkModeTile,
    dndTile,
    nightLightTile,
    bluetoothTile,
    wifiQsBlock,
    powerRow,
} from './quicksettings.js';
import {buildProfileCard} from './profileCard.js';

function wrapItem(child) {
    const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
    });
    try {
        item.set_style('padding: 4px 0;');
    } catch (e) {}
    item.add_child(child);
    return item;
}

function section(...children) {
    const box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-e4qs-section',
    });
    try {
        box.style = 'spacing: 8px;';
    } catch (e) {}
    for (const c of children) {
        if (c)
            box.add_child(c);
    }
    return box;
}

export function buildQuickSettingsEnd4(_extensionPath, scale = 1.0) {
    const qsIcon = new St.Icon({
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-quicksettings-icon',
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('quicksettings'))),
    });
    const button = new St.Button({
        style_class: 'material-panel-quicksettings-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: qsIcon,
    });

    // Open toward bottom-right of panel button
    const menu = new PopupMenu.PopupMenu(button, 1.0, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-e4qs-menu material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const shell = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'material-panel-e4qs-shell',
    });
    try {
        shell.style =
            'min-width: 380px; max-width: 400px; padding: 12px 14px 14px; spacing: 12px; border-radius: 24px;';
    } catch (e) {}

    // —— Header: profile + prefs ——
    shell.add_child(buildProfileCard({
        onPrefs: () => {
            try {
                Main.extensionManager?.openExtensionPrefs?.(
                    'material-panel@SakibShahariar', '', {});
            } catch (e) {
                try {
                    GLib.spawn_command_line_async(
                        'gnome-extensions prefs material-panel@SakibShahariar');
                } catch (e2) {}
            }
            try { menuClose(menu); } catch (e) {}
        },
    }));

    // —— Dual slider capsule ——
    const dual = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'material-panel-e4qs-dual',
    });
    try {
        dual.style =
            'background-color: rgba(255,255,255,0.10); border-radius: 999px; padding: 6px 10px; spacing: 8px;';
    } catch (e) {}
    const vol = volumeSliderRow();
    const bri = brightnessSliderRow();
    try { vol.x_expand = true; bri.x_expand = true; } catch (e) {}
    dual.add_child(vol);
    dual.add_child(bri);
    shell.add_child(dual);

    // —— Toggle grid 2×N ——
    const grid = new St.Widget({
        style_class: 'material-panel-e4qs-grid',
        x_expand: true,
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            row_homogeneous: false,
            column_spacing: 10,
            row_spacing: 10,
        }),
    });
    const gl = grid.layout_manager;
    const tiles = [
        darkModeTile(),
        dndTile(),
        nightLightTile(),
        bluetoothTile(),
        wifiQsBlock(),
    ];
    tiles.forEach((tile, i) => {
        try {
            tile.style = 'border-radius: 20px; min-height: 64px;';
        } catch (e) {}
        gl.attach(tile, i % 2, Math.floor(i / 2), 1, 1);
    });
    shell.add_child(grid);

    // BT / Wi-Fi expand panels under grid
    const btTile = tiles[3];
    const wifiRow = tiles[4];
    if (btTile?.devicePanel) {
        btTile.devicePanel.visible = false;
        shell.add_child(btTile.devicePanel);
    }
    if (wifiRow?.listPanel) {
        wifiRow.listPanel.visible = false;
        shell.add_child(wifiRow.listPanel);
    }

    // —— Power ——
    shell.add_child(powerRow(menu));

    // —— Notifications ——
    try {
        shell.add_child(buildEnd4NotiSection());
    } catch (e) {
        logError(e, 'material-panel: e4 noti');
    }

    // —— Calendar ——
    try {
        shell.add_child(buildEnd4CalendarSection());
    } catch (e) {
        logError(e, 'material-panel: e4 cal');
    }

    menu.addMenuItem(wrapItem(shell));

    const layoutMenu = () => {
        try {
            const mon = Main.layoutManager.primaryMonitor;
            if (!mon) return;
            const maxH = Math.floor(mon.height * 0.85);
            menu.box.style = `max-height: ${maxH}px; min-width: 380px; border-radius: 24px;`;
            menu.box.clip_to_allocation = true;
        } catch (e) {}
        // Pin near right edge under the QS button
        try {
            menu.actor.x_expand = false;
        } catch (e) {}
    };

    menu.connect('open-state-changed', (_m, open) => {
        if (open)
            layoutMenu();
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else
            menuOpen(menu);
    });
    button.connect('destroy', () => {
        try { menu.destroy(); } catch (e) {}
    });

    try {
        log('material-panel: using End-4 QS (standalone)');
    } catch (e) {}

    return button;
}
