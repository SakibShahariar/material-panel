#!/usr/bin/env gjs -m
/**
 * Brute-force session bus scan for org.kde.StatusNotifierItem
 * (material-panel vendored copy of AppIndicator busAnalyzer idea).
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as DBusUtils from '../dbusUtils.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

async function seekStatusNotifierItems() {
    const bus = Gio.DBus.session;
    const uniqueNames = await DBusUtils.getBusNames(bus, null);
    const introspectName = async name => {
        try {
            const nodes = DBusUtils.introspectBusObject(bus, name, null,
                ['org.kde.StatusNotifierItem']);
            const services = [...(uniqueNames.get(name) || [])];
            for await (const node of nodes) {
                const {path} = node;
                print(JSON.stringify({services, name, path}));
            }
        } catch (e) {
            // ignore per-name failures
        }
    };
    await Promise.allSettled([...uniqueNames.keys()].map(n => introspectName(n)));
}

const loop = new GLib.MainLoop(null, false);
let code = 0;
seekStatusNotifierItems().catch(e => {
    printerr(e);
    code = 1;
}).finally(() => loop.quit());
loop.run();
imports.system.exit(code);
