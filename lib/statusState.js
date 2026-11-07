import St from 'gi://St';
import Clutter from 'gi://Clutter';

/**
 * Build a consistent icon-and-message row for unavailable, empty, or error
 * states in GNOME Shell popups. Call setMessage('') to hide the row.
 */
export function createStatusState({
    message = '',
    iconName = 'dialog-information-symbolic',
    styleClass = 'material-panel-status-state',
    labelStyleClass = 'material-panel-status-label',
    iconSize = 16,
    style = 'spacing: 8px; padding: 8px 10px;',
} = {}) {
    const actor = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: styleClass,
        style,
    });
    const icon = new St.Icon({
        icon_name: iconName,
        icon_size: iconSize,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const label = new St.Label({
        text: String(message || ''),
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        wrap: true,
        style_class: labelStyleClass,
    });
    actor.add_child(icon);
    actor.add_child(label);
    actor.visible = !!message;

    const setMessage = (nextMessage, nextIconName = iconName) => {
        label.text = String(nextMessage || '');
        icon.icon_name = nextIconName;
        actor.visible = !!nextMessage;
    };

    return {actor, setMessage};
}
