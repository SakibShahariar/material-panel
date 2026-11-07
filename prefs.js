import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ConfigStore} from './lib/configStore.js';
import {formatWeatherLocations, parseWeatherLocations} from './lib/weatherLocations.js';
import {DEFAULT_POPUP_SHORTCUTS, findPopupShortcutConflicts, normalizePopupShortcuts, POPUP_SHORTCUT_TARGETS} from './lib/popupShortcuts.js';
import {mergeConfigChanges, syncObjectInPlace} from './lib/configMerge.js';
import {serializeLayoutPreset, parseLayoutPreset} from './lib/layoutPresetIo.js';
import {formatQuickSettingsTileOrder} from './lib/quickSettingsTiles.js';
import {buildLayoutPage} from './prefs/layoutPage.js';
import {buildModulesPage} from './prefs/modulesPage.js';
import {buildTrayPage} from './prefs/trayPage.js';
import {buildAppearancePage} from './prefs/appearancePage.js';
import {buildQuickLaunchPage} from './prefs/quickLaunchPage.js';
import {buildClipboardHistoryPage} from './prefs/clipboardHistoryPage.js';
import {createSafeModeConfig, parsePanelConfig, serializePanelConfig} from './lib/configImportExport.js';

export default class MaterialPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const store = new ConfigStore();
        let cancelled = false;
        const loadingPage = new Adw.PreferencesPage({title: 'Loading settings'});
        loadingPage.add(new Adw.PreferencesGroup({
            description: 'Reading your Material Panel configuration…',
        }));
        window.add(loadingPage);
        window.connect('close-request', () => {
            cancelled = true;
            return false;
        });

        store.loadAsync().then(config => {
            if (cancelled)
                return;
            window.remove(loadingPage);
            this._buildPreferencesWindow(window, store, config);
        }).catch(error => {
            if (cancelled)
                return;
            console.error('material-panel prefs: asynchronous config load failed', error);
            window.remove(loadingPage);
            const errorPage = new Adw.PreferencesPage({title: 'Settings unavailable'});
            errorPage.add(new Adw.PreferencesGroup({
                description: 'Material Panel could not read its configuration. Close and reopen Preferences to try again.',
            }));
            window.add(errorPage);
        });
    }

    _buildPreferencesWindow(window, store, config) {
        let baseline = JSON.parse(JSON.stringify(config));
        const preferencePages = [];
        const addPreferencesPage = page => {
            preferencePages.push(page);
            window.add(page);
        };
        // Serialize saves so rapid control changes cannot race and overwrite
        // one another with stale snapshots of the same config file.
        let saveQueue = Promise.resolve();
        const saveConfig = () => {
            saveQueue = saveQueue.then(async () => {
                // Merge local edits over the latest disk state to preserve unrelated external edits.
                const latest = await store.loadAsync();
                const merged = mergeConfigChanges(baseline, config, latest);
                await store.saveAsync(merged);
                const saved = await store.loadAsync();
                syncObjectInPlace(config, saved);
                baseline = JSON.parse(JSON.stringify(saved));
            }).catch(e => {
                console.error('material-panel prefs: asynchronous save failed', e);
            });
            return saveQueue;
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
                dialog.connect('response', async (_d, response) => {
                    if (response !== 'reset')
                        return;
                    try {
                        // Flush pending edits and stop the old watcher before
                        // resetting, or its final save could overwrite defaults.
                        cleanup();
                        // Wait for queued async edits before replacing them with defaults.
                        await saveQueue;
                        await store.resetDefaultsAsync();
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

        // Safe mode keeps the current theme settings but reduces the panel to
        // a clock and power menu so a problematic module/layout can be recovered.
        try {
            const safeModeBtn = new Gtk.Button({
                label: 'Safe mode',
                valign: Gtk.Align.CENTER,
            });
            safeModeBtn.connect('clicked', () => {
                const dialog = new Adw.AlertDialog({
                    heading: 'Start Material Panel in safe mode?',
                    body: 'Temporarily switch to a minimal panel containing only the clock and power menu. Your other settings remain saved in their presets.',
                });
                dialog.add_response('cancel', 'Cancel');
                dialog.add_response('safe', 'Start safe mode');
                dialog.set_response_appearance('safe', Adw.ResponseAppearance.DESTRUCTIVE);
                dialog.connect('response', async (_d, response) => {
                    if (response !== 'safe')
                        return;
                    try {
                        cleanup();
                        await saveQueue;
                        const current = await store.loadAsync();
                        await store.saveAsync(createSafeModeConfig(current));
                        for (const page of preferencePages)
                            window.remove(page);
                        const header = resetBtn.get_parent?.();
                        header?.remove?.(safeModeBtn);
                        header?.remove?.(resetBtn);
                        this.fillPreferencesWindow(window);
                        window.add_toast(new Adw.Toast({title: 'Safe mode enabled'}));
                    } catch (e) {
                        console.error('material-panel: safe mode failed', e);
                        try { window.add_toast(new Adw.Toast({title: 'Could not enable safe mode'})); } catch (e2) {}
                    }
                });
                dialog.present(window);
            });
            try { window.add_header_suffix?.(safeModeBtn); } catch (e) {}
        } catch (e) {
            console.error('material-panel: safe mode button', e);
        }

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

        buildLayoutPage({Adw, Gtk, config, saveConfig, addPreferencesPage});

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

        const backupGroup = new Adw.PreferencesGroup({
            title: 'Configuration backup',
            description: 'Export all panel settings, including module placement and theme/icon paths, or import a validated backup.',
        });
        generalPage.add(backupGroup);
        const exportConfigRow = new Adw.ActionRow({
            title: 'Export configuration',
            subtitle: 'Save the complete config.json as a JSON backup',
        });
        const exportConfigButton = new Gtk.Button({
            label: 'Export',
            valign: Gtk.Align.CENTER,
        });
        exportConfigButton.connect('clicked', async () => {
            let data;
            try {
                data = serializePanelConfig(await store.loadAsync());
            } catch (e) {
                logError(e, 'material-panel prefs: config export validation failed');
                window.add_toast(new Adw.Toast({title: 'Could not export configuration'}));
                return;
            }
            const chooser = new Gtk.FileChooserNative({
                title: 'Export Material Panel configuration',
                transient_for: window,
                action: Gtk.FileChooserAction.SAVE,
                accept_label: 'Export',
                cancel_label: 'Cancel',
            });
            chooser.set_current_name('material-panel-config.json');
            chooser.connect('response', (_dialog, response) => {
                if (response !== Gtk.ResponseType.ACCEPT) {
                    chooser.destroy();
                    return;
                }
                const file = chooser.get_file();
                chooser.destroy();
                if (!file)
                    return;
                file.replace_contents_async(
                    data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null, (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            window.add_toast(new Adw.Toast({title: 'Configuration exported'}));
                        } catch (e) {
                            logError(e, 'material-panel prefs: config export failed');
                            window.add_toast(new Adw.Toast({title: 'Configuration export failed'}));
                        }
                    });
            });
            chooser.show();
        });
        exportConfigRow.add_suffix(exportConfigButton);
        backupGroup.add(exportConfigRow);

        const importConfigRow = new Adw.ActionRow({
            title: 'Import configuration',
            subtitle: 'Validate a backup before replacing the current settings',
        });
        const importConfigButton = new Gtk.Button({
            label: 'Import',
            valign: Gtk.Align.CENTER,
        });
        importConfigButton.connect('clicked', () => {
            const chooser = new Gtk.FileChooserNative({
                title: 'Import Material Panel configuration',
                transient_for: window,
                action: Gtk.FileChooserAction.OPEN,
                accept_label: 'Import',
                cancel_label: 'Cancel',
            });
            chooser.connect('response', (_dialog, response) => {
                if (response !== Gtk.ResponseType.ACCEPT) {
                    chooser.destroy();
                    return;
                }
                const file = chooser.get_file();
                chooser.destroy();
                if (!file)
                    return;
                file.load_contents_async(null, (source, result) => {
                    try {
                        const [ok, bytes] = source.load_contents_finish(result);
                        if (!ok)
                            throw new Error('Could not read the selected configuration');
                        const parsed = parsePanelConfig(new TextDecoder('utf-8').decode(bytes));
                        const imported = store._normalizeParsedConfig(parsed, {persistCleanup: false});
                        if (!imported.presets?.[imported.activePreset])
                            throw new Error('The imported active preset is missing');
                        cleanup();
                        saveQueue.then(async () => {
                            await store.saveAsync(imported);
                            for (const page of preferencePages)
                                window.remove(page);
                            this.fillPreferencesWindow(window);
                            window.add_toast(new Adw.Toast({title: 'Configuration imported'}));
                        }).catch(error => {
                            logError(error, 'material-panel prefs: config import apply failed');
                            window.add_toast(new Adw.Toast({title: 'Configuration import failed'}));
                        });
                    } catch (e) {
                        logError(e, 'material-panel prefs: config import validation failed');
                        window.add_toast(new Adw.Toast({title: 'Invalid configuration file'}));
                    }
                });
            });
            chooser.show();
        });
        importConfigRow.add_suffix(importConfigButton);
        backupGroup.add(importConfigRow);

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

        const clockClickRow = new Adw.ActionRow({
            title: 'Click to cycle display format',
            subtitle: 'Click cycles time only, time and date, then weekday, date and time. Right-click still opens the calendar.',
        });
        const clockClickSwitch = new Gtk.Switch({
            active: config.clockClickCyclesFormat === true,
            valign: Gtk.Align.CENTER,
        });
        clockClickSwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.clockClickCyclesFormat = clockClickSwitch.active;
            saveConfig();
        });
        clockClickRow.add_suffix(clockClickSwitch);
        clockClickRow.activatable_widget = clockClickSwitch;
        clockGroup.add(clockClickRow);

        const workspaceGroup = new Adw.PreferencesGroup({
            title: 'Workspace indicator',
            description: 'Choose how workspaces are represented. Automatic keeps the current layout-specific presentation.',
        });
        generalPage.add(workspaceGroup);
        const workspaceDisplayModes = ['auto', 'numbers', 'dots', 'apps'];
        const workspaceDisplayRow = new Adw.ComboRow({
            title: 'Display style',
            model: Gtk.StringList.new([
                'Automatic (layout default)',
                'Numbered indicators',
                'Simple dots',
                'Application icon clusters',
            ]),
        });
        workspaceDisplayRow.set_selected(Math.max(
            0, workspaceDisplayModes.indexOf(config.workspaceDisplay ?? 'auto')));
        workspaceDisplayRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            config.workspaceDisplay = workspaceDisplayModes[workspaceDisplayRow.get_selected()] ?? 'auto';
            saveConfig();
        });
        workspaceGroup.add(workspaceDisplayRow);

        const workspaceFilterModes = ['all', 'active', 'urgent', 'occupied'];
        const workspaceFilterRow = new Adw.ComboRow({
            title: 'Visible workspaces',
            subtitle: 'Show all, only the active workspace, or the active workspace plus urgent or occupied workspaces.',
            model: Gtk.StringList.new([
                'All workspaces',
                'Active only',
                'Active + urgent',
                'Active + occupied',
            ]),
        });
        workspaceFilterRow.set_selected(Math.max(
            0, workspaceFilterModes.indexOf(config.workspaceFilter ?? 'all')));
        workspaceFilterRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            config.workspaceFilter = workspaceFilterModes[workspaceFilterRow.get_selected()] ?? 'all';
            saveConfig();
        });
        workspaceGroup.add(workspaceFilterRow);

        const workspaceScrollRow = new Adw.ActionRow({
            title: 'Scroll to switch workspaces',
            subtitle: 'Use the mouse wheel over the workspace indicator to move between existing workspaces.',
        });
        const workspaceScrollSwitch = new Gtk.Switch({
            active: config.workspaceScrollSwitch !== false,
            valign: Gtk.Align.CENTER,
        });
        workspaceScrollSwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.workspaceScrollSwitch = workspaceScrollSwitch.active;
            saveConfig();
        });
        workspaceScrollRow.add_suffix(workspaceScrollSwitch);
        workspaceScrollRow.activatable_widget = workspaceScrollSwitch;
        workspaceGroup.add(workspaceScrollRow);

        const weatherGroup = new Adw.PreferencesGroup({
            title: 'Weather location',
            description: 'Optional manual override. Coordinates are decimal degrees; leave both empty to use GNOME Weather. Saved locations use Name|latitude|longitude entries separated by semicolons. No IP geolocation is used.',
        });
        generalPage.add(weatherGroup);
        config.weatherLocation ??= {mode: 'gnome', name: '', latitude: '', longitude: ''};
        const weatherModeMap = ['gnome', 'manual', 'disabled'];
        const weatherModeRow = new Adw.ComboRow({
            title: 'Location source',
            subtitle: 'No IP-based geolocation requests are made.',
            model: Gtk.StringList.new([
                'GNOME Weather location',
                'Manual coordinates',
                'Disabled (no automatic lookup)',
            ]),
        });
        const initialWeatherMode = config.weatherLocation.mode ??
            (String(config.weatherLocation.latitude ?? '').trim() &&
             String(config.weatherLocation.longitude ?? '').trim() ? 'manual' : 'gnome');
        weatherModeRow.set_selected(Math.max(0, weatherModeMap.indexOf(initialWeatherMode)));
        weatherModeRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            config.weatherLocation = {
                ...config.weatherLocation,
                mode: weatherModeMap[weatherModeRow.get_selected()] ?? 'gnome',
            };
            saveConfig();
        });
        weatherGroup.add(weatherModeRow);
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
            config.weatherLocation = {
                ...config.weatherLocation,
                mode: latitude && longitude ? 'manual' : 'gnome',
                name, latitude, longitude,
            };
            weatherModeRow.set_selected(latitude && longitude ? 1 : 0);
            saveConfig();
            window.add_toast(new Adw.Toast({
                title: latitude && longitude ? 'Manual weather location saved' : 'Using GNOME Weather location',
            }));
        });
        weatherActions.add_suffix(weatherSave);
        weatherActions.activatable_widget = weatherSave;
        weatherGroup.add(weatherActions);

        const savedWeatherLocationsRow = new Adw.EntryRow({
            title: 'Saved locations (2–8)',
            text: formatWeatherLocations(config.weatherLocations),
            show_apply_button: true,
        });
        savedWeatherLocationsRow.connect('apply', () => {
            if (syncingExternal) return;
            const parsed = parseWeatherLocations(savedWeatherLocationsRow.get_text());
            if (parsed === null) {
                window.add_toast(new Adw.Toast({
                    title: 'Enter 2–8 distinct locations as Name|latitude|longitude',
                }));
                savedWeatherLocationsRow.set_text(formatWeatherLocations(config.weatherLocations));
                return;
            }
            config.weatherLocations = parsed;
            saveConfig();
            savedWeatherLocationsRow.set_text(formatWeatherLocations(parsed));
            window.add_toast(new Adw.Toast({
                title: parsed.length ? `${parsed.length} weather locations saved` : 'Saved locations cleared',
            }));
        });
        weatherGroup.add(savedWeatherLocationsRow);

        const popupShortcutGroup = new Adw.PreferencesGroup({
            title: 'Popup keyboard shortcuts',
            description: 'Optional global shortcuts. Enter a GTK accelerator such as <Super><Alt>V. Leave a field empty to clear it. Assignments must be unique within Material Panel.',
        });
        generalPage.add(popupShortcutGroup);
        config.popupShortcuts = normalizePopupShortcuts(config.popupShortcuts);
        const popupShortcutRows = new Map();
        const savePopupShortcut = (target, row) => {
            if (syncingExternal)
                return;
            const raw = row.get_text().trim();
            let accelerator = '';
            if (raw) {
                let parsed = null;
                try { parsed = Gtk.accelerator_parse(raw); } catch (e) {}
                let valid = true;
                let keyval = 0;
                let modifiers = 0;
                if (Array.isArray(parsed)) {
                    if (typeof parsed[0] === 'boolean') {
                        valid = parsed[0];
                        keyval = parsed[1] ?? 0;
                        modifiers = parsed[2] ?? 0;
                    } else {
                        keyval = parsed[0] ?? 0;
                        modifiers = parsed[1] ?? 0;
                    }
                }
                try {
                    valid = valid && keyval !== 0 && modifiers !== 0 &&
                        Gtk.accelerator_valid(keyval, modifiers);
                } catch (e) {
                    valid = false;
                }
                if (!valid) {
                    window.add_toast(new Adw.Toast({
                        title: 'Enter a valid shortcut with at least one modifier key',
                    }));
                    row.set_text(config.popupShortcuts[target.id] || '');
                    return;
                }
                try { accelerator = Gtk.accelerator_name(keyval, modifiers); } catch (e) {}
                if (!accelerator) {
                    window.add_toast(new Adw.Toast({title: 'This shortcut could not be parsed'}));
                    row.set_text(config.popupShortcuts[target.id] || '');
                    return;
                }
            }
            const next = normalizePopupShortcuts({
                ...config.popupShortcuts,
                [target.id]: accelerator,
            });
            const conflicts = findPopupShortcutConflicts(next);
            if (conflicts.length) {
                const labels = conflicts.flatMap(group => group.ids)
                    .map(id => POPUP_SHORTCUT_TARGETS.find(item => item.id === id)?.label || id);
                window.add_toast(new Adw.Toast({
                    title: `Shortcut is already assigned: ${[...new Set(labels)].join(', ')}`,
                }));
                row.set_text(config.popupShortcuts[target.id] || '');
                return;
            }
            config.popupShortcuts = next;
            saveConfig();
            row.set_text(accelerator);
            window.add_toast(new Adw.Toast({
                title: accelerator ? `${target.label} shortcut saved` : `${target.label} shortcut cleared`,
            }));
        };
        for (const target of POPUP_SHORTCUT_TARGETS) {
            const row = new Adw.EntryRow({
                title: `${target.label} shortcut`,
                text: config.popupShortcuts[target.id] || '',
                show_apply_button: true,
            });
            row.connect('apply', () => savePopupShortcut(target, row));
            popupShortcutGroup.add(row);
            popupShortcutRows.set(target.id, row);
        }
        const resetShortcutsRow = new Adw.ActionRow({
            title: 'Reset popup shortcuts',
            subtitle: 'Clear every assignment and return to the default (no global shortcuts).',
        });
        const resetShortcutsButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        resetShortcutsButton.connect('clicked', () => {
            config.popupShortcuts = {...DEFAULT_POPUP_SHORTCUTS};
            for (const row of popupShortcutRows.values())
                row.set_text('');
            saveConfig();
            window.add_toast(new Adw.Toast({title: 'Popup shortcuts reset'}));
        });
        resetShortcutsRow.add_suffix(resetShortcutsButton);
        resetShortcutsRow.activatable_widget = resetShortcutsButton;
        popupShortcutGroup.add(resetShortcutsRow);

        const networkGroup = new Adw.PreferencesGroup({
            title: 'Network speed',
            description: 'Choose how transfer rates are displayed in the network-speed popup and tooltip.',
        });
        generalPage.add(networkGroup);
        const networkSpeedUnits = ['bytes', 'bits'];
        const networkSpeedUnitRow = new Adw.ComboRow({
            title: 'Transfer rate units',
            model: Gtk.StringList.new(['Bytes per second (KB/s)', 'Bits per second (Mbit/s)']),
        });
        networkSpeedUnitRow.set_selected(config.networkSpeedUnit === 'bits' ? 1 : 0);
        networkSpeedUnitRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            config.networkSpeedUnit = networkSpeedUnits[networkSpeedUnitRow.get_selected()] ?? 'bytes';
            saveConfig();
        });
        networkGroup.add(networkSpeedUnitRow);

        const activityGroup = new Adw.PreferencesGroup({
            title: 'System statistics chip',
            description: 'Choose which live metrics appear in the compact Activity chip.',
        });
        generalPage.add(activityGroup);
        const metricOptions = [
            ['cpu', 'CPU usage'],
            ['memory', 'RAM usage'],
            ['temperature', 'CPU temperature'],
            ['gpu', 'GPU usage'],
            ['network', 'Network transfer rate'],
        ];
        if (!Array.isArray(config.activityChipMetrics))
            config.activityChipMetrics = ['cpu', 'temperature'];
        const metricSwitches = new Map();
        const saveMetricSelection = () => {
            if (syncingExternal) return;
            const selected = metricOptions.filter(([id]) => metricSwitches.get(id)?.active).map(([id]) => id);
            if (selected.length === 0) {
                config.activityChipMetrics = ['cpu'];
                syncingExternal = true;
                metricSwitches.get('cpu').active = true;
                syncingExternal = false;
            } else {
                config.activityChipMetrics = selected;
            }
            saveConfig();
        };
        for (const [id, title] of metricOptions) {
            const row = new Adw.ActionRow({title});
            const toggle = new Gtk.Switch({
                active: config.activityChipMetrics.includes(id),
                valign: Gtk.Align.CENTER,
            });
            toggle.connect('notify::active', saveMetricSelection);
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            activityGroup.add(row);
            metricSwitches.set(id, toggle);
        }
        const activityModeRow = new Adw.ComboRow({
            title: 'Display mode',
            model: Gtk.StringList.new(['Combined', 'Cycle through selected metrics']),
        });
        activityModeRow.set_selected(config.activityChipMode === 'cycle' ? 1 : 0);
        activityModeRow.connect('notify::selected', () => {
            if (syncingExternal) return;
            config.activityChipMode = activityModeRow.get_selected() === 1 ? 'cycle' : 'combined';
            saveConfig();
        });
        activityGroup.add(activityModeRow);

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

        const mediaVisibilityRow = new Adw.ActionRow({
            title: 'Hide Media when no player is active',
            subtitle: 'Remove the panel media chip until an MPRIS player appears.',
        });
        const mediaVisibilitySwitch = new Gtk.Switch({
            active: config.autoHideMedia === true,
            valign: Gtk.Align.CENTER,
        });
        mediaVisibilitySwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.autoHideMedia = mediaVisibilitySwitch.active;
            saveConfig();
        });
        mediaVisibilityRow.add_suffix(mediaVisibilitySwitch);
        mediaVisibilityRow.activatable_widget = mediaVisibilitySwitch;
        privacyGroup.add(mediaVisibilityRow);

        const bluetoothVisibilityRow = new Adw.ActionRow({
            title: 'Hide Bluetooth when no adapter is detected',
            subtitle: 'Keep the panel chip visible when BlueZ is unavailable or Bluetooth is blocked.',
        });
        const bluetoothVisibilitySwitch = new Gtk.Switch({
            active: config.autoHideBluetooth === true,
            valign: Gtk.Align.CENTER,
        });
        bluetoothVisibilitySwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.autoHideBluetooth = bluetoothVisibilitySwitch.active;
            saveConfig();
        });
        bluetoothVisibilityRow.add_suffix(bluetoothVisibilitySwitch);
        bluetoothVisibilityRow.activatable_widget = bluetoothVisibilitySwitch;
        privacyGroup.add(bluetoothVisibilityRow);

        const networkSpeedVisibilityRow = new Adw.ActionRow({
            title: 'Hide Network Speed while idle',
            subtitle: 'Hide the chip after 30 seconds without network traffic.',
        });
        const networkSpeedVisibilitySwitch = new Gtk.Switch({
            active: config.autoHideNetworkSpeed === true,
            valign: Gtk.Align.CENTER,
        });
        networkSpeedVisibilitySwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.autoHideNetworkSpeed = networkSpeedVisibilitySwitch.active;
            saveConfig();
        });
        networkSpeedVisibilityRow.add_suffix(networkSpeedVisibilitySwitch);
        networkSpeedVisibilityRow.activatable_widget = networkSpeedVisibilitySwitch;
        privacyGroup.add(networkSpeedVisibilityRow);

        const mediaVisualGroup = new Adw.PreferencesGroup({
            title: 'Media',
            description: 'Now-playing chip presentation.',
        });
        generalPage.add(mediaVisualGroup);
        const mediaVisualizerRow = new Adw.ActionRow({
            title: 'Show playback visualizer',
            subtitle: 'Animate a compact equalizer only while a player is playing and the chip is visible.',
        });
        const mediaVisualizerSwitch = new Gtk.Switch({
            active: config.mediaVisualizer === true,
            valign: Gtk.Align.CENTER,
        });
        mediaVisualizerSwitch.connect('notify::active', () => {
            if (syncingExternal) return;
            config.mediaVisualizer = mediaVisualizerSwitch.active;
            saveConfig();
        });
        mediaVisualizerRow.add_suffix(mediaVisualizerSwitch);
        mediaVisualizerRow.activatable_widget = mediaVisualizerSwitch;
        mediaVisualGroup.add(mediaVisualizerRow);





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

        const presetIoRow = new Adw.ActionRow({
            title: 'Import and export presets',
            subtitle: 'Share the active preset as a validated JSON file',
        });
        const exportPresetButton = new Gtk.Button({
            label: 'Export',
            valign: Gtk.Align.CENTER,
        });
        const importPresetButton = new Gtk.Button({
            label: 'Import',
            valign: Gtk.Align.CENTER,
        });

        exportPresetButton.connect('clicked', () => {
            let data;
            try {
                data = serializeLayoutPreset(config.activePreset, config.presets[config.activePreset]);
            } catch (e) {
                logError(e, 'material-panel prefs: preset export validation failed');
                window.add_toast(new Adw.Toast({title: 'Could not export this preset'}));
                return;
            }
            const chooser = new Gtk.FileChooserNative({
                title: 'Export layout preset',
                transient_for: window,
                action: Gtk.FileChooserAction.SAVE,
                accept_label: 'Export',
                cancel_label: 'Cancel',
            });
            chooser.set_current_name(`${config.activePreset}-material-panel-preset.json`);
            chooser.connect('response', (_dialog, response) => {
                if (response !== Gtk.ResponseType.ACCEPT) {
                    chooser.destroy();
                    return;
                }
                const file = chooser.get_file();
                chooser.destroy();
                if (!file)
                    return;
                file.replace_contents_async(
                    data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null, (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            window.add_toast(new Adw.Toast({title: 'Preset exported'}));
                        } catch (e) {
                            logError(e, 'material-panel prefs: preset export failed');
                            window.add_toast(new Adw.Toast({title: 'Preset export failed'}));
                        }
                    });
            });
            chooser.show();
        });

        importPresetButton.connect('clicked', () => {
            const chooser = new Gtk.FileChooserNative({
                title: 'Import layout preset',
                transient_for: window,
                action: Gtk.FileChooserAction.OPEN,
                accept_label: 'Import',
                cancel_label: 'Cancel',
            });
            chooser.connect('response', (_dialog, response) => {
                if (response !== Gtk.ResponseType.ACCEPT) {
                    chooser.destroy();
                    return;
                }
                const file = chooser.get_file();
                chooser.destroy();
                if (!file)
                    return;
                file.load_contents_async(null, (source, result) => {
                    try {
                        const [ok, contents] = source.load_contents_finish(result);
                        if (!ok)
                            throw new Error('Could not read the selected preset file');
                        const imported = parseLayoutPreset(new TextDecoder('utf-8').decode(contents));
                        const baseName = imported.name;
                        let name = baseName;
                        let suffix = 2;
                        while (config.presets[name]) {
                            name = `${baseName}-${suffix++}`;
                        }
                        config.presets[name] = imported.preset;
                        config.activePreset = name;
                        preset = config.presets[name];
                        saveConfig();
                        fillPresetModel();
                        refreshZoneEditor();
                        infoGroup.description = `Preset: ${config.activePreset}`;
                        window.add_toast(new Adw.Toast({title: `Imported preset: ${name}`}));
                    } catch (e) {
                        logError(e, 'material-panel prefs: preset import failed');
                        window.add_toast(new Adw.Toast({title: 'Invalid preset file'}));
                    }
                });
            });
            chooser.show();
        });

        presetIoRow.add_suffix(exportPresetButton);
        presetIoRow.add_suffix(importPresetButton);
        presetsGroup.add(presetIoRow);

        buildModulesPage({
            Adw, Gtk, GLib, config, saveConfig, window, addPreferencesPage,
            isSyncingExternal: () => syncingExternal,
        });

        const {refresh: refreshQuickLaunchPage} = buildQuickLaunchPage({
            Adw, Gtk, Gio, GLib, config, saveConfig, window, addPreferencesPage,
        });
        const {refresh: refreshClipboardHistoryPage} = buildClipboardHistoryPage({
            Adw, Gtk, GLib, config, saveConfig, window, addPreferencesPage,
        });

        buildTrayPage({
            Adw, Gtk, config, saveConfig, addPreferencesPage, networkSpeedUnitRow,
            isSyncingExternal: () => syncingExternal,
            setSyncingExternal: value => { syncingExternal = value; },
        });

        const {tileOrderRow} = buildAppearancePage({
            Adw, Gtk, config, saveConfig, addPreferencesPage,
            mediaVisibilitySwitch, bluetoothVisibilitySwitch,
            networkSpeedVisibilitySwitch, mediaVisualizerSwitch,
        });

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
                refreshQuickLaunchPage();
                refreshClipboardHistoryPage();
                baseline = JSON.parse(JSON.stringify(newConfig));
                // Keep the editable tile-order field in sync with external
                // config edits without discarding any pending local changes.
                tileOrderRow.set_text(formatQuickSettingsTileOrder(config.qsTiles));
                workspaceDisplayRow.set_selected(Math.max(
                    0, workspaceDisplayModes.indexOf(config.workspaceDisplay ?? 'auto')));
                workspaceScrollSwitch.active = config.workspaceScrollSwitch !== false;
                clockClickSwitch.active = config.clockClickCyclesFormat === true;
                for (const [id, toggle] of metricSwitches)
                    toggle.active = config.activityChipMetrics.includes(id);
                activityModeRow.set_selected(config.activityChipMode === 'cycle' ? 1 : 0);

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
