import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * Shared Quick Settings selectors for the active Gvc output and input streams.
 * Gvc owns device discovery and switching; this UI only reflects its live state.
 */
export function buildAudioDeviceSelectors(control) {
    if (!control)
        return null;

    const section = new PopupMenu.PopupMenuSection();
    const outputMenu = new PopupMenu.PopupSubMenuMenuItem('Output device', false);
    const inputMenu = new PopupMenu.PopupSubMenuMenuItem('Input device', false);
    section.addMenuItem(outputMenu);
    section.addMenuItem(inputMenu);

    const outputItems = [];
    const inputItems = [];
    const signalIds = [];
    let destroyed = false;

    const removeItems = (submenu, items) => {
        for (const item of items) {
            try { submenu.menu.removeMenuItem(item); } catch (e) {}
        }
        items.length = 0;
    };

    const streamName = stream => {
        try {
            return String(stream.get_description?.() || stream.get_name?.() || 'Audio device');
        } catch (e) {
            return 'Audio device';
        }
    };

    const listStreams = method => {
        try {
            const result = control[method]?.();
            return result ? Array.from(result) : [];
        } catch (e) {
            return [];
        }
    };

    const addStreams = (submenu, items, streams, active, setter, emptyLabel) => {
        removeItems(submenu, items);
        const activeId = active?.get_id?.();
        submenu.label.text = active
            ? `${submenu === outputMenu ? "Output" : "Input"}: ${streamName(active)}`
            : (submenu === outputMenu ? 'Output device' : 'Input device');

        if (streams.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(emptyLabel, {reactive: false});
            submenu.menu.addMenuItem(empty);
            items.push(empty);
            return;
        }

        for (const stream of streams) {
            const isActive = stream.get_id?.() === activeId;
            const item = new PopupMenu.PopupMenuItem(streamName(stream));
            if (isActive)
                item.setOrnament(PopupMenu.Ornament.DOT);
            item.connect('activate', () => {
                try {
                    if (!control[setter](stream))
                        logError(new Error('Gvc rejected the audio device selection'), 'material-panel: audio device selection');
                } catch (e) {
                    logError(e, 'material-panel: audio device selection failed');
                }
                rebuild();
            });
            submenu.menu.addMenuItem(item);
            items.push(item);
        }
    };

    const rebuild = () => {
        if (destroyed)
            return;
        const outputs = listStreams('get_sinks');
        const allInputs = listStreams('get_sources');
        const inputs = allInputs.filter(source => {
            try {
                return !(source.get_is_monitor?.() ?? source.is_monitor ?? false);
            } catch (e) {
                return true;
            }
        });
        addStreams(outputMenu, outputItems, outputs, control.get_default_sink?.(),
            'set_default_sink', 'No output devices found');
        addStreams(inputMenu, inputItems, inputs, control.get_default_source?.(),
            'set_default_source', 'No input devices found');
    };

    for (const signal of [
        'state-changed',
        'output-added', 'output-removed', 'default-sink-changed',
        'input-added', 'input-removed', 'default-source-changed',
    ]) {
        try { signalIds.push(control.connect(signal, rebuild)); } catch (e) {}
    }
    rebuild();

    return {
        section,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            for (const id of signalIds) {
                try { control.disconnect(id); } catch (e) {}
            }
            signalIds.length = 0;
            removeItems(outputMenu, outputItems);
            removeItems(inputMenu, inputItems);
        },
    };
}
