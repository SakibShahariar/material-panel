import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ConfigStore} from './lib/configStore.js';
// Prefer moduleIds over moduleRegistry: the registry imports every panel
// module (St, Clutter, Main, …) which only exist inside gnome-shell.
// Preferences run in a separate GTK process and cannot load those typelibs.
import {hasBuiltin} from './lib/moduleIds.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const ALL_MODULES = [
    {id: 'activities', name: 'Activities', zone: 'left'},
    {id: 'workspaces', name: 'Workspaces', zone: 'left'},
    {id: 'cpu', name: 'CPU Usage', zone: 'left'},
    {id: 'networkSpeed', name: 'Network Speed', zone: 'right'},
    {id: 'clock', name: 'Clock', zone: 'center'},
    {id: 'weather', name: 'Weather', zone: 'center'},
    {id: 'notifications', name: 'Notifications', zone: 'right'},
    {id: 'battery', name: 'Battery', zone: 'right'},
    {id: 'volume', name: 'Volume', zone: 'right'},
    {id: 'network', name: 'Network', zone: 'right'},
    {id: 'darkmode', name: 'Dark Mode', zone: 'right'},
    {id: 'nightlight', name: 'Night Light', zone: 'right'},
    {id: 'dnd', name: 'Do Not Disturb', zone: 'right'},
    {id: 'powermenu', name: 'Power Menu', zone: 'right'},
    {id: 'bluetooth', name: 'Bluetooth', zone: 'right'},
    {id: 'quicksettings', name: 'Quick Settings', zone: 'right'},
];

