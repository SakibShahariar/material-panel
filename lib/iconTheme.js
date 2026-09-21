import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Keys here must match the filenames scripts/fetch-icons.sh writes into
// assets/icons-src/<key>.svg.
const ICON_KEYS = [
    'fedora-logo',
    'battery-full', 'battery-high', 'battery-low', 'battery-critical', 'battery-charging',
    'volume-high', 'volume-medium', 'volume-low', 'volume-muted',
    'network-wifi', 'network-wired', 'network-offline',
    'network-up', 'network-down',
    'apps',
    'dark-mode', 'light-mode', 'night-light',
    'dnd-active', 'dnd-inactive',
    'lock', 'suspend', 'restart', 'shutdown',
    'bluetooth-on', 'bluetooth-off',
    'settings', 'brightness',
    'cpu', 'cpu-temp',
    'weather', 'weather-sunny', 'weather-partly-cloudy', 'weather-cloudy', 'weather-rain', 'weather-snow', 'weather-thunder', 'weather-fog', 'weather-clear-night',
    'notifications',
    'quicksettings',
    'headphones',
    'keyboard',
    'phone',
    'computer',
    'media-play', 'media-pause', 'media-next', 'media-prev',
];

const OUT_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'material-panel', 'icons']);
// Legacy fallback for reading if primary missing (migration happens lazily)
const LEGACY_OUT_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel', 'icons']);

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
const MAX_GENERATIONS = 48;

function cleanupOldGenerations() {
    try {
        const dir = Gio.File.new_for_path(OUT_DIR);
        if (!dir.query_exists(null))
            return;
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        const generationFiles = new Map();
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            const match = name.match(/^(.+)-g(\d+)\.svg$/);
            if (match) {
                const base = match[1];
                const gen = parseInt(match[2], 10);
                if (!generationFiles.has(base))
                    generationFiles.set(base, []);
                generationFiles.get(base).push({name, gen});
            }
        }
        for (const [base, files] of generationFiles) {
            files.sort((a, b) => b.gen - a.gen);
            for (let i = MAX_GENERATIONS; i < files.length; i++) {
                try {
                    const file = Gio.File.new_for_path(GLib.build_filenamev([OUT_DIR, files[i].name]));
                    file.delete(null);
                } catch (e) {}
            }
        }
    } catch (e) {
        logError(e, 'material-panel: failed to cleanup old icon generations');
    }
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
    let out = String(svgText);
    out = out.replace(/fill="currentColor"/gi, `fill="${hexColor}"`);
    out = out.replace(/fill='currentColor'/gi, `fill='${hexColor}'`);
    out = out.replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${hexColor}"`);
    out = out.replace(/fill='#[0-9a-fA-F]{3,8}'/g, `fill='${hexColor}'`);
    // Inject fill onto bare <path ...> that still lack fill=
    out = out.replace(/<path(?![^>]*fill=)(\s+)/g, `<path fill="${hexColor}"$1`);
    out = out.replace(/<path(?![^>]*fill=)>/g, `<path fill="${hexColor}">`);
    return out;
}

function writeRecolored(srcContents, hexColor, destPath) {
    const recolored = recolor(srcContents, hexColor);
    const destFile = Gio.File.new_for_path(destPath);
    destFile.replace_contents(recolored, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    // Force page-cache residency + catch short/failed writes before TextureCache decode
    try {
        const [ok, contents] = destFile.load_contents(null);
        if (!ok || !contents || contents.length < 32) {
            log(`material-panel: icon write validate failed: ${destPath} len=${contents?.length ?? 0}`);
            return false;
        }
        const expected = recolored.length;
        if (contents.length < expected * 0.5) {
            log(`material-panel: icon write short: ${destPath} expected~${expected} read=${contents.length}`);
            return false;
        }
    } catch (e) {
        logError(e, `material-panel: icon write validate ${destPath}`);
        return false;
    }
    return true;
}

/** Path for key at an explicit generation (for fallback). */
function pathForGen(key, gen, variant = 'plain') {
    const g = Math.max(0, gen | 0);
    if (variant === 'on-accent')
        return GLib.build_filenamev([OUT_DIR, `${key}-on-accent-g${g}.svg`]);
    if (variant === 'primary')
        return GLib.build_filenamev([OUT_DIR, `${key}-primary-g${g}.svg`]);
    return GLib.build_filenamev([OUT_DIR, `${key}-g${g}.svg`]);
}

function fileUsable(path) {
    try {
        const f = Gio.File.new_for_path(path);
        if (!f.query_exists(null))
            return false;
        const info = f.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        const size = info?.get_size?.() ?? 0;
        return size >= 32;
    } catch (e) {
        return false;
    }
}

/**
 * Resolve a usable icon path: current generation first, then previous gens.
 * Heals St.TextureCache one-shot decode failures of unique -g{N} URLs by
 * offering an older path that may already be cached successfully, or a
 * file that finished writing after a raced read.
 */
export function resolveIconPath(key, variant = 'plain') {
    for (let back = 0; back < Math.min(5, generation + 1); back++) {
        const gen = generation - back;
        if (gen < 1)
            break;
        const path = pathForGen(key, gen, variant);
        if (fileUsable(path))
            return path;
    }
    // Last resort: current path even if not yet validated (caller may still try)
    return pathForGen(key, Math.max(1, generation), variant);
}

/** Current-generation path only — use for *writing* in applyIcons. */
function iconPathExact(key, variant = 'plain') {
    return pathForGen(key, Math.max(1, generation), variant);
}

/** Read path: current gen if usable, else previous gens (TextureCache self-heal). */
export function iconPath(key) {
    return resolveIconPath(key, 'plain');
}

export function iconPathOnAccent(key) {
    return resolveIconPath(key, 'on-accent');
}

// For icons that use the accent color as their normal (not just active-
// state) color - e.g. Activities, the quick-settings trigger button.
export function iconPathPrimary(key) {
    return resolveIconPath(key, 'primary');
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
            log(`material-panel: icon source missing: "${key}.svg" (run scripts/fetch-icons.sh)`);
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

        const usePrimary = key === 'cpu' || key === 'cpu-temp';
        const baseColor = usePrimary ? primaryColor : textColor;

        try {
            writeRecolored(text, baseColor, iconPathExact(key, 'plain'));
        } catch (e) {
            logError(e, `material-panel: failed writing base variant for "${key}"`);
        }
        try {
            writeRecolored(text, onAccentColor, iconPathExact(key, 'on-accent'));
        } catch (e) {
            logError(e, `material-panel: failed writing on-accent variant for "${key}"`);
        }
        try {
            writeRecolored(text, primaryColor, iconPathExact(key, 'primary'));
        } catch (e) {
            logError(e, `material-panel: failed writing primary variant for "${key}"`);
        }
    }

    if (generation > MAX_GENERATIONS) {
        cleanupOldGenerations();
    }
}
