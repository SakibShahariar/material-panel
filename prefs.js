import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ConfigStore} from './lib/configStore.js';
import {mergeConfigChanges, syncObjectInPlace} from './lib/configMerge.js';
import {applyLayoutStyle, LAYOUT_DEFAULT, LAYOUT_END4, LAYOUT_RYOKU} from './lib/layoutPresets.js';
// Prefer moduleIds over moduleRegistry: the registry imports every panel
// module (St, Clutter, Main, …) which only exist inside gnome-shell.
// Preferences run in a separate GTK process and cannot load those typelibs.
import {hasBuiltin} from './lib/moduleIds.js';
import {readStatusRolesFile} from './lib/statusRolesFile.js';
import {SLIDER_STYLES, SLIDER_STYLE_DEFAULT} from './lib/sliderStyleMeta.js';
import {TILE_STYLES, TILE_STYLE_DEFAULT} from './lib/tileStyleMeta.js';

const ZONE_NAMES = ['left', 'center', 'right'];
const EXT_PREFIX = 'extension:';
function extId(role) { return `${EXT_PREFIX}${role}`; }
function roleFromExt(id) {
    return id.startsWith(EXT_PREFIX) ? id.slice(EXT_PREFIX.length) : null;
}
/** Keep preset.zones in sync with tray placement (option C). */
function syncExtensionZone(config, role, placement) {
    const id = extId(role);
    const preset = config.presets?.[config.activePreset];
    if (!preset?.zones) return;
    for (const z of ZONE_NAMES) {
        const arr = preset.zones[z] ?? [];
        preset.zones[z] = arr.filter(x => x !== id);
    }
    if (placement === 'left' || placement === 'right' || placement === 'center') {
        if (!preset.zones[placement])
            preset.zones[placement] = [];
        if (!preset.zones[placement].includes(id))
            preset.zones[placement].push(id);
    }
}
function friendlyRoleName(role) {
    // appindicatorsupport-chrome-status-icon-5 → chrome…
    let s = String(role);
    s = s.replace(/^appindicatorsupport-/, '');
    s = s.replace(/^appIndicator[:\-]?/i, '');
    s = s.replace(/-status-icon-\d+$/, '');
    s = s.replace(/[_-]+/g, ' ').trim();
    return s || role;
}

const ALL_MODULES = [
    {id: 'activities', name: 'Activities', zone: 'left'},
    {id: 'focusedWindow', name: 'Focused Window', zone: 'left'},
    {id: 'btConnected', name: 'BT Connected Device', zone: 'left'},
    {id: 'workspaces', name: 'Workspaces', zone: 'left'},
    {id: 'cpu', name: 'CPU / Activity', zone: 'left'},
    {id: 'memory', name: 'Memory', zone: 'left'},
    {id: 'disk', name: 'Disk', zone: 'left'},
    {id: 'gpu', name: 'GPU', zone: 'left'},
    {id: 'networkSpeed', name: 'Network Speed', zone: 'right'},
    {id: 'clock', name: 'Clock', zone: 'center'},
    {id: 'weather', name: 'Weather', zone: 'center'},
    {id: 'notifications', name: 'Notifications', zone: 'center'},
    {id: 'battery', name: 'Battery', zone: 'right'},
    {id: 'volume', name: 'Volume', zone: 'right'},
    {id: 'network', name: 'Network', zone: 'right'},
    {id: 'darkmode', name: 'Dark Mode', zone: 'right'},
    {id: 'nightlight', name: 'Night Light', zone: 'right'},
    {id: 'dnd', name: 'Do Not Disturb', zone: 'right'},
    {id: 'powermenu', name: 'Power Menu', zone: 'right'},
    {id: 'bluetooth', name: 'Bluetooth', zone: 'right'},
    {id: 'media', name: 'Media', zone: 'right'},
    {id: 'quicksettings', name: 'Quick Settings', zone: 'right'},
];

