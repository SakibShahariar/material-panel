/**
 * Omarchy-style system tray drawer:
 * collapsed = chevron; expand shows foreign SNI icons.
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
        const chevBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-tray-chevron-inner',
        });
        try { chevBox.style = 'spacing: 4px; padding: 0 4px;'; } catch (e) {}
        this._chevLabel = new St.Label({
            text: '‹',
            style_class: 'material-panel-tray-chevron-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this._chevLabel.style = 'font-size: 15px; font-weight: 700;';
        } catch (e) {}
        this._countLabel = new St.Label({
            text: '0',
            style_class: 'material-panel-tray-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this._countLabel.style = 'font-size: 11px; font-weight: 700;';
        } catch (e) {}
        chevBox.add_child(this._chevLabel);
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

        // Icons then chevron (chevron at trailing edge of right zone)
        this.root.add_child(this.host);
        this.root.add_child(this.chevron);

        this.chevron.connect('clicked', () => {
            if (this._open && this._sticky) {
                this._sticky = false;
                this.close();
            } else {
                this._sticky = true;
                this.open();
            }
        });

        const onEnter = () => {
            this._cancelClose();
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
    }

    add(child) {
        try {
            if (child.get_parent())
                child.get_parent().remove_child(child);
        } catch (e) {}
        this.host.add_child(child);
        this._updateCount();
    }

    addStart(child) {
        try {
            if (child.get_parent())
                child.get_parent().remove_child(child);
        } catch (e) {}
        this.host.insert_child_at_index(child, 0);
        this._updateCount();
    }

    open() {
        this._cancelClose();
        this._open = true;
        this.host.visible = true;
        this._chevLabel.text = '›';
        try { this.root.add_style_class_name('open'); } catch (e) {}
        this._updateCount();
    }

    close() {
        this._cancelClose();
        this._open = false;
        this._sticky = false;
        this.host.visible = false;
        this._chevLabel.text = '‹';
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
        this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 320, () => {
            this._leaveId = 0;
            if (this._sticky)
                return GLib.SOURCE_REMOVE;
            try {
                if (this.root.has_pointer || this.chevron.has_pointer || this.host.has_pointer)
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
            this._countLabel.text = String(n);
            // Always show count when collapsed; hide when open
            this._countLabel.visible = !this._open || n === 0;
        } catch (e) {}
    }

    destroy() {
        this._cancelClose();
        try { this.root.destroy(); } catch (e) {}
    }
}
