import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/** Shell writes this; prefs reads it (no Shell imports). */
export function statusRolesPath() {
    return GLib.build_filenamev(
        [GLib.get_home_dir(), '.config', 'material-panel', 'status-roles.json']);
}

export function readStatusRolesFile() {
    try {
        const file = Gio.File.new_for_path(statusRolesPath());
        if (!file.query_exists(null))
            return [];
        const [ok, contents] = file.load_contents(null);
        if (!ok)
            return [];
        const parsed = JSON.parse(new TextDecoder('utf-8').decode(contents));
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (e) {
        return [];
    }
}
