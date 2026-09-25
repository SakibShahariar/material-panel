import St from 'gi://St';
import Clutter from 'gi://Clutter';

const ALIGN_BY_ZONE = {
    left: Clutter.ActorAlign.START,
    center: Clutter.ActorAlign.CENTER,
    right: Clutter.ActorAlign.END,
};

function actorLive(actor) {
    if (!actor)
        return false;
    try {
        if (actor.actor_destroyed)
            return false;
    } catch (e) {
        return false;
    }
    try {
        // Touches C allocation path lightly; throws if disposed
        actor.get_parent?.();
        return true;
    } catch (e) {
        return false;
    }
}

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
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: expand,
            x_align: ALIGN_BY_ZONE[name] ?? Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    get alive() {
        return actorLive(this.actor);
    }

    add(actor) {
        if (!this.alive || !actor)
            return false;
        try {
            this.actor.add_child(actor);
            return true;
        } catch (e) {
            logError(e, `material-panel: Zone.add(${this.name})`);
            return false;
        }
    }

    addStart(actor) {
        if (!this.alive || !actor)
            return false;
        try {
            this.actor.insert_child_at_index(actor, 0);
            return true;
        } catch (e) {
            logError(e, `material-panel: Zone.addStart(${this.name})`);
            return false;
        }
    }
}