export default class MaterialPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const store = new ConfigStore();
        const config = store.load();
        const preset = config.presets[config.activePreset];

        // Migrate legacy single `gap` if present.
        if (config.panelSize?.gap != null && config.panelSize?.gapTop == null) {
            config.panelSize.gapTop = config.panelSize.gap;
            config.panelSize.gapBottom = Math.max(0, config.panelSize.gap - 1);
            delete config.panelSize.gap;
        }
        const panelSize = {
            scale: config.panelSize?.scale ?? 1.0,
            gapTop: config.panelSize?.gapTop ?? 5,
            gapBottom: config.panelSize?.gapBottom ?? 4,
        };
        config.panelSize = panelSize;

        // Initialize hidden modules list if not present
        if (!config.hiddenModules) config.hiddenModules = [];

        // Adw.PreferencesWindow only supports Adw.PreferencesPage via window.add().
        // TabView / set_title_widget are for Adw.ApplicationWindow — not available here.

        // --- PAGE 1: General / Panel Size ---
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Panel Size',
            description: 'Doesn\'t affect the quick settings popup, which is a separate surface.',
        });
        generalPage.add(sizeGroup);

        let saveDebounceId = null;
        const sliderMap = {};
        let syncingExternal = false;

        const makeSliderRow = ({title, subtitle, key, min, max, step}) => {
            const formatValue = v => {
                if (key === 'scale') return `${v.toFixed(2)}×`;
                return `${Math.round(v)} px`;
            };
            const adjustment = new Gtk.Adjustment({
                value: panelSize[key],
                lower: min,
                upper: max,
                step_increment: step,
            });
            const row = new Adw.ActionRow({title, subtitle});
            const scale = new Gtk.Scale({
                orientation: Gtk.Orientation.HORIZONTAL,
                adjustment,
                digits: step < 1 ? 2 : 0,
                width_request: 180,
                valign: Gtk.Align.CENTER,
                draw_value: false,
                hexpand: true,
            });
            scale.set_tooltip_text(formatValue(adjustment.value));
            const valueLabel = new Gtk.Label({
                label: formatValue(adjustment.value),
                width_request: 52,
                xalign: 1,
                valign: Gtk.Align.CENTER,
                css_classes: ['dim-label', 'monospace'],
            });
            const updateValueLabel = () => {
                valueLabel.label = formatValue(adjustment.value);
                scale.set_tooltip_text(formatValue(adjustment.value));
            };
            scale.connect('value-changed', () => {
                if (syncingExternal) return;
                panelSize[key] = adjustment.value;
                updateValueLabel();
                if (saveDebounceId)
                    GLib.source_remove(saveDebounceId);
                saveDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    saveDebounceId = null;
                    store.save(config);
                    return GLib.SOURCE_REMOVE;
                });
            });
            row.add_suffix(scale);
            row.add_suffix(valueLabel);
            sizeGroup.add(row);
            sliderMap[key] = {adjustment, valueLabel, formatValue, updateValueLabel};
        };

        makeSliderRow({
            title: 'Size',
            subtitle: 'Icon size and pill height together, so they always stay in proportion',
            key: 'scale', min: 0.7, max: 1.5, step: 0.05,
        });
        makeSliderRow({
            title: 'Top gap',
            subtitle: 'Space above the pills (px)',
            key: 'gapTop', min: 0, max: 14, step: 1,
        });
        makeSliderRow({
            title: 'Bottom gap',
            subtitle: 'Space below the pills — slightly less than top by default (px)',
            key: 'gapBottom', min: 0, max: 14, step: 1,
        });

        const clockGroup = new Adw.PreferencesGroup({
            title: 'Clock',
            description: 'Time format on the panel clock module.',
        });
        generalPage.add(clockGroup);

        if (config.clockFormat !== '12h' && config.clockFormat !== '24h')
            config.clockFormat = '24h';

        const clockRow = new Adw.ActionRow({
            title: '12-hour clock (AM/PM)',
        });
        const clockSwitch = new Gtk.Switch({
            active: config.clockFormat === '12h',
            valign: Gtk.Align.CENTER,
        });
        clockSwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.clockFormat = clockSwitch.active ? '12h' : '24h';
            store.save(config);
        });
        clockRow.add_suffix(clockSwitch);
        clockRow.activatable_widget = clockSwitch;
        clockGroup.add(clockRow);

        // --- PAGE 2: Modules ---
        const modulesPage = new Adw.PreferencesPage({
            title: 'Modules',
            icon_name: 'view-grid-symbolic',
        });
        window.add(modulesPage);

        const infoGroup = new Adw.PreferencesGroup({
            description: `Editing preset "${config.activePreset}". Changes apply live — no need to restart the shell.\nConfig file: ${store.path}`,
        });
        modulesPage.add(infoGroup);

        // Module visibility toggles
        const visibilityGroup = new Adw.PreferencesGroup({
            title: 'Module Visibility',
            description: 'Toggle modules on/off. Disabled modules are hidden from the panel but can be re-enabled.',
        });
        modulesPage.add(visibilityGroup);

        const createModuleToggle = (module) => {
            const isHidden = config.hiddenModules.includes(module.id);
            const row = new Adw.ActionRow({
                title: module.name,
                subtitle: `Zone: ${module.zone} • ${hasBuiltin(module.id) ? 'Built-in' : 'External'}`,
            });

            const toggle = new Gtk.Switch({
                active: !isHidden,
                valign: Gtk.Align.CENTER,
            });
            toggle.connect('notify::active', () => {
                if (syncingExternal) return;
                const hidden = config.hiddenModules;
                if (toggle.active) {
                    const idx = hidden.indexOf(module.id);
                    if (idx > -1) hidden.splice(idx, 1);
                } else {
                    if (!hidden.includes(module.id)) hidden.push(module.id);
                }
                store.save(config);
            });
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            visibilityGroup.add(row);
        };

        // Show all known modules
        for (const module of ALL_MODULES) {
            createModuleToggle(module);
        }

        // Zone reordering
        for (const zoneName of ZONE_NAMES) {
            const group = new Adw.PreferencesGroup({
                title: `${zoneName[0].toUpperCase()}${zoneName.slice(1)} Zone`,
            });
            modulesPage.add(group);

            const moduleIds = (preset.zones[zoneName] ?? []).filter(id => !config.hiddenModules.includes(id));

            if (moduleIds.length === 0) {
                const row = new Adw.ActionRow({
                    title: '(empty)',
                    subtitle: 'Enable modules in Module Visibility to add them here',
                    css_classes: ['dim-label'],
                });
                group.add(row);
            } else {
                moduleIds.forEach((id, index) => {
                    const row = new Adw.ActionRow({title: id});

                    const upBtn = new Gtk.Button({
                        icon_name: 'go-up-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                        sensitive: index > 0,
                    });
                    upBtn.connect('clicked', () => {
                        [moduleIds[index - 1], moduleIds[index]] =
                            [moduleIds[index], moduleIds[index - 1]];
                        store.save(config);
                        window.close();
                    });

                    const downBtn = new Gtk.Button({
                        icon_name: 'go-down-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                        sensitive: index < moduleIds.length - 1,
                    });
                    downBtn.connect('clicked', () => {
                        [moduleIds[index], moduleIds[index + 1]] =
                            [moduleIds[index + 1], moduleIds[index]];
                        store.save(config);
                        window.close();
                    });

                    const removeBtn = new Gtk.Button({
                        icon_name: 'user-trash-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                    });
                    removeBtn.connect('clicked', () => {
                        moduleIds.splice(index, 1);
                        store.save(config);
                        window.close();
                    });

                    row.add_suffix(upBtn);
                    row.add_suffix(downBtn);
                    row.add_suffix(removeBtn);
                    group.add(row);
                });
            }
        }

        // --- PAGE 3: Appearance ---
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-theme-symbolic',
        });
        window.add(appearancePage);

        const themeGroup = new Adw.PreferencesGroup({
            title: 'Color Source',
            description: 'Path to matugen’s generated CSS. Leave empty for the built-in fixed palette. Matugen generates colors from your wallpaper.',
        });
        appearancePage.add(themeGroup);

        // EntryRow has no "subtitle" on older libadwaita — hint lives in the group description.
        const colorSourceRow = new Adw.EntryRow({
            title: 'Matugen CSS Path',
            text: config.colorSource ?? '',
            show_apply_button: true,
        });
        colorSourceRow.connect('apply', () => {
            config.colorSource = colorSourceRow.get_text() || null;
            store.save(config);
        });
        themeGroup.add(colorSourceRow);

        const flushPendingSave = () => {
            if (saveDebounceId) {
                GLib.source_remove(saveDebounceId);
                saveDebounceId = null;
                store.save(config);
            }
        };
        window.connect('close-request', () => {
            flushPendingSave();
            return false;
        });
        window.connect('destroy', flushPendingSave);
        window.connect('unrealize', flushPendingSave);

        // Live watch: sync sliders and visibility from external changes
        try {
            store.watch(newConfig => {
                const newSize = newConfig.panelSize ?? {};
                syncingExternal = true;
                for (const k of ['scale', 'gapTop', 'gapBottom']) {
                    const entry = sliderMap[k];
                    if (!entry) continue;
                    const v = newSize[k];
                    if (v != null && Math.abs(entry.adjustment.value - v) > 0.001) {
                        entry.adjustment.value = v;
                        panelSize[k] = v;
                        entry.updateValueLabel();
                    }
                }
                // Sync hidden modules
                if (newConfig.hiddenModules) {
                    config.hiddenModules = newConfig.hiddenModules;
                    // Note: zone lists need window reload to reflect changes
                }
                config.panelSize = {...panelSize};
                config.presets = newConfig.presets;
                config.activePreset = newConfig.activePreset;
                config.colorSource = newConfig.colorSource;
                syncingExternal = false;
            });
            window.connect('destroy', () => store.unwatch());
            window.connect('unrealize', () => store.unwatch());
            window.connect('close-request', () => { store.unwatch(); return false; });
        } catch (e) { logError(e, 'material-panel prefs watch failed'); }
    }
}