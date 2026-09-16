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
    }

    add(actor) {
        this.actor.add_child(actor);
    }

    addStart(actor) {
        this.actor.insert_child_at_index(actor, 0);
    }
}
