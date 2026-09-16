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
     * @param {boolean} [opts.expand=true]  false = end-4 style shrink-wrap pill
     */
    constructor(name, {expand = true} = {}) {
        this.name = name;
        this.actor = new St.BoxLayout({
            style_class: `material-panel-zone material-panel-zone-${name}`,
            vertical: false,
            // end-4: groups are compact capsules, not full-width strips
            x_expand: expand,
            x_align: ALIGN_BY_ZONE[name] ?? Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        // Right zone: flexible spacer at the start so chips hug the trailing edge
        if (name === 'right') {
            try {
                const spacer = new St.Widget({
                    x_expand: true,
                    y_expand: false,
                    reactive: false,
                });
                this.actor.add_child(spacer);
                this._endSpacer = spacer;
            } catch (e) {}
        }
    }

    add(actor) {
        this.actor.add_child(actor);
    }

    addStart(actor) {
        // Keep trailing-edge spacer at index 0 on the right zone
        const idx = this._endSpacer ? 1 : 0;
        this.actor.insert_child_at_index(actor, idx);
    }
}
