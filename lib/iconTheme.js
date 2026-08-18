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

// GNOME's texture cache keys decoded icon textures by file path, and
// doesn't know to invalidate just because the file at that path changed
// underneath it - confirmed in testing: a full logout/login always shows
// updated colors (proving file generation itself is correct), but a
// running extension doesn't refresh, even after explicitly attempting to
// bust the cache via St.TextureCache.uncache_file().
//
// Rather than depend on correctly invalidating a cache whose exact
// behavior we can't fully verify, we sidestep it: every theme apply gets
// a new "generation" number, and every icon path embeds it. A fresh actor
// after a real theme change requests a path the cache has never seen
// before, so there's nothing stale to invalidate. Old-generation files
// are small (plain SVG text, a few hundred bytes) and harmless to leave
// around indefinitely rather than adding cleanup-timing complexity.
let generation = 0;

export function iconPath(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}-g${generation}.svg`]);
}

export function iconPathOnAccent(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}-on-accent-g${generation}.svg`]);
}

// For icons that use the accent color as their normal (not just active-
// state) color - e.g. Activities, the quick-settings trigger button.
export function iconPathPrimary(key) {
    return GLib.build_filenamev([OUT_DIR, `${key}-primary-g${generation}.svg`]);
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
    generation++;

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
        // (e.g. the primary one) shouldn't skip the others.
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
    }
}
