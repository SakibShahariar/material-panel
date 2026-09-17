/**
 * Omarchy-style system tray drawer (chevron chip + expand host for foreign SNI).
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {wirePressedClass} from './pressFx.js';

export class TrayDrawer {
    constructor() {
        this.root = new St.BoxLayout({
            style_class: 'material-panel-tray-drawer-root',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        try { this.root.style = 'spacing: 4px;'; } catch (e) {}

        this._open = false;
        this._sticky = false;
        this._leaveId = 0;

        this.chevron = new St.Button({
            style_class: 'material-panel-tray-chevron material-panel-chip',
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            // Force visible even before theme applies
            this.chevron.style =
                'padding: 4px 10px; min-width: 36px; border-radius: 999px;';
        } catch (e) {}

        const chevBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-tray-chevron-inner',
        });
        try { chevBox.style = 'spacing: 6px;'; } catch (e) {}

        this._chevIcon = new St.Icon({
            icon_name: 'pan-start-symbolic',
            icon_size: 14,
            style_class: 'material-panel-tray-chevron-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._countLabel = new St.Label({
            text: '0',
            style_class: 'material-panel-tray-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this._countLabel.style = 'font-size: 11px; font-weight: 700;';
        } catch (e) {}
        chevBox.add_child(this._chevIcon);
        chevBox.add_child(this._countLabel);
        this.chevron.set_child(chevBox);
        try { wirePressedClass(this.chevron); } catch (e) {}

        this.host = new St.BoxLayout({
            style_class: 'material-panel-tray-drawer-host',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
            reactive: true,
            track_hover: true,
        });
        try { this.host.style = 'spacing: 4px; padding: 0 4px;'; } catch (e) {}

        this.root.add_child(this.host);
        this.root.add_child(this.chevron);

        this.chevron.connect('clicked', () => {
            if (this._open && this._sticky) {
                this.close();
            } else {
                this._sticky = true;
                this.open();
            }
            return Clutter.EVENT_STOP;
        });

        const onEnter = () => {
            this._cancelClose();
            if (!this._open)
                this.open();
        };
        const onLeave = () => {
            if (!this._sticky)
                this._scheduleClose();
        };
        for (const actor of [this.root, this.chevron, this.host]) {
            try {
                actor.connect('enter-event', () => {
                    onEnter();
                    return Clutter.EVENT_PROPAGATE;
                });
                actor.connect('leave-event', () => {
                    onLeave();
                    return Clutter.EVENT_PROPAGATE;
                });
            } catch (e) {}
        }

        this.host.connect('actor-added', () => this._updateCount());
        this.host.connect('actor-removed', () => this._updateCount());
        this._updateCount();
        log('material-panel: TrayDrawer constructed');
    }

    add(child) {
        try {
            if (child.get_parent())
                child.get_parent().remove_child(child);
        } catch (e) {}
        this.host.add_child(child);
        this._updateCount();
        log(`material-panel: tray drawer child + → ${this.host.get_n_children()}`);
    }

    addStart(child) {
        this.add(child);
    }

    open() {
        this._cancelClose();
        this._open = true;
        this.host.visible = true;
        try { this._chevIcon.icon_name = 'pan-end-symbolic'; } catch (e) {}
        try { this.root.add_style_class_name('open'); } catch (e) {}
        this._updateCount();
    }

    close() {
        this._cancelClose();
        this._open = false;
        this._sticky = false;
        this.host.visible = false;
        try { this._chevIcon.icon_name = 'pan-start-symbolic'; } catch (e) {}
        try { this.root.remove_style_class_name('open'); } catch (e) {}
        this._updateCount();
    }

    toggle() {
        if (this._open)
            this.close();
        else {
            this._sticky = true;
            this.open();
        }
    }

    _scheduleClose() {
        this._cancelClose();
        this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
            this._leaveId = 0;
            if (this._sticky)
                return GLib.SOURCE_REMOVE;
            this.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelClose() {
        if (this._leaveId) {
            try { GLib.source_remove(this._leaveId); } catch (e) {}
            this._leaveId = 0;
        }
    }

    _updateCount() {
        try {
            const n = this.host.get_n_children();
            this._countLabel.text = String(n);
            this._countLabel.visible = true;
        } catch (e) {}
    }

    destroy() {
        this._cancelClose();
        // Evict foreign indicators — never destroy them with the drawer
        try {
            if (this.host) {
                for (const child of [...(this.host.get_children?.() || [])]) {
                    try { this.host.remove_child(child); } catch (e) {}
                }
            }
        } catch (e) {}
        try { this.root.destroy(); } catch (e) {}
    }
}
