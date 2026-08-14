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
            // The parent panel actor uses Clutter.BinLayout, which stacks
            // children in the same coordinate space and positions each
            // independently by its own alignment. x_expand:true here means
            // "align within the full panel width", not "grow to fill it" -
            // BinLayout with a smaller natural size just aligns the actor
            // inside that full space instead of stretching it. This is what
            // gives the center zone a true midpoint regardless of how wide
            // the left/right zones are.
            x_expand: true,
            x_align: ALIGN_BY_ZONE[name] ?? Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    add(actor) {
        this.actor.add_child(actor);
    }
}
