import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {startKeepAwake, stopKeepAwake, subscribeKeepAwake} from './keepAwake.js';

const DURATIONS = [
    {seconds: 15 * 60, label: '15 minutes'},
    {seconds: 30 * 60, label: '30 minutes'},
    {seconds: 60 * 60, label: '1 hour'},
    {seconds: 2 * 60 * 60, label: '2 hours'},
    {seconds: 0, label: 'Until disabled'},
];

function durationLabel(seconds) {
    return DURATIONS.find(item => item.seconds === seconds)?.label || 'Until disabled';
}

export function buildKeepAwakeMenu() {
    const section = new PopupMenu.PopupMenuSection();
    const submenu = new PopupMenu.PopupSubMenuMenuItem('Keep awake', false);
    section.addMenuItem(submenu);
    const items = [];
    let statusItem = null;
    let destroyed = false;

    const removeItems = () => {
        for (const item of items) {
            try { submenu.menu.removeMenuItem(item); } catch (e) {}
        }
        items.length = 0;
        if (statusItem) {
            try { submenu.menu.removeMenuItem(statusItem); } catch (e) {}
            statusItem = null;
        }
    };

    const render = state => {
        if (destroyed)
            return;
        removeItems();
        submenu.label.text = state.active
            ? `Keep awake · ${durationLabel(state.duration)}`
            : 'Keep awake';
        for (const duration of DURATIONS) {
            const item = new PopupMenu.PopupMenuItem(duration.label);
            if (state.active && state.duration === duration.seconds)
                item.setOrnament(PopupMenu.Ornament.DOT);
            item.connect('activate', () => {
                startKeepAwake(duration.seconds).catch(error => {
                    logError(error, 'material-panel: could not enable keep-awake mode');
                    statusItem = new PopupMenu.PopupMenuItem(
                        'Keep-awake service unavailable', {reactive: false});
                    submenu.menu.addMenuItem(statusItem);
                });
            });
            submenu.menu.addMenuItem(item);
            items.push(item);
        }
        if (state.active) {
            const off = new PopupMenu.PopupMenuItem('Turn off');
            off.connect('activate', stopKeepAwake);
            submenu.menu.addMenuItem(off);
            items.push(off);
        }
    };

    const unsubscribe = subscribeKeepAwake(render);
    return {
        section,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            unsubscribe();
            removeItems();
        },
    };
}