export default class MaterialPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const store = new ConfigStore();
        const config = store.load();
        let baseline = JSON.parse(JSON.stringify(config));
        const preferencePages = [];
        const addPreferencesPage = page => {
            preferencePages.push(page);
            window.add(page);
        };
        const saveConfig = () => {
            try {
                // Merge local edits over the latest disk state to preserve unrelated external edits.
                const latest = store.load();
                const merged = mergeConfigChanges(baseline, config, latest);
                store.save(merged);
                const saved = store.load();
                syncObjectInPlace(config, saved);
                baseline = JSON.parse(JSON.stringify(saved));
            } catch (e) {
                console.error('material-panel prefs: save failed', e);
            }
        };
        // Header: reset to defaults
        try {
            const resetBtn = new Gtk.Button({
                label: 'Reset to defaults',
                css_classes: ['destructive-action'],
                valign: Gtk.Align.CENTER,
            });
            resetBtn.connect('clicked', () => {
                const dialog = new Adw.AlertDialog({
                    heading: 'Reset Material Panel?',
                    body: 'All layout, size, tray, and appearance settings will be restored to defaults. This cannot be undone.',
                });
                dialog.add_response('cancel', 'Cancel');
                dialog.add_response('reset', 'Reset');
                dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
                dialog.connect('response', (_d, response) => {
                    if (response !== 'reset')
                        return;
                    try {
                        // Flush pending edits and stop the old watcher before
                        // resetting, or its final save could overwrite defaults.
                        cleanup();
                        store.resetDefaults();
                        for (const page of preferencePages)
                            window.remove(page);
                        const header = resetBtn.get_parent?.();
                        header?.remove?.(resetBtn);
                        this.fillPreferencesWindow(window);
                        window.add_toast(new Adw.Toast({title: 'Defaults restored'}));
                    } catch (e) {
                        console.error('material-panel: reset failed', e);
                        try {
                            window.add_toast(new Adw.Toast({title: 'Reset failed'}));
                        } catch (e2) {}
                    }
                });
                dialog.present(window);
            });
            try {
                window.add_header_suffix?.(resetBtn);
            } catch (e) {
                // Fallback: not all versions have add_header_suffix
            }
        } catch (e) {
            console.error('material-panel: reset button', e);
        }


        let preset = config.presets[config.activePreset];

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
            let gapSide = Number(raw.gapSide);
            if (!Number.isFinite(gapSide))
                gapSide = 0;
            gapSide = Math.max(0, Math.min(48, Math.round(gapSide)));
            let chipGap = Number(raw.chipGap);
            if (!Number.isFinite(chipGap))
                chipGap = 4;
            chipGap = Math.max(0, Math.min(16, Math.round(chipGap)));
            let popupOpacity = Number(raw.popupOpacity);
            if (!Number.isFinite(popupOpacity))
                popupOpacity = 0.92;
            popupOpacity = Math.max(0.5, Math.min(1, popupOpacity));
            config.panelSize = {scale, gapTop, gapBottom, gapSide, chipGap, popupOpacity};
        }
        const panelSize = config.panelSize;

        // Initialize hidden modules list if not present
        if (!config.hiddenModules) config.hiddenModules = [];

        // Adw.PreferencesWindow only supports Adw.PreferencesPage via window.add().

        // —— Layout (Default vs End-4) ——
        const layoutPage = new Adw.PreferencesPage({
            title: 'Layout',
            icon_name: 'view-grid-symbolic',
        });
        const layoutGroup = new Adw.PreferencesGroup({
            title: 'Panel layout',
            description: 'Switch looks without losing the other layout’s module placement.',
        });
        const layoutRow = new Adw.ActionRow({
            title: 'Style',
            subtitle: 'Default keeps the classic three-zone bar. End-4 uses floating BarGroups and denser Quick Settings; Ryoku uses a rail-and-stage Quick Settings layout.',
        });
        const layoutDrop = new Gtk.DropDown({
            model: Gtk.StringList.new(['Default', 'End-4', 'Ryoku']),
            valign: Gtk.Align.CENTER,
        });
        layoutDrop.set_selected(
            config.layoutStyle === 'end4' ? 1
                : config.layoutStyle === 'ryoku' ? 2
                    : 0);
        layoutDrop.connect('notify::selected', () => {
            const sel = layoutDrop.get_selected();
            const style = sel === 1 ? LAYOUT_END4
                : sel === 2 ? LAYOUT_RYOKU
                    : LAYOUT_DEFAULT;
            applyLayoutStyle(config, style);
            saveConfig()
        });
        layoutRow.add_suffix(layoutDrop);
        layoutRow.activatable_widget = layoutDrop;
        layoutGroup.add(layoutRow);

        const gapSideRow = new Adw.SpinRow({
            title: 'Side inset',
            subtitle: 'Horizontal float gap (End-4). 0 = edge-to-edge.',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 48, step_increment: 1, page_increment: 4,
                value: config.panelSize?.gapSide ?? 0,
            }),
        });
        gapSideRow.connect('changed', () => {
            if (!config.panelSize) config.panelSize = {};
            config.panelSize.gapSide = gapSideRow.get_value();
            saveConfig()
        });
        layoutGroup.add(gapSideRow);
        layoutPage.add(layoutGroup);
        addPreferencesPage(layoutPage);

        // TabView / set_title_widget are for Adw.ApplicationWindow — not available here.

        // --- PAGE 1: General / Panel Size ---
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        addPreferencesPage(generalPage);

        if (store.invalidConfigBackupPath) {
            const recoveryGroup = new Adw.PreferencesGroup({
                title: 'Configuration recovery',
                description: 'The saved config could not be read. Material Panel is using defaults, and the original file was preserved for recovery.',
            });
            generalPage.add(recoveryGroup);
            const recoveryRow = new Adw.ActionRow({
                title: 'Invalid configuration preserved',
                subtitle: store.invalidConfigBackupPath,
            });
            const openFolderButton = new Gtk.Button({
                label: 'Open folder',
                valign: Gtk.Align.CENTER,
            });
            openFolderButton.connect('clicked', () => {
                try {
                    const folder = GLib.build_filenamev([
                        GLib.get_home_dir(), '.config', 'material-panel',
                    ]);
                    Gio.AppInfo.launch_default_for_uri(
                        Gio.File.new_for_path(folder).get_uri(), null);
                } catch (e) {
                    logError(e, 'material-panel prefs: open config folder');
                }
            });
            recoveryRow.add_suffix(openFolderButton);
            recoveryGroup.add(recoveryRow);
        }

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
                if (key === 'popupOpacity') return `${Math.round(v * 100)}%`;
                return `${Math.round(v)} px`;
            };
            let initial = Number(panelSize[key]);
            if (!Number.isFinite(initial)) {
                if (key === 'scale') initial = 1.0;
                else if (key === 'gapTop') initial = 5;
                else if (key === 'gapBottom') initial = 4;
                else if (key === 'chipGap') initial = 4;
                else if (key === 'popupOpacity') initial = 0.92;
                else initial = 4;
            }
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
                if (key !== 'scale' && key !== 'popupOpacity')
                    v = Math.round(v);
                if (key === 'popupOpacity')
                    v = Math.round(v * 100) / 100;
                panelSize[key] = v;
                config.panelSize = {
                    scale: Number(panelSize.scale),
                    gapTop: Math.round(Number(panelSize.gapTop)),
                    gapBottom: Math.round(Number(panelSize.gapBottom)),
                    gapSide: Math.round(Number(panelSize.gapSide ?? config.panelSize?.gapSide ?? 0)),
                    chipGap: Math.round(Number(panelSize.chipGap ?? 4)),
                    popupOpacity: Number(panelSize.popupOpacity ?? 0.92),
                };
                updateValueLabel();
                if (saveDebounceId)
                    GLib.source_remove(saveDebounceId);
                saveDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 280, () => {
                    saveDebounceId = null;
                    saveConfig()
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
        makeSliderRow({
            title: 'Chip gap',
            key: 'chipGap', min: 0, max: 16, step: 1,
        });
        makeSliderRow({
            title: 'Popup opacity',
            key: 'popupOpacity', min: 0.5, max: 1.0, step: 0.02,
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
            saveConfig()
        });
        clockRow.add_suffix(clockSwitch);
        clockRow.activatable_widget = clockSwitch;
        clockGroup.add(clockRow);

        const weatherGroup = new Adw.PreferencesGroup({
            title: 'Weather location',
            description: 'Optional manual override. Coordinates are decimal degrees; leave both empty to use GNOME Weather. No IP geolocation is used.',
        });
        generalPage.add(weatherGroup);
        config.weatherLocation ??= {name: '', latitude: '', longitude: ''};
        const weatherName = new Adw.EntryRow({
            title: 'City or location name',
            text: String(config.weatherLocation.name ?? ''),
        });
        const weatherLatitude = new Adw.EntryRow({
            title: 'Latitude',
            text: String(config.weatherLocation.latitude ?? ''),
        });
        const weatherLongitude = new Adw.EntryRow({
            title: 'Longitude',
            text: String(config.weatherLocation.longitude ?? ''),
        });
        weatherGroup.add(weatherName);
        weatherGroup.add(weatherLatitude);
        weatherGroup.add(weatherLongitude);
        const weatherActions = new Adw.ActionRow({
            title: 'Manual location',
            subtitle: 'Save coordinates to use this location instead of GNOME Weather.',
        });
        const weatherSave = new Gtk.Button({
            label: 'Save',
            valign: Gtk.Align.CENTER,
        });
        weatherSave.connect('clicked', () => {
            if (syncingExternal) return;
            const latitude = weatherLatitude.text.trim();
            const longitude = weatherLongitude.text.trim();
            const name = weatherName.text.trim();
            if (latitude || longitude) {
                const lat = Number(latitude);
                const lon = Number(longitude);
                if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) ||
                    lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    window.add_toast(new Adw.Toast({title: 'Enter valid latitude and longitude'}));
                    return;
                }
            }
            config.weatherLocation = {name, latitude, longitude};
            saveConfig();
            window.add_toast(new Adw.Toast({
                title: latitude && longitude ? 'Manual weather location saved' : 'Using GNOME Weather location',
            }));
        });
        weatherActions.add_suffix(weatherSave);
        weatherActions.activatable_widget = weatherSave;
        weatherGroup.add(weatherActions);

        const activityGroup = new Adw.PreferencesGroup({
            title: 'Activity chip',
            description: 'What the CPU / Activity chip shows on the bar.',
        });
        generalPage.add(activityGroup);
        if (!['cpu', 'cpu-ram', 'ram'].includes(config.activityChip))
            config.activityChip = 'cpu';
        const activityRow = new Adw.ComboRow({
            title: 'Bar display',
            model: Gtk.StringList.new(['CPU + temp', 'CPU + RAM', 'RAM only']),
        });
        const actMap = ['cpu', 'cpu-ram', 'ram'];
        activityRow.set_selected(Math.max(0, actMap.indexOf(config.activityChip)));
        activityRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            const i = activityRow.get_selected();
            config.activityChip = actMap[i] ?? 'cpu';
            saveConfig();
        });
        activityGroup.add(activityRow);

        const privacyGroup = new Adw.PreferencesGroup({
            title: 'Privacy',
            description: 'Control personal details shown in Quick Settings.',
        });
        generalPage.add(privacyGroup);
        const privacyRow = new Adw.ActionRow({
            title: 'Hide profile name and hostname',
            subtitle: 'Show a generic “User” profile instead.',
        });
        const privacySwitch = new Gtk.Switch({
            active: config.hideProfileIdentity === true,
            valign: Gtk.Align.CENTER,
        });
        privacySwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.hideProfileIdentity = privacySwitch.active;
            saveConfig();
        });
        privacyRow.add_suffix(privacySwitch);
        privacyRow.activatable_widget = privacySwitch;
        privacyGroup.add(privacyRow);

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
            preset = config.presets[config.activePreset];
            saveConfig();
            refreshZoneEditor();
            infoGroup.description = `Preset: ${config.activePreset}`;
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
            saveConfig();
            fillPresetModel();
            preset = config.presets[config.activePreset];
            refreshZoneEditor();
            infoGroup.description = `Preset: ${config.activePreset}`;
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
            saveConfig();
            fillPresetModel();
            preset = config.presets.default;
            refreshZoneEditor();
            infoGroup.description = `Preset: ${config.activePreset}`;
        });
        deleteRow.add_suffix(deleteBtn);
        presetsGroup.add(deleteRow);

        // --- PAGE 2: Modules ---
        const modulesPage = new Adw.PreferencesPage({
            title: 'Modules',
            icon_name: 'view-grid-symbolic',
        });
        addPreferencesPage(modulesPage);

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
            const activePreset = config.presets?.[config.activePreset];
            const zones = activePreset?.zones ?? {};
            const isPlaced = ZONE_NAMES.some(zone => (zones[zone] ?? []).includes(module.id));
            const isHidden = config.hiddenModules.includes(module.id) || !isPlaced;
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
                    // Visibility alone cannot restore a module removed from every
                    // zone. Put it back in its documented default zone in that case.
                    const active = config.presets?.[config.activePreset];
                    if (active?.zones) {
                        const placed = ZONE_NAMES.some(zone =>
                            (active.zones[zone] ?? []).includes(module.id));
                        if (!placed) {
                            const target = ZONE_NAMES.includes(module.zone) ? module.zone : 'right';
                            if (!Array.isArray(active.zones[target]))
                                active.zones[target] = [];
                            active.zones[target].push(module.id);
                        }
                    }
                } else {
                    if (!hidden.includes(module.id)) hidden.push(module.id);
                }
                saveConfig()
            });
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            visibilityGroup.add(row);
        };

        // Show all known modules
        for (const module of ALL_MODULES) {
            createModuleToggle(module);
        }

        // Zone reordering: rebuild these groups whenever the active preset changes.
        const zoneGroups = [];
        const refreshZoneEditor = () => {
            for (const group of zoneGroups)
                modulesPage.remove(group);
            zoneGroups.length = 0;
            preset = config.presets?.[config.activePreset] ?? config.presets.default;
            for (const zoneName of ZONE_NAMES) {
            const group = new Adw.PreferencesGroup({
                title: `${zoneName[0].toUpperCase()}${zoneName.slice(1)} Zone`,
            });
            modulesPage.add(group);
            zoneGroups.push(group);

            // Foreign tray icons (extension:) are managed on the Tray page only for now
            const moduleIds = (preset.zones[zoneName] ?? []).filter(id =>
                !config.hiddenModules.includes(id) &&
                !String(id).startsWith(EXT_PREFIX));

            if (moduleIds.length === 0) {
                const row = new Adw.ActionRow({
                    title: '(empty)',
                    subtitle: 'Enable modules in Module Visibility to add them here',
                    css_classes: ['dim-label'],
                });
                group.add(row);
            } else {
                const zoneList = preset.zones[zoneName];
                moduleIds.forEach((id, index) => {
                    const row = new Adw.ActionRow({title: id});

                    const upBtn = new Gtk.Button({
                        icon_name: 'go-up-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                        sensitive: index > 0,
                    });
                    upBtn.connect('clicked', () => {
                        const i = zoneList.indexOf(id);
                        const prevId = moduleIds[index - 1];
                        const j = zoneList.indexOf(prevId);
                        if (i >= 0 && j >= 0) {
                            [zoneList[j], zoneList[i]] = [zoneList[i], zoneList[j]];
                            saveConfig()
                        }
                        window.close();
                    });

                    const downBtn = new Gtk.Button({
                        icon_name: 'go-down-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                        sensitive: index < moduleIds.length - 1,
                    });
                    downBtn.connect('clicked', () => {
                        const i = zoneList.indexOf(id);
                        const nextId = moduleIds[index + 1];
                        const j = zoneList.indexOf(nextId);
                        if (i >= 0 && j >= 0) {
                            [zoneList[i], zoneList[j]] = [zoneList[j], zoneList[i]];
                            saveConfig()
                        }
                        window.close();
                    });

                    const removeBtn = new Gtk.Button({
                        icon_name: 'user-trash-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                    });
                    removeBtn.connect('clicked', () => {
                        const i = zoneList.indexOf(id);
                        if (i >= 0)
                            zoneList.splice(i, 1);
                        saveConfig()
                        window.close();
                    });

                    row.add_suffix(upBtn);
                    row.add_suffix(downBtn);
                    row.add_suffix(removeBtn);
                    group.add(row);
                });
            }
            }
        };
        refreshZoneEditor();


        // --- PAGE: Tray / foreign indicators ---
        // Hide-all is ONLY config.trayAllHidden — never rewrites per-icon zones.
        if (!Array.isArray(config.hiddenForeignRoles))
            config.hiddenForeignRoles = [];
        if (!config.foreignRoleZones || typeof config.foreignRoleZones !== 'object')
            config.foreignRoleZones = {};
        if (config.trayAllHidden == null)
            config.trayAllHidden = false;
        if (config.trayDrawer == null)
            config.trayDrawer = true;

        // Old hide-all stamped every role "hidden" — clear so model B stays opt-in
        if (!config.trayAllHidden && config.foreignRoleZones) {
            const vals = Object.values(config.foreignRoleZones);
            if (vals.length && vals.every(v => v === 'hidden')) {
                config.foreignRoleZones = {};
                config.hiddenForeignRoles = [];
                saveConfig()
            }
        }

        const trayPage = new Adw.PreferencesPage({
            title: 'Tray',
            icon_name: 'view-list-symbolic',
        });
        addPreferencesPage(trayPage);

        const trayActions = new Adw.PreferencesGroup({title: 'Actions'});
        trayPage.add(trayActions);

        const hideAllRow = new Adw.ActionRow({
            title: 'Hide all on Material Panel',
            subtitle: 'Hide background-app tray icons only (Discord, etc.) — not other extensions',
        });
        const hideAllSwitch = new Gtk.Switch({
            active: !!config.trayAllHidden,
            valign: Gtk.Align.CENTER,
        });
        hideAllRow.add_suffix(hideAllSwitch);
        hideAllRow.activatable_widget = hideAllSwitch;
        trayActions.add(hideAllRow);

        const trayGroup = new Adw.PreferencesGroup({
            title: 'Background app iconss',
            description: 'Opt-in only: Hidden = not on Material Panel (stays on GNOME bar). Left/Right/Center = show on our panel.',
        });
        trayPage.add(trayGroup);

        const trayCombos = [];
        const discovered = readStatusRolesFile();
        const known = new Set([
            ...discovered,
            ...Object.keys(config.foreignRoleZones),
        ]);
        try {
            const pz = config.presets?.[config.activePreset]?.zones ?? {};
            for (const z of ZONE_NAMES) {
                for (const id of pz[z] ?? []) {
                    const r = roleFromExt(id);
                    if (r) known.add(r);
                }
            }
        } catch (e) {}

        const roleList = [...known].sort();

        // Off first = exclusive-group leader. If GTK falls back to leader, stays Off not Right.
        const PLACE_OPTS = [
            {id: 'hidden', label: 'Off'},
            {id: 'left', label: 'L'},
            {id: 'center', label: 'C'},
            {id: 'right', label: 'R'},
        ];

        const setRolePlacement = (role, z) => {
            config.foreignRoleZones = Object.assign(
                {}, config.foreignRoleZones || {}, {[role]: z});
            const hidden = new Set(config.hiddenForeignRoles ?? []);
            if (z === 'hidden')
                hidden.add(role);
            else
                hidden.delete(role);
            config.hiddenForeignRoles = [...hidden].sort();
            // Drop preset extension: claims so a later rebuild cannot put it back on Right
            try {
                syncExtensionZone(config, role, z === 'hidden' ? 'hidden' : z);
            } catch (e) {}
            saveConfig()
        };

        if (roleList.length === 0) {
            trayGroup.add(new Adw.ActionRow({
                title: 'No icons discovered yet',
                subtitle: 'Reload the shell, then reopen settings',
            }));
        } else {
            for (const role of roleList) {
                // Single source: foreignRoleZones only (model B). Missing → Off.
                let current = config.foreignRoleZones?.[role];
                if (current !== 'left' && current !== 'right' &&
                    current !== 'center' && current !== 'hidden')
                    current = 'hidden';

                const row = new Adw.ActionRow({
                    title: friendlyRoleName(role),
                    subtitle: role,
                    sensitive: !config.trayAllHidden,
                });

                const btnBox = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 4,
                    valign: Gtk.Align.CENTER,
                    css_classes: ['linked'],
                });

                const buttons = {};
                let groupLeader = null;
                // Block toggled handlers while setting initial active state
                syncingExternal = true;
                for (const opt of PLACE_OPTS) {
                    const btn = new Gtk.ToggleButton({
                        label: opt.label,
                        valign: Gtk.Align.CENTER,
                    });
                    if (groupLeader)
                        btn.group = groupLeader;
                    else
                        groupLeader = btn;
                    buttons[opt.id] = btn;
                    btn.connect('toggled', () => {
                        if (syncingExternal || config.trayAllHidden)
                            return;
                        if (!btn.active)
                            return;
                        setRolePlacement(role, opt.id);
                    });
                    btnBox.append(btn);
                }
                // Default / missing → Off (never imply Right)
                if (!['left', 'right', 'center', 'hidden'].includes(current))
                    current = 'right';
                for (const opt of PLACE_OPTS)
                    buttons[opt.id].active = (opt.id === current);
                syncingExternal = false;

                row.add_suffix(btnBox);
                trayCombos.push({buttons, role, row});
                trayGroup.add(row);
            }
        }

        const setCombosSensitive = sensitive => {
            for (const {row} of trayCombos) {
                try { row.sensitive = sensitive; } catch (e) {}
            }
        };
        setCombosSensitive(!config.trayAllHidden);

        hideAllSwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.trayAllHidden = !!hideAllSwitch.active;
            if (!config.trayAllHidden) {
                config.hiddenForeignRoles = Object.entries(config.foreignRoleZones || {})
                    .filter(([, z]) => z === 'hidden')
                    .map(([r]) => r);
            }
            setCombosSensitive(!config.trayAllHidden);
            saveConfig()
        });

        const drawerRow = new Adw.ActionRow({
            title: 'Collapse into drawer',
            subtitle: 'Chevron expands tray icons (Omarchy-style)',
        });
        const drawerSwitch = new Gtk.Switch({
            active: config.trayDrawer !== false,
            valign: Gtk.Align.CENTER,
        });
        drawerRow.add_suffix(drawerSwitch);
        drawerRow.activatable_widget = drawerSwitch;
        trayActions.add(drawerRow);
        drawerSwitch.connect('notify::active', () => {
            config.trayDrawer = !!drawerSwitch.active;
            saveConfig()
        });


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

        const flushPendingSave = () => {
            if (saveDebounceId) {
                GLib.source_remove(saveDebounceId);
                saveDebounceId = null;
                saveConfig()
            }
        };
        let cleanedUp = false;
        const cleanup = () => {
            flushPendingSave();
            if (cleanedUp)
                return;
            cleanedUp = true;
            try {
                store.unwatch();
            } catch (e) {
                console.error('material-panel prefs: config watcher cleanup failed', e);
            }
        };
        window.connect('close-request', () => {
            cleanup();
            return false;
        });
        window.connect('destroy', cleanup);
        // Unrealize can occur without closing the window; flush saves but keep
        // the watcher alive until close-request/destroy actually tears it down.
        window.connect('unrealize', flushPendingSave);

        try {
            store.watch(newConfig => {
                // Apply external edits to untouched settings without discarding
                // any local preference changes still being edited.
                const merged = mergeConfigChanges(baseline, config, newConfig);
                syncObjectInPlace(config, merged);
                baseline = JSON.parse(JSON.stringify(newConfig));

                const newSize = config.panelSize ?? {};
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
                syncingExternal = false;
            });
        } catch (e) {
            console.error(e);
        }
    }
}
