import {SLIDER_STYLES, SLIDER_STYLE_DEFAULT} from '../lib/sliderStyleMeta.js';
import {TILE_STYLES, TILE_STYLE_DEFAULT} from '../lib/tileStyleMeta.js';
import {formatQuickSettingsFavorites, formatQuickSettingsTileOrder, parseQuickSettingsFavorites, parseQuickSettingsTileOrder} from '../lib/quickSettingsTiles.js';

/** Build appearance, slider, and Quick Settings tile preferences. */
export function buildAppearancePage({Adw, Gtk, config, saveConfig, addPreferencesPage, mediaVisibilitySwitch, bluetoothVisibilitySwitch, networkSpeedVisibilitySwitch, mediaVisualizerSwitch}) {
    // --- PAGE 3: Appearance ---
    const appearancePage = new Adw.PreferencesPage({
        title: 'Appearance',
        icon_name: 'applications-graphics-symbolic',
    });
    addPreferencesPage(appearancePage);
    
    const themeGroup = new Adw.PreferencesGroup({
        title: 'Color Source',
        description: 'Empty = auto matugen file if present, else fixed palette.',
    });
    appearancePage.add(themeGroup);
    
    const colorSourceRow = new Adw.EntryRow({
        title: 'Matugen CSS Path',
        text: config.colorSource ?? '',
        show_apply_button: true,
    });
    colorSourceRow.connect('apply', () => {
        config.colorSource = colorSourceRow.get_text() || null;
        saveConfig()
    });
    themeGroup.add(colorSourceRow);
    
    const sliderStyleRow = new Adw.ActionRow({
        title: 'Quick Settings Slider Style',
        subtitle: 'Volume & brightness. Tall styles (rails/arc) use a vertical row; End-4 dual falls back to Classic. Applies on rebuild.',
    });
    const sliderStyleLabels = Gtk.StringList.new(SLIDER_STYLES.map(s => {
        const tag = s.tier === 'Experimental' ? ' ⚠' : '';
        return `${s.label}${tag}`;
    }));
    const sliderStyleDrop = new Gtk.DropDown({
        model: sliderStyleLabels,
        valign: Gtk.Align.CENTER,
    });
    const currentSliderStyle = config.sliderStyle ?? SLIDER_STYLE_DEFAULT;
    const currentStyleIndex = Math.max(0, SLIDER_STYLES.findIndex(s => s.id === currentSliderStyle));
    sliderStyleDrop.set_selected(currentStyleIndex);
    sliderStyleDrop.connect('notify::selected', () => {
        const sel = Math.max(0, sliderStyleDrop.get_selected());
        const s = SLIDER_STYLES[sel];
        if (s) {
            config.sliderStyle = s.id;
            saveConfig()
        }
    });
    sliderStyleRow.add_suffix(sliderStyleDrop);
    sliderStyleRow.activatable_widget = sliderStyleDrop;
    themeGroup.add(sliderStyleRow);
    
    const tileStyleRow = new Adw.ActionRow({
        title: 'QS tile style',
        subtitle: 'Look of Quick Settings tiles (default layout)',
    });
    const tileStyleLabels = Gtk.StringList.new(TILE_STYLES.map(s => {
        const sub = s.tier ? ` — ${s.tier}` : '';
        return `${s.label}${sub}`;
    }));
    const tileStyleDrop = new Gtk.DropDown({model: tileStyleLabels});
    const currentTileStyle = config.qsTileStyle ?? TILE_STYLE_DEFAULT;
    const tileIdx = Math.max(0, TILE_STYLES.findIndex(s => s.id === currentTileStyle));
    tileStyleDrop.set_selected(tileIdx);
    tileStyleDrop.connect('notify::selected', () => {
        const sel = Math.max(0, tileStyleDrop.get_selected());
        const s = TILE_STYLES[sel] || TILE_STYLES[0];
        if (s) {
            config.qsTileStyle = s.id;
            saveConfig();
        }
    });
    tileStyleRow.add_suffix(tileStyleDrop);
    tileStyleRow.activatable_widget = tileStyleDrop;
    themeGroup.add(tileStyleRow);
    
    themeGroup.add(new Adw.ActionRow({
        title: 'Quick Settings tile order and visibility',
        subtitle: 'Comma-separated names. Reorder tiles or remove a name to hide it. Leave empty to restore all defaults.',
    }));
    const tileOrderRow = new Adw.EntryRow({
        title: 'Tile order',
        text: formatQuickSettingsTileOrder(config.qsTiles),
        show_apply_button: true,
    });
    tileOrderRow.connect('apply', () => {
        const parsed = parseQuickSettingsTileOrder(tileOrderRow.get_text());
        if (parsed === null) {
            tileOrderRow.set_text(formatQuickSettingsTileOrder(config.qsTiles));
            tileFavoritesRow.set_text(formatQuickSettingsFavorites(config.qsFavorites));
            mediaVisibilitySwitch.active = config.autoHideMedia === true;
            bluetoothVisibilitySwitch.active = config.autoHideBluetooth === true;
            networkSpeedVisibilitySwitch.active = config.autoHideNetworkSpeed === true;
            mediaVisualizerSwitch.active = config.mediaVisualizer === true;
            return;
        }
        config.qsTiles = parsed;
        saveConfig();
        tileOrderRow.set_text(formatQuickSettingsTileOrder(config.qsTiles));
    });
    themeGroup.add(tileOrderRow);
    
    const tileFavoritesRow = new Adw.EntryRow({
        title: 'Favorite tiles (pinned first)',
        text: formatQuickSettingsFavorites(config.qsFavorites),
        show_apply_button: true,
    });
    tileFavoritesRow.connect('apply', () => {
        const parsed = parseQuickSettingsFavorites(tileFavoritesRow.get_text());
        if (parsed === null) {
            tileFavoritesRow.set_text(formatQuickSettingsFavorites(config.qsFavorites));
            return;
        }
        config.qsFavorites = parsed;
        saveConfig();
        tileFavoritesRow.set_text(formatQuickSettingsFavorites(config.qsFavorites));
    });
    themeGroup.add(tileFavoritesRow);
    return {tileOrderRow};
}
