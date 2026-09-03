import Clutter from 'gi://Clutter';

/** Toggle `.pressed` on press/release/leave so CSS can style FileIcon-unfriendly widgets. */
export function wirePressedClass(actor) {
    if (!actor)
        return;
    const on = () => {
        try { actor.add_style_class_name('pressed'); } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    };
    const off = () => {
        try { actor.remove_style_class_name('pressed'); } catch (e) {}
        return Clutter.EVENT_PROPAGATE;
    };
    actor.connect('button-press-event', on);
    actor.connect('button-release-event', off);
    actor.connect('leave-event', off);
}
