import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function buildActivities() {
    const button = new St.Button({
        style_class: 'material-panel-activities-btn',
        label: 'Activities',
    });
    button.connect('clicked', () => Main.overview.toggle());
    return button;
}
