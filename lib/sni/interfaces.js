import GLib from 'gi://GLib';

export let StatusNotifierItem = null;
export let StatusNotifierWatcher = null;
export let DBusMenu = null;

let _basePath = null;

function loadInterfaceXml(filename) {
    const path = GLib.build_filenamev([_basePath, 'interfaces-xml', filename]);
    const [result, contents] = GLib.file_get_contents(path);
    if (!result)
        throw new Error(`material-panel SNI: could not load ${path}`);
    let nodeContents = contents;
    if (contents instanceof Uint8Array)
        nodeContents = imports.byteArray.toString(contents);
    else if (typeof contents !== 'string')
        nodeContents = new TextDecoder().decode(contents);
    return `<node>${nodeContents}</node>`;
}

/** @param {string} sniDir absolute path to lib/sni */
export function initialize(sniDir) {
    _basePath = sniDir;
    StatusNotifierItem = loadInterfaceXml('StatusNotifierItem.xml');
    StatusNotifierWatcher = loadInterfaceXml('StatusNotifierWatcher.xml');
    DBusMenu = loadInterfaceXml('DBusMenu.xml');
}

export function destroy() {
    StatusNotifierItem = null;
    StatusNotifierWatcher = null;
    DBusMenu = null;
    _basePath = null;
}
