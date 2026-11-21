import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const HIDDEN_PATH = (() => {
    const dir = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'material-panel']);
    return GLib.build_filenamev([dir, 'hidden-networks.json']);
})();

export function loadHiddenNetworks() {
    try {
        const file = Gio.File.new_for_path(HIDDEN_PATH);
        if (!file.query_exists(null))
            return [];
        const [ok, contents] = file.load_contents(null);
        if (!ok)
            return [];
        const parsed = JSON.parse(new TextDecoder('utf-8').decode(contents));
        return Array.isArray(parsed)
            ? [...new Set(parsed.filter(v => typeof v === 'string' && v))]
            : [];
    } catch (e) {
        return [];
    }
}

export function saveHiddenNetworks(list) {
    try {
        const dir = Gio.File.new_for_path(GLib.path_get_dirname(HIDDEN_PATH));
        if (!dir.query_exists(null))
            dir.make_directory_with_parents(null);
        const text = JSON.stringify([...new Set((Array.isArray(list) ? list : []).filter(v => typeof v === 'string' && v))], null, 2);
        Gio.File.new_for_path(HIDDEN_PATH).replace_contents(
            text, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return true;
    } catch (e) {
        return false;
    }
}

export function toggleHiddenNetwork(list, ssid) {
    const name = String(ssid || '');
    if (!name)
        return [...(list || [])];
    const next = new Set(list || []);
    if (next.has(name))
        next.delete(name);
    else
        next.add(name);
    return [...next];
}
