import St from 'gi://St';
import Clutter from 'gi://Clutter';

/**
 * Build the shared title/status/action hierarchy used by panel popups.
 * Actors remain owned by the caller; this helper only reparents them.
 */
export function createPopupHeader({
    titleActor,
    statusActor = null,
    leadingActor = null,
    actions = [],
    styleClass = 'material-panel-popup-header',
    style = 'spacing: 8px; padding: 8px 10px;',
} = {}) {
    const header = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: styleClass,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        header.style = style;
    } catch (e) {}

    if (leadingActor)
        header.add_child(leadingActor);

    const content = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-popup-header-content',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        content.style = 'spacing: 2px; min-width: 0;';
    } catch (e) {}
    if (titleActor)
        content.add_child(titleActor);
    if (statusActor)
        content.add_child(statusActor);
    header.add_child(content);

    for (const action of actions) {
        if (action)
            header.add_child(action);
    }

    return {actor: header, content};
}
