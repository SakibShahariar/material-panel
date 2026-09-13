/**
 * Omarchy-style system tray drawer:
 * collapsed = chevron chip; hover/click expands a row of foreign SNI icons.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {wirePressedClass} from './pressFx.js';

export class TrayDrawer {
    constructor() {
        this.root = new St.BoxLayout({
            style_class: 'material-panel-tray-drawer-root',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        try { this.root.style = 'spacing: 2px;'; } catch (e) {}

        this._open = false;
        this._leaveId = 0;

        this.chevron = new St.Button({
            style_class: 'material-panel-tray-chevron material-panel-chip',
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const chevBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-tray-chevron-inner',
        });
        try { chevBox.style = 'spacing: 4px;'; } catch (e) {}
        this._chevLabel = new St.Label({
            text: '‹',
            style_class: 'material-panel-tray-chevron-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this._chevLabel.style = 'font-size: 14px; font-weight: 700; padding: 0 2px;';
        } catch (e) {}
        this._countLabel = new St.Label({
            text: '',
            style_class: 'material-panel-tray-count',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        try {
            this._countLabel.style = 'font-size: 10px; font-weight: 700; opacity: 0.75;';
        } catch (e) {}
        chevBox.add_child(this._chevLabel);
        chevBox.add_child(this._countLabel);
        this.chevron.set_child(chevBox);
        try { wirePressedClass(this.chevron); } catch (e) {}

        // Drawer hosts foreign wrappers
        this.host = new St.BoxLayout({
            style_class: 'material-panel-tray-drawer-host',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
            reactive: true,
            track_hover: true,
        });
        try { this.host.style = 'spacing: 4px; padding: 0 2px;'; } catch (e) {}

        this.root.add_child(this.host);
        this.root.add_child(this.chevron); // chevron on the outer edge (right)

        this.chevron.connect('clicked', () => this.toggle());
        this.chevron.connect('notify::hover', () => {
            if (this.chevron.hover)
                this.open();
            else
                this._scheduleClose();
        });
        this.host.connect('notify::hover', () => {
            if (this.host.hover)
                this.open();
            else
                this._scheduleClose();
        });
        this.root.connect('notify::hover', () => {
            if (this.root.hover)
                this.open();
            else
                this._scheduleClose();
        });

        // Watch host children for count badge
        this.host.connect('actor-added', () => this._updateCount());
        this.host.connect('actor-removed', () => this._updateCount());
        this._updateCount();
    }

    /** Zone-compatible add/addStart for statusAreaBridge */
    add(child) {
        this.host.add_child(child);
        this._updateCount();
    }

    addStart(child) {
        this.host.insert_child_at_index(child, 0);
        this._updateCount();
    }

    open() {
        this._cancelClose();
        if (this._open)
            return;
        this._open = true;
        this.host.visible = true;
        this._chevLabel.text = '›';
        try { this.root.add_style_class_name('open'); } catch (e) {}
    }

    close() {
        this._cancelClose();
        if (!this._open)
            return;
        this._open = false;
        this.host.visible = false;
        this._chevLabel.text = '‹';
        try { this.root.remove_style_class_name('open'); } catch (e) {}
    }

    toggle() {
        if (this._open)
            this.close();
        else
            this.open();
    }

    _scheduleClose() {
        this._cancelClose();
        this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 280, () => {
            this._leaveId = 0;
            // Stay open if still hovering drawer/chevron
            try {
                if (this.root.hover || this.chevron.hover || this.host.hover)
                    return GLib.SOURCE_REMOVE;
            } catch (e) {}
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
            if (n > 0) {
                this._countLabel.text = String(n);
                this._countLabel.visible = !this._open;
            } else {
                this._countLabel.text = '';
                this._countLabel.visible = false;
            }
        } catch (e) {}
    }

    destroy() {
        this._cancelClose();
        try { this.root.destroy(); } catch (e) {}
    }
}
