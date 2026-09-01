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
        // Clamp like ConfigStore — `0 ?? 1.0` is still 0 (?? only skips nullish)
        {
            const raw = config.panelSize ?? {};
            let scale = Number(raw.scale);
            if (!Number.isFinite(scale) || scale < 0.7 || scale > 1.5)
                scale = 1.0;
            let gapTop = Number(raw.gapTop);
            if (!Number.isFinite(gapTop))
                gapTop = 5;
            gapTop = Math.max(0, Math.min(14, Math.round(gapTop)));
            let gapBottom = Number(raw.gapBottom);
            if (!Number.isFinite(gapBottom))
                gapBottom = 4;
            gapBottom = Math.max(0, Math.min(14, Math.round(gapBottom)));
            config.panelSize = {scale, gapTop, gapBottom};
        }
        const panelSize = config.panelSize;

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
            description: '',
        });
        generalPage.add(sizeGroup);

        let saveDebounceId = null;
        const sliderMap = {};
        let syncingExternal = false;

        const makeSliderRow = ({title, subtitle = null, key, min, max, step}) => {
            const formatValue = v => {
                if (key === 'scale') return `${v.toFixed(2)}×`;
                return `${Math.round(v)} px`;
            };
            let initial = Number(panelSize[key]);
            if (!Number.isFinite(initial))
                initial = key === 'scale' ? 1.0 : (key === 'gapTop' ? 5 : 4);
            initial = Math.max(min, Math.min(max, initial));
            panelSize[key] = initial;

            // GJS/Gtk: set bounds before value — constructor `value: x` often stays 0
            const adjustment = new Gtk.Adjustment();
            adjustment.set_lower(min);
            adjustment.set_upper(max);
            adjustment.set_step_increment(step);
            adjustment.set_page_increment(Math.max(step, step * 2));
            adjustment.set_value(initial);

            const row = new Adw.ActionRow({title});
            const scale = new Gtk.Scale({
                orientation: Gtk.Orientation.HORIZONTAL,
                adjustment,
                digits: step < 1 ? 2 : 0,
                width_request: 180,
                valign: Gtk.Align.CENTER,
                draw_value: false,
                hexpand: true,
            });
            // Re-assert after Scale attaches (some GTK versions reset to lower)
            adjustment.set_value(initial);

            const valueLabel = new Gtk.Label({
                label: formatValue(initial),
                width_request: 52,
                xalign: 1,
                valign: Gtk.Align.CENTER,
                css_classes: ['dim-label', 'monospace'],
            });
            const updateValueLabel = () => {
                const shown = Number(adjustment.get_value());
                valueLabel.label = formatValue(shown);
                scale.set_tooltip_text(formatValue(shown));
            };
            updateValueLabel();

            scale.connect('value-changed', () => {
                if (syncingExternal) return;
                let v = Number(adjustment.get_value());
                if (!Number.isFinite(v))
                    return;
                v = Math.max(min, Math.min(max, v));
                if (key !== 'scale')
                    v = Math.round(v);
                panelSize[key] = v;
                config.panelSize = {
                    scale: Number(panelSize.scale),
                    gapTop: Math.round(Number(panelSize.gapTop)),
                    gapBottom: Math.round(Number(panelSize.gapBottom)),
                };
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
            key: 'scale', min: 0.7, max: 1.5, step: 0.05,
        });
        makeSliderRow({
            title: 'Top gap',
            key: 'gapTop', min: 0, max: 14, step: 1,
        });
        makeSliderRow({
            title: 'Bottom gap',
            key: 'gapBottom', min: 0, max: 14, step: 1,
        });

        const clockGroup = new Adw.PreferencesGroup({
            title: 'Clock',
            description: '',
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

        // --- Presets ---
        if (!config.presets || typeof config.presets !== 'object')
            config.presets = {};
        if (!config.presets.default) {
            config.presets.default = {
                zones: {
                    left: ['activities', 'workspaces', 'cpu'],
                    center: ['clock'],
                    right: ['networkSpeed', 'volume', 'battery', 'quicksettings'],
                },
            };
        }
        if (!config.activePreset || !config.presets[config.activePreset])
            config.activePreset = 'default';

        const presetsGroup = new Adw.PreferencesGroup({
            title: 'Presets',
            description: '',
        });
        generalPage.add(presetsGroup);

        const presetNames = () => Object.keys(config.presets).sort();

        const presetRow = new Adw.ComboRow({
            title: 'Active preset',
        });
        const fillPresetModel = () => {
            const model = new Gtk.StringList();
            for (const name of presetNames())
                model.append(name);
            presetRow.model = model;
            const names = presetNames();
            presetRow.selected = Math.max(0, names.indexOf(config.activePreset));
        };
        fillPresetModel();
        presetRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            const names = presetNames();
            const i = presetRow.selected;
            if (i < 0 || i >= names.length) return;
            const name = names[i];
            if (name === config.activePreset) return;
            config.activePreset = name;
            store.save(config);
        });
        presetsGroup.add(presetRow);

        const duplicateRow = new Adw.EntryRow({
            title: 'Save copy as…',
            text: '',
            show_apply_button: true,
        });
        duplicateRow.connect('apply', () => {
            if (syncingExternal) return;
            let name = (duplicateRow.get_text() || '').trim();
            if (!name) return;
            name = name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'preset';
            const current = config.presets[config.activePreset];
            if (!current) return;
            config.presets[name] = JSON.parse(JSON.stringify(current));
            config.activePreset = name;
            store.save(config);
            fillPresetModel();
            duplicateRow.text = '';
        });
        presetsGroup.add(duplicateRow);

        const deleteRow = new Adw.ActionRow({
            title: 'Delete active preset',
            subtitle: 'Cannot delete "default"',
        });
        const deleteBtn = new Gtk.Button({
            label: 'Delete',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        deleteBtn.connect('clicked', () => {
            if (syncingExternal) return;
            const name = config.activePreset;
            if (name === 'default' || !config.presets[name]) return;
            delete config.presets[name];
            config.activePreset = 'default';
            store.save(config);
            fillPresetModel();
        });
        deleteRow.add_suffix(deleteBtn);
        presetsGroup.add(deleteRow);

        // --- PAGE 2: Modules ---
        const modulesPage = new Adw.PreferencesPage({
            title: 'Modules',
            icon_name: 'view-grid-symbolic',
        });
        window.add(modulesPage);

        const infoGroup = new Adw.PreferencesGroup({
            description: `Preset: ${config.activePreset}`,
        });
        modulesPage.add(infoGroup);

        // Module visibility toggles
        const visibilityGroup = new Adw.PreferencesGroup({
            title: 'Module Visibility',
            description: '',
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
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(appearancePage);

        const themeGroup = new Adw.PreferencesGroup({
            title: 'Color Source',
            description: 'Empty = auto matugen file if present, else fixed palette.',
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
                    let v = Number(newSize[k]);
                    if (!Number.isFinite(v))
                        continue;
                    if (k === 'scale')
                        v = Math.max(0.7, Math.min(1.5, v));
                    else
                        v = Math.max(0, Math.min(14, Math.round(v)));
                    if (Math.abs(entry.adjustment.get_value() - v) > 0.001) {
                        entry.adjustment.set_value(v);
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