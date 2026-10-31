import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const BUS_NAME = 'org.freedesktop.UPower.PowerProfiles';
const OBJECT_PATH = '/org/freedesktop/UPower/PowerProfiles';
const INTERFACE = 'org.freedesktop.UPower.PowerProfiles';
const PROFILE_LABELS = {
    'power-saver': 'Power Saver',
    balanced: 'Balanced',
    performance: 'Performance',
};

function unpack(value) {
    try { return value?.deep_unpack?.() ?? value; } catch (e) { return value; }
}

function readProfiles(proxy) {
    const value = unpack(proxy.get_cached_property('Profiles'));
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const profiles = [];
    for (const row of value) {
        const id = String(unpack(row?.Profile ?? row?.profile) ?? '');
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        profiles.push(id);
    }
    return profiles;
}

function readActiveProfile(proxy) {
    return String(unpack(proxy.get_cached_property('ActiveProfile')) ?? '');
}

function profileLabel(id) {
    return PROFILE_LABELS[id] || id;
}

/** Attach a Power Profiles submenu; it remains hidden when the daemon is absent. */
export function buildPowerProfileSelector() {
    const section = new PopupMenu.PopupMenuSection();
    const submenu = new PopupMenu.PopupSubMenuMenuItem('Power profile', false);
    section.addMenuItem(submenu);
    section.actor.hide();

    let proxy = null;
    let propertySignalId = 0;
    let ownerSignalId = 0;
    let itemList = [];
    let destroyed = false;
    let requestGeneration = 0;

    const removeItems = () => {
        for (const item of itemList) {
            try { submenu.menu.removeMenuItem(item); } catch (e) {}
        }
        itemList = [];
    };

    const refresh = () => {
        if (destroyed || !proxy)
            return;
        const profiles = readProfiles(proxy);
        const active = readActiveProfile(proxy);
        removeItems();
        submenu.label.text = active
            ? `Power profile: ${profileLabel(active)}`
            : 'Power profile';
        if (profiles.length < 2) {
            section.actor.hide();
            return;
        }
        section.actor.show();
        for (const id of profiles) {
            const item = new PopupMenu.PopupMenuItem(profileLabel(id));
            if (id === active)
                item.setOrnament(PopupMenu.Ornament.DOT);
            item.connect('activate', () => {
                if (destroyed || !proxy)
                    return;
                const generation = ++requestGeneration;
                proxy.call(
                    'org.freedesktop.DBus.Properties.Set',
                    new GLib.Variant('(ssv)', [
                        INTERFACE,
                        'ActiveProfile',
                        new GLib.Variant('s', id),
                    ]),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (source, result) => {
                        if (destroyed || generation !== requestGeneration)
                            return;
                        try {
                            source.call_finish(result);
                            refresh();
                        } catch (e) {
                            logError(e, 'material-panel: failed to change power profile');
                        }
                    });
            });
            submenu.menu.addMenuItem(item);
            itemList.push(item);
        }
    };

    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SYSTEM,
        Gio.DBusProxyFlags.NONE,
        null,
        BUS_NAME,
        OBJECT_PATH,
        INTERFACE,
        null,
        (source, result) => {
            if (destroyed)
                return;
            try {
                proxy = Gio.DBusProxy.new_for_bus_finish(result);
                propertySignalId = proxy.connect('g-properties-changed', refresh);
                ownerSignalId = proxy.connect('notify::g-name-owner', refresh);
                refresh();
            } catch (e) {
                // The daemon is optional; keep the selector hidden on systems
                // that do not provide power-profiles-daemon.
                section.actor.hide();
            }
        });

    return {
        section,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            requestGeneration++;
            if (proxy && propertySignalId)
                try { proxy.disconnect(propertySignalId); } catch (e) {}
            if (proxy && ownerSignalId)
                try { proxy.disconnect(ownerSignalId); } catch (e) {}
            removeItems();
            proxy = null;
        },
    };
}
