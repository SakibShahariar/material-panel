import St from 'gi://St';
import Clutter from 'gi://Clutter';

export class Zone {
    constructor(name) {
        this.name = name;
        this.actor = new St.BoxLayout({
            style_class: `material-panel-zone material-panel-zone-${name}`,
            vertical: false,
            x_expand: name === 'center',
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    add(actor) {
        this.actor.add_child(actor);
    }
}
