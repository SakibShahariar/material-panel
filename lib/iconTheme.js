import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Keys here must match the filenames scripts/fetch-icons.sh writes into
// assets/icons-src/<key>.svg.
const ICON_KEYS = [
    'battery-full', 'battery-high', 'battery-low', 'battery-critical', 'battery-charging',
    'volume-high', 'volume-medium', 'volume-low', 'volume-muted',
    'network-wifi', 'network-wired', 'network-offline',
    'apps',
];

const OUT_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel', 'icons']);

export function iconPath(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}.svg`]);
}

// We don't rely on GNOME's built-in "-symbolic.svg" recoloring, which
// expects icons encoded in a specific GNOME-only format (gtk-encode-symbolic-svg)
// that Google's Material Symbols source files don't use. Instead we do the
// same thing theme.js does for CSS: substitute the fill color directly
// and write out a recolored copy, so icon color stays in sync with matugen
// exactly like everything else.
//
// Google's source SVGs have no explicit fill attribute at all (they render
// black by SVG's default) rather than a fill="#..." we could replace, so we
// inject one onto each <path> tag if none exists, and replace it if one
// already does (in case a future icon source differs).
function recolor(svgText, hexColor) {
    if (/fill="#[0-9a-fA-F]{3,8}"/.test(svgText))
        return svgText.replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${hexColor}"`);
    return svgText.replace(/<path /g, `<path fill="${hexColor}" `);
}

export function applyIcons(extensionPath, hexColor) {
    const dir = Gio.File.new_for_path(OUT_DIR);
    if (!dir.query_exists(null))
        dir.make_directory_with_parents(null);

    for (const key of ICON_KEYS) {
        const srcPath = GLib.build_filenamev([extensionPath, 'assets', 'icons-src', `${key}.svg`]);
        const srcFile = Gio.File.new_for_path(srcPath);
        if (!srcFile.query_exists(null)) {
            // Not fatal - run scripts/fetch-icons.sh to populate these.
            // Modules just render without an icon until then.
            continue;
        }
        try {
            const [ok, contents] = srcFile.load_contents(null);
            if (!ok)
                continue;
            const text = new TextDecoder('utf-8').decode(contents);
            const recolored = recolor(text, hexColor);
            const destFile = Gio.File.new_for_path(iconPath(key));
            destFile.replace_contents(recolored, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            logError(e, `material-panel: failed to recolor icon "${key}"`);
        }
    }
}
