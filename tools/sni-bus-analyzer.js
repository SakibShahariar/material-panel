#!/usr/bin/env gjs -m
/**
 * Brute-force scan session bus for org.kde.StatusNotifierItem
 * (same idea as gnome-shell-extension-appindicator tools/busAnalyzer.js).
 * Prints one JSON line per hit: {services,name,path}
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

async function introspect(bus, name, path) {
    const [xml] = (await bus.call(
        name, path, 'org.freedesktop.DBus.Introspectable', 'Introspect',
        null, new GLib.VariantType('(s)'),
        Gio.DBusCallFlags.NONE, 3000, null)).deep_unpack();
    return xml;
}

async function walk(bus, name, path) {
    let xml;
    try {
        xml = await introspect(bus, name, path);
    } catch (e) {
        return;
    }
    let nodeInfo;
    try {
        nodeInfo = Gio.DBusNodeInfo.new_for_xml(xml);
    } catch (e) {
        return;
    }
    if (nodeInfo.lookup_interface('org.kde.StatusNotifierItem')) {
        print(JSON.stringify({services: [name], name, path}));
    }
    const base = path === '/' ? '' : path;
    for (const sub of nodeInfo.nodes) {
        const subPath = `${base}/${sub.path}`;
        await walk(bus, name, subPath);
    }
}

async function seek() {
    const bus = Gio.DBus.session;
    const [names] = (await bus.call(
        'org.freedesktop.DBus', '/', 'org.freedesktop.DBus', 'ListNames',
        null, new GLib.VariantType('(as)'),
        Gio.DBusCallFlags.NONE, -1, null)).deep_unpack();

    // Unique names first (qBittorrent etc.), then well-known SNI names
    const ordered = [
        ...names.filter(n => n.startsWith(':')),
        ...names.filter(n => /statusnotifieritem/i.test(n)),
    ];
    // de-dupe
    const seen = new Set();
    for (const name of ordered) {
        if (seen.has(name))
            continue;
        seen.add(name);
        try {
            await walk(bus, name, '/');
        } catch (e) {}
    }
}

const loop = new GLib.MainLoop(null, false);
let code = 0;
seek().catch(e => {
    logError(e);
    code = 1;
}).finally(() => loop.quit());
loop.run();
imports.system.exit(code);
