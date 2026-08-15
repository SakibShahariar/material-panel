import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function buildActivities() {
    const button = new St.Button({
        style_class: 'material-panel-activities-btn material-panel-chip',
        child: new St.Icon({
            style_class: 'material-panel-activities-icon',
            icon_name: 'view-app-grid-symbolic',
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    button.connect('clicked', () => Main.overview.toggle());
    return button;
}
