import {setChipA11y} from '../lib/a11y.js';
import {wireChipPress} from '../lib/pressFx.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {startNetSpeedMonitor} from '../lib/netSpeedMonitor.js';

export function buildNetworkSpeed(_extensionPath, scale = 1.0) {
    let last = {down: 0, up: 0, downText: '—', upText: '—', iface: null};
    let sessionRx = 0, sessionTx = 0;

    // Symbolic icon — CSS color works (primary / on-primary on press)
    const icon = new St.Icon({
        style_class: 'material-panel-network-speed-icon',
        icon_name: 'network-transmit-receive-symbolic',
        icon_size: Math.round(16 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
    });

    const button = new St.Button({
        style_class: 'material-panel-network-speed material-panel-chip material-panel-network-speed-btn',
        reactive: true,
        track_hover: true,
        child: icon,
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-net-speed-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-net-speed-popup-body',
    });
    body.add_child(new St.Label({
        text: 'Network speed',
        style_class: 'material-panel-net-speed-popup-title',
    }));
    const ifaceL = new St.Label({text: '—', style_class: 'material-panel-net-speed-popup-iface'});
    const downL = new St.Label({text: '↓ —', style_class: 'material-panel-net-speed-popup-down'});
    const upL = new St.Label({text: '↑ —', style_class: 'material-panel-net-speed-popup-up'});
    const sessL = new St.Label({text: '', style_class: 'material-panel-net-speed-popup-iface'});
    body.add_child(ifaceL);
    body.add_child(downL);
    body.add_child(upL);
    body.add_child(sessL);
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const refreshPopup = () => {
        ifaceL.text = last.iface ? `Interface: ${last.iface}` : 'Interface: —';
        downL.text = `↓ Download  ${last.downText}`;
        upL.text = `↑ Upload  ${last.upText}`;
        const fmtTot = n => {
            n = Math.max(0, Number(n) || 0);
            if (n < 1024) return `${Math.round(n)} B`;
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
            if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
            return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        sessL.text = `Session  ↓ ${fmtTot(sessionRx)}  ↑ ${fmtTot(sessionTx)}`;
    };

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            refreshPopup();
            menuOpen(menu);
        }
    });

    const stopMonitor = startNetSpeedMonitor(sample => {
        sessionRx += sample.down;
        sessionTx += sample.up;
        last = {
            down: sample.down,
            up: sample.up,
            downText: sample.downText,
            upText: sample.upText,
            iface: sample.iface,
        };
        try {
            button.set_tooltip_text(sample.iface
                ? `${sample.iface}\n↓ ${sample.downText}\n↑ ${sample.upText}`
                : 'Network speed unavailable');
        } catch (e) {}
        if (menu.isOpen)
            refreshPopup();
    }, 1, () => {
        try { return Boolean(Main.layoutManager.primaryMonitor?.inFullscreen); }
        catch (e) { return false; }
    });

    button.connect('destroy', () => {
        try { stopMonitor(); } catch (e) {}
        menu.destroy();
    });

    try { wireChipPress(button, {stickyUntilLeave: true}); } catch (e) {}
    try { setChipA11y(button, 'Network speed'); } catch (e) {}
    return button;
}
