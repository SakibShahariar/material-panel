import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Keys here must match the filenames scripts/fetch-icons.sh writes into
// assets/icons-src/<key>.svg.
const ICON_KEYS = [
    'battery-full', 'battery-high', 'battery-low', 'battery-critical', 'battery-charging',
    'volume-high', 'volume-medium', 'volume-low', 'volume-muted',
    'network-wifi', 'network-wired', 'network-offline',
    'apps',
    'dark-mode', 'light-mode', 'night-light',
    'dnd-active', 'dnd-inactive',
    'lock', 'suspend', 'restart', 'shutdown',
    'bluetooth-on', 'bluetooth-off',
    'settings', 'brightness',
    'media-play', 'media-pause', 'media-next', 'media-prev',
];

const OUT_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel', 'icons']);

// Two colored variants of every icon: the normal one (matches surrounding
// text) and an "on-accent" one (matches text-on-accent-background, e.g.
// on_primary) for use when a tile/chip is in its active/selected state.
// St.Icon loaded via gicon from a plain (non "-symbolic"-encoded) SVG file
// does NOT respond to CSS `color:` - the color is baked into the file at
// generation time, so switching state means switching which file is
// loaded, not applying a CSS rule.
export function iconPath(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}.svg`]);
}

export function iconPathOnAccent(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}-on-accent.svg`]);
}

// For icons that use the accent color as their normal (not just active-
// state) color - e.g. Activities, the quick-settings trigger button.
export function iconPathPrimary(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}-primary.svg`]);
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

function writeRecolored(srcContents, hexColor, destPath) {
    const recolored = recolor(srcContents, hexColor);
    const destFile = Gio.File.new_for_path(destPath);
    destFile.replace_contents(recolored, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

export function applyIcons(extensionPath, textColor, onAccentColor, primaryColor) {
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

        let text;
        try {
            const [ok, contents] = srcFile.load_contents(null);
            if (!ok)
                continue;
            text = new TextDecoder('utf-8').decode(contents);
        } catch (e) {
            logError(e, `material-panel: failed to read icon source "${key}"`);
            continue;
        }

        // Each variant gets its own try/catch - a failure on one variant
        // (e.g. the primary one) shouldn't skip the others, and we want
        // to know exactly which variant/key fails, not just "something
        // went wrong somewhere in the loop".
        try {
            writeRecolored(text, textColor, iconPath(key));
        } catch (e) {
            logError(e, `material-panel: failed writing base variant for "${key}"`);
        }
        try {
            writeRecolored(text, onAccentColor, iconPathOnAccent(key));
        } catch (e) {
            logError(e, `material-panel: failed writing on-accent variant for "${key}"`);
        }
        try {
            writeRecolored(text, primaryColor, iconPathPrimary(key));
        } catch (e) {
            logError(e, `material-panel: failed writing primary variant for "${key}"`);
        }
        log(`material-panel: icon generation progress - finished key "${key}"`);
    }
    log('material-panel: icon generation loop complete');
}
