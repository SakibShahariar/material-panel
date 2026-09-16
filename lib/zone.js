import St from 'gi://St';
import Clutter from 'gi://Clutter';

const ALIGN_BY_ZONE = {
    left: Clutter.ActorAlign.START,
    center: Clutter.ActorAlign.CENTER,
    right: Clutter.ActorAlign.END,
};

export class Zone {
    /**
     * @param {string} name
     * @param {object} [opts]
     * @param {boolean} [opts.expand=true]
     */
    constructor(name, {expand = true} = {}) {
        this.name = name;
        this.actor = new St.BoxLayout({
            style_class: `material-panel-zone material-panel-zone-${name}`,
            vertical: false,
            x_expand: expand,
            x_align: ALIGN_BY_ZONE[name] ?? Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Right: spacer + content row so chips hug the trailing edge
        if (name === 'right') {
            const spacer = new St.Widget({
                x_expand: true,
                y_expand: false,
                reactive: false,
                width: 0,
            });
            this._row = new St.BoxLayout({
                style_class: 'material-panel-zone-right-row',
                vertical: false,
                x_expand: false,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.actor.add_child(spacer);
            this.actor.add_child(this._row);
            this._host = this._row;
        } else {
            this._host = this.actor;
        }
    }

    add(actor) {
        this._host.add_child(actor);
    }

    addStart(actor) {
        this._host.insert_child_at_index(actor, 0);
    }
}
