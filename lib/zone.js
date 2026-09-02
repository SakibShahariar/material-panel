import St from 'gi://St';
import Clutter from 'gi://Clutter';

const ALIGN_BY_ZONE = {
    left: Clutter.ActorAlign.START,
    center: Clutter.ActorAlign.CENTER,
    right: Clutter.ActorAlign.END,
};

export class Zone {
    constructor(name) {
        this.name = name;
        this.actor = new St.BoxLayout({
            style_class: `material-panel-zone material-panel-zone-${name}`,
            vertical: false,
            x_expand: true,
            x_align: ALIGN_BY_ZONE[name] ?? Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    /** Append (end of zone — right edge of left zone). */
    add(actor) {
        this.actor.add_child(actor);
    }

    /** Prepend (start of zone — left edge of right zone). */
    addStart(actor) {
        this.actor.insert_child_at_index(actor, 0);
    }
}
