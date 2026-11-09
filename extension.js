import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import UPowerGlib from 'gi://UPowerGlib';
import St from 'gi://St';
import {debugLog} from './lib/debug.js';
import {closeMixerControl, setMixerControlReadyCallback} from './lib/audio.js';
import {clearPanelMenus} from './lib/popupDismiss.js';
import {watchReducedMotion} from './lib/shellCompat.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ConfigStore, resolveColorSource} from './lib/configStore.js';
import {stopKeepAwake} from './lib/keepAwake.js';
import {PanelBuilder} from './lib/panelBuilder.js';
import {StatusAreaBridge} from './lib/statusAreaBridge.js';
import {applyLayoutStyle} from './lib/layoutPresets.js';
import {ThemeManager} from './lib/theme.js';
import {classifyConfigChange, getChangedConfigKeys} from './lib/configChange.js';
import {clearSharedState} from './lib/sharedState.js';
import {clearDndFocusSession} from './lib/dndSession.js';
import {setProfileIdentityHidden, clearProfileIdentityState} from './lib/profileIdentityState.js';
import {setBluetoothAutoHide, clearBluetoothVisibilityState} from './lib/bluetoothVisibilityState.js';
import {setMediaAutoHide, clearMediaVisibilityState} from './lib/mediaVisibilityState.js';
import {setNetworkSpeedAutoHide, clearNetworkSpeedVisibilityState} from './lib/networkSpeedVisibilityState.js';
import {setNetworkSpeedUnit, clearNetworkSpeedUnit} from './lib/networkSpeedUnit.js';
import {setWorkspaceDisplayMode, setWorkspaceFilter, setWorkspaceScrollSwitch, clearWorkspaceState} from './lib/workspaceState.js';
import {setMediaVisualizerEnabled, clearMediaVisualizerState} from './lib/mediaVisualizerState.js';
import {setWeatherLocation, clearWeatherLocation, setWeatherLocations, clearWeatherLocations} from './lib/weatherLocationState.js';
import {clearControlCenterSummary} from './lib/controlCenterSummaryState.js';
import {setQuickSettingsSliderStyle, setQuickSettingsTileStyle, setQuickSettingsTiles, setQuickSettingsFavorites, clearQuickSettingsState} from './lib/quickSettingsState.js';
import {setLayoutStyle, clearLayoutStyle} from './lib/layoutStyleState.js';
import {setQuickLaunchEntries, clearQuickLaunchEntries} from './lib/quickLaunchState.js';
import {selectBatteryDevice} from './lib/batteryDevice.js';
import {ClipboardHistoryController} from './lib/clipboardHistoryController.js';
import {ClipboardHistoryFileStore} from './lib/clipboardHistoryStore.js';
import {setClipboardHistoryController} from './modules/clipboardHistory.js';
import {normalizePopupShortcuts, findPopupShortcutConflicts, POPUP_SHORTCUT_TARGETS} from './lib/popupShortcuts.js';

function scaleOf(c) {
    const s = Number(c?.panelSize?.scale);
    return Number.isFinite(s) ? s : 1.0;
}


export default class MaterialPanelExtension extends Extension {
    enable() {
        this._lifecycleGeneration = (this._lifecycleGeneration ?? 0) + 1;
        const generation = this._lifecycleGeneration;
        this._configStore = new ConfigStore();
        this._config = null;

        this._configStore.loadAsync().then(config => {
            if (generation !== this._lifecycleGeneration || !this._configStore)
                return;
            this._initialize(config);
        }).catch(error => {
            if (generation !== this._lifecycleGeneration)
                return;
            logError(error, 'material-panel: asynchronous startup config load failed');
        });
    }

    _initialize(config) {
        this._config = config;
        // If Gvc is unavailable during startup, retry later and rebuild the
        // panel once the shared mixer control becomes available.
        setMixerControlReadyCallback(() => this._schedulePanelRebuild('audio-recovered'));
        setWeatherLocation(this._config.weatherLocation);
        setWeatherLocations(this._config.weatherLocations);
        setQuickLaunchEntries(this._config.quickLaunch);
        this._syncClipboardHistory(this._config);
        this._clipboardHistoryClearToken = this._config.clipboardHistoryClearToken ?? '';
        this._sizeDebounceId = 0;
        this._reducedMotionCleanup = watchReducedMotion();

        this._bridge = new StatusAreaBridge();
        this._bridge.enable();

        // Tray icons: use system AppIndicator / BetterTrayIcons.
        // We only host appindicator-* roles on our bar (statusAreaBridge + SNI strip).

        this._registeredPopupKeybindings = new Set();
        this._keybindingSettings = null;
        this._builder = new PanelBuilder(this._bridge, this.path);
        this._watchContextVisibility();
        this._theme = new ThemeManager(this.path);

        this._applyTheme({rebuildPanel: true});

        this._panelWasVisible = Main.panel.visible;
        Main.panel.hide();

        this._configStore.watch(incomingConfig => {
            const prev = this._config && typeof this._config === 'object' ? this._config : {};
            const newConfig = incomingConfig && typeof incomingConfig === 'object'
                ? incomingConfig
                : {};
            this._config = newConfig;
            setProfileIdentityHidden(newConfig.hideProfileIdentity === true);
            setWeatherLocation(newConfig.weatherLocation);
            setWeatherLocations(newConfig.weatherLocations);
            setQuickLaunchEntries(newConfig.quickLaunch);
            this._syncClipboardHistory(newConfig);
            const clearToken = newConfig.clipboardHistoryClearToken ?? '';
            if (clearToken !== this._clipboardHistoryClearToken) {
                this._clipboardHistoryClearToken = clearToken;
                const clearOperation = this._clipboardHistoryController?.enabled
                    ? this._clipboardHistoryController.clear()
                    : new ClipboardHistoryFileStore().clear();
                clearOperation.catch(() => {
                    Main.notifyError('Clipboard history could not be cleared',
                        'Deletion could not be confirmed. Check storage permissions and try again.');
                });
            }

            // Classification must never strand the watcher. Unknown or malformed
            // shapes fall back to a full rebuild and a tray placement refresh.
            let changedKeys = null;
            let kind = 'unknown';
            let classificationFailed = false;
            try {
                changedKeys = getChangedConfigKeys(prev, newConfig);
                kind = classifyConfigChange(prev, newConfig, changedKeys);
            } catch (e) {
                classificationFailed = true;
                changedKeys = null;
                kind = 'unknown';
                logError(e, 'material-panel: config change classification failed; using full rebuild');
            }
            const trayChanged = classificationFailed || !changedKeys || changedKeys.some(key =>
                ['trayAllHidden', 'foreignRoleZones', 'hiddenForeignRoles'].includes(key));
            if (trayChanged) {
                const placements = newConfig.foreignRoleZones ?? {};
                debugLog(`tray placements updated (${Object.keys(placements).length} configured)`);
                if (GLib.getenv('MATERIAL_PANEL_DEBUG_TRAY') === '1')
                    log(`material-panel: tray placement details ${JSON.stringify(placements)}`);
                this._applyTrayOnly();
            }

            try {
                setQuickSettingsSliderStyle(newConfig.sliderStyle);
                setQuickSettingsTileStyle(newConfig.qsTileStyle);
                setQuickSettingsTiles(newConfig.qsTiles);
                setQuickSettingsFavorites(newConfig.qsFavorites);
                setMediaAutoHide(newConfig.autoHideMedia === true);
                setBluetoothAutoHide(newConfig.autoHideBluetooth === true);
                setNetworkSpeedAutoHide(newConfig.autoHideNetworkSpeed === true);
                setMediaVisualizerEnabled(newConfig.mediaVisualizer);
                setWorkspaceDisplayMode(newConfig.workspaceDisplay);
                setWorkspaceFilter(newConfig.workspaceFilter);
                setWorkspaceScrollSwitch(newConfig.workspaceScrollSwitch);
                setNetworkSpeedUnit(newConfig.networkSpeedUnit);
            } catch (e) {}

            debugLog(`config change classified as "${kind}"`);

            switch (kind) {
            case 'tray':
                return;
            case 'panelSize': {
                const scaleCh = Math.abs(scaleOf(prev) - scaleOf(newConfig)) > 0.001;
                // Only scale needs destroy/recreate of panel modules (icon sizes baked in).
                // Gaps + opacity are CSS / geometry — do NOT tear down our chips/QS.
                try {
                    const panelSize = {...(this._config.panelSize ?? {}), zoneScale: this._config.zoneScale};
                    // A scale change schedules _schedulePanelSizeUpdate(), which
                    // applies the theme and chip gap itself. Avoid doing that work
                    // twice while still syncing geometry immediately.
                    if (!scaleCh) {
                        const colorSource = resolveColorSource(this._config.colorSource);
                        this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
                            if (!applied)
                                return;
                            this._builder?._applyChipGap?.(this._config);
                            this._builder?._syncGeometry?.();
                            debugLog(`panelSize applied scale=${panelSize.scale} chipGap=${panelSize.chipGap} popupOpacity=${panelSize.popupOpacity} rebuild=false`);
                        });
                    } else {
                        this._builder?._syncGeometry?.();
                    }
                } catch (e) {
                    logError(e, 'material-panel: panelSize apply');
                }
                if (scaleCh)
                    this._schedulePanelSizeUpdate(true);
                return;
            }
            case 'clock':
                // modules/clock.js has its own ConfigStore.watch — no rebuild
                return;
            case 'moduleSetting':
                // Module-specific presentation settings are consumed live by
                // their existing monitor callbacks; do not rebuild the panel.
                if (changedKeys?.includes('popupShortcuts'))
                    this._syncPopupShortcuts(newConfig);
                return;
            case 'color':
                this._applyTheme({rebuildPanel: true}); // debounced inside _schedulePanelRebuild
                return;
            default:
                this._removePopupKeybindings();
                try {
                    this._applyTheme({rebuildPanel: true});
                } catch (e) {
                    logError(e, 'material-panel: fallback config rebuild');
                    try { this._schedulePanelRebuild('config-classification-fallback'); } catch (e2) {}
                }
            }
        });
    }

    _watchContextVisibility() {
        this._visibilitySignalConnections = [];
        this._visibilityFocusWindow = null;
        this._visibilityFocusSignalId = 0;
        this._visibilityDndSettings = null;
        const refresh = () => this._schedulePanelRebuild('context-visibility');

        try {
            const monitor = Gio.NetworkMonitor.get_default();
            const syncNetwork = () => {
                this._builder?.setNetworkOffline(!monitor.network_available);
                refresh();
            };
            syncNetwork();
            const id = monitor.connect('network-changed', syncNetwork);
            this._visibilitySignalConnections.push([monitor, id]);
        } catch (e) {
            logError(e, 'material-panel: could not watch network availability');
        }

        this._visibilityBatteryClient = null;
        this._visibilityBatteryDevice = null;
        this._visibilityBatteryDeviceSignalIds = [];
        try {
            const client = UPowerGlib.Client.new();
            this._visibilityBatteryClient = client;
            const syncBattery = () => {
                let selected = null;
                try {
                    selected = selectBatteryDevice(
                        client.get_devices?.() || [],
                        client.get_display_device?.(),
                        UPowerGlib.DeviceKind.BATTERY);
                } catch (error) {}
                const device = selected?.device ?? null;
                if (device !== this._visibilityBatteryDevice) {
                    if (this._visibilityBatteryDevice) {
                        for (const signalId of this._visibilityBatteryDeviceSignalIds) {
                            try { this._visibilityBatteryDevice.disconnect(signalId); } catch (error) {}
                        }
                    }
                    this._visibilityBatteryDevice = device;
                    this._visibilityBatteryDeviceSignalIds = [];
                    if (device) {
                        for (const signal of ['notify::state', 'notify::percentage']) {
                            try {
                                const signalId = device.connect(signal, syncBattery);
                                if (signalId)
                                    this._visibilityBatteryDeviceSignalIds.push(signalId);
                            } catch (error) {}
                        }
                    }
                }
                let onBattery = null;
                let percentage = null;
                if (device) {
                    try {
                        const state = device.state;
                        if ([UPowerGlib.DeviceState.DISCHARGING, UPowerGlib.DeviceState.PENDING_DISCHARGE,
                            UPowerGlib.DeviceState.EMPTY].includes(state))
                            onBattery = true;
                        else if ([UPowerGlib.DeviceState.CHARGING, UPowerGlib.DeviceState.PENDING_CHARGE,
                            UPowerGlib.DeviceState.FULLY_CHARGED].includes(state))
                            onBattery = false;
                    } catch (error) {}
                    try {
                        const value = Number(device.percentage);
                        if (Number.isFinite(value) && value >= 0 && value <= 100)
                            percentage = value;
                    } catch (error) {}
                }
                this._builder?.setBatteryContext({onBattery, percentage});
                refresh();
            };
            syncBattery();
            const addedId = client.connect('device-added', syncBattery);
            const removedId = client.connect('device-removed', syncBattery);
            this._visibilitySignalConnections.push([client, addedId], [client, removedId]);
        } catch (error) {
            logError(error, 'material-panel: could not watch battery context');
        }

        try {
            this._visibilityDndSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.notifications',
            });
            const syncDnd = () => {
                const active = !this._visibilityDndSettings.get_boolean('show-banners');
                this._builder?.setDoNotDisturbActive(active);
                refresh();
            };
            syncDnd();
            const id = this._visibilityDndSettings.connect('changed::show-banners', syncDnd);
            this._visibilitySignalConnections.push([this._visibilityDndSettings, id]);
        } catch (e) {
            logError(e, 'material-panel: could not watch Do Not Disturb state');
        }

        try {
            for (const signal of ['showing', 'hiding']) {
                const id = Main.overview.connect(signal, refresh);
                this._visibilitySignalConnections.push([Main.overview, id]);
            }
        } catch (e) {
            logError(e, 'material-panel: could not watch Overview visibility');
        }

        const connectFocusedWindow = () => {
            if (this._visibilityFocusWindow && this._visibilityFocusSignalId) {
                try { this._visibilityFocusWindow.disconnect(this._visibilityFocusSignalId); } catch (e) {}
            }
            this._visibilityFocusWindow = null;
            this._visibilityFocusSignalId = 0;
            try {
                const window = global.display.focus_window;
                if (!window)
                    return;
                this._visibilityFocusWindow = window;
                this._visibilityFocusSignalId = window.connect('notify::fullscreen', refresh);
            } catch (e) {}
        };

        try {
            const id = global.display.connect('notify::focus-window', () => {
                connectFocusedWindow();
                refresh();
            });
            this._visibilitySignalConnections.push([global.display, id]);
        } catch (e) {
            logError(e, 'material-panel: could not watch focused window changes');
        }
        connectFocusedWindow();
    }

    _unwatchContextVisibility() {
        for (const [object, id] of this._visibilitySignalConnections ?? []) {
            try { object.disconnect(id); } catch (e) {}
        }
        this._visibilitySignalConnections = [];
        if (this._visibilityFocusWindow && this._visibilityFocusSignalId) {
            try { this._visibilityFocusWindow.disconnect(this._visibilityFocusSignalId); } catch (e) {}
        }
        this._visibilityFocusWindow = null;
        this._visibilityFocusSignalId = 0;
        this._visibilityDndSettings = null;
        if (this._visibilityBatteryDevice) {
            for (const signalId of this._visibilityBatteryDeviceSignalIds ?? []) {
                try { this._visibilityBatteryDevice.disconnect(signalId); } catch (e) {}
            }
        }
        this._visibilityBatteryDevice = null;
        this._visibilityBatteryDeviceSignalIds = [];
        this._visibilityBatteryClient = null;
        this._builder?.setDoNotDisturbActive(false);
        this._builder?.setNetworkOffline(false);
        this._builder?.setBatteryContext({onBattery: null, percentage: null});
    }

    _removePopupKeybindings(clearSettings = false) {
        for (const key of this._registeredPopupKeybindings ?? []) {
            try { Main.wm.removeKeybinding(key); } catch (e) {}
        }
        this._registeredPopupKeybindings?.clear();
        if (clearSettings && this._keybindingSettings) {
            for (const target of POPUP_SHORTCUT_TARGETS) {
                try { this._keybindingSettings.set_strv(target.key, []); } catch (e) {}
            }
        }
    }

    _syncPopupShortcuts(config) {
        this._removePopupKeybindings();
        if (!this._keybindingSettings) {
            try { this._keybindingSettings = this.getSettings(); } catch (e) {
                logError(e, 'material-panel: popup shortcut settings unavailable');
                return;
            }
        }
        const settings = this._keybindingSettings;
        if (!settings)
            return;
        const shortcuts = normalizePopupShortcuts(config?.popupShortcuts);
        const conflicts = findPopupShortcutConflicts(shortcuts);
        const conflictedIds = new Set(conflicts.flatMap(group => group.ids));
        for (const target of POPUP_SHORTCUT_TARGETS) {
            try {
                const accelerator = shortcuts[target.id];
                settings.set_strv(target.key, accelerator ? [accelerator] : []);
            } catch (e) {
                logError(e, `material-panel: could not store shortcut for ${target.label}`);
            }
        }
        for (const target of POPUP_SHORTCUT_TARGETS) {
            const accelerator = shortcuts[target.id];
            if (!accelerator)
                continue;
            if (conflictedIds.has(target.id)) {
                debugLog(`popup shortcut skipped for ${target.label}: duplicate assignment`);
                continue;
            }
            if (!this._builder?.hasModule(target.id)) {
                debugLog(`popup shortcut not registered for unavailable module ${target.label}`);
                continue;
            }
            try {
                const registered = Main.wm.addKeybinding(
                    target.key,
                    settings,
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL,
                    () => {
                        if (!this._builder?.activateModule(target.id))
                            debugLog(`popup shortcut target unavailable: ${target.label}`);
                    },
                );
                if (registered === false) {
                    debugLog(`popup shortcut not registered (GNOME conflict or unavailable): ${target.label}`);
                    Main.notifyError('Shortcut unavailable',
                        `${target.label} shortcut could not be registered. GNOME or another extension may already use it.`);
                    continue;
                }
                this._registeredPopupKeybindings.add(target.key);
            } catch (e) {
                logError(e, `material-panel: popup shortcut registration failed for ${target.label}`);
            }
        }
    }

    _syncClipboardHistory(config) {
        const enabled = config?.clipboardHistoryEnabled === true;
        const paused = config?.clipboardHistoryPaused === true;

        if (!enabled) {
            const previous = this._clipboardHistoryController;
            this._clipboardHistoryController = null;
            setClipboardHistoryController(null, null);
            if (previous) {
                previous.disable().catch(() => {
                    Main.notifyError('Clipboard history could not be erased',
                        'Recording has stopped, but saved clipboard data could not be deleted. Check storage permissions.');
                });
            }
            return;
        }

        if (!this._clipboardHistoryController) {
            const controller = new ClipboardHistoryController({
                selection: global.display.get_selection(),
                clipboard: St.Clipboard.get_default(),
                store: new ClipboardHistoryFileStore(),
                clipboardType: St.ClipboardType.CLIPBOARD,
                selectionType: Meta.SelectionType.SELECTION_CLIPBOARD,
                idFactory: () => GLib.uuid_string_random(),
                maxEntries: config.clipboardHistoryMaxEntries ?? 50,
                maxAgeDays: config.clipboardHistoryMaxAgeDays ?? 7,
            });
            this._clipboardHistoryController = controller;
            controller.setOnError(message => Main.notifyError('Clipboard history', message));
            this._clipboardHistoryPaused = paused;
            this._clipboardHistoryLimits = {
                maxEntries: config.clipboardHistoryMaxEntries ?? 50,
                maxAgeDays: config.clipboardHistoryMaxAgeDays ?? 7,
            };
            setClipboardHistoryController(controller, nextPaused => {
                const store = this._configStore;
                if (!store)
                    return;
                store.loadAsync().then(latest => store.saveAsync({
                    ...latest,
                    clipboardHistoryPaused: Boolean(nextPaused),
                })).catch(() => {});
            });
            controller.enable({paused}).catch(() => {
                controller.destroy();
                if (this._clipboardHistoryController === controller) {
                    this._clipboardHistoryController = null;
                    setClipboardHistoryController(null, null);
                }
                Main.notifyError('Clipboard history could not be started',
                    'Material Panel could not open its private local history store. No clipboard text was recorded.');
            });
            return;
        }

        const maxEntries = config.clipboardHistoryMaxEntries ?? 50;
        const maxAgeDays = config.clipboardHistoryMaxAgeDays ?? 7;
        if (this._clipboardHistoryLimits &&
            (maxEntries !== this._clipboardHistoryLimits.maxEntries ||
             maxAgeDays !== this._clipboardHistoryLimits.maxAgeDays)) {
            this._clipboardHistoryLimits = {maxEntries, maxAgeDays};
            this._clipboardHistoryController.setLimits({maxEntries, maxAgeDays}).catch(() => {
                Main.notifyError('Clipboard history limits could not be applied',
                    'The updated limits remain active in this session, but the reduced history could not be saved. Check storage permissions.');
            });
        }

        if (paused !== this._clipboardHistoryPaused) {
            this._clipboardHistoryPaused = paused;
            if (paused)
                this._clipboardHistoryController.pause();
            else
                this._clipboardHistoryController.resume();
        }
    }

    _applyTrayOnly() {
        try {
            // Only foreignRoleZones + trayAllHidden — never bulk hiddenForeignRoles
            this._bridge.setForeignPlacements(
                this._config.foreignRoleZones ?? {},
                [],
                {allHidden: !!this._config.trayAllHidden});
        } catch (e) {
            logError(e, 'material-panel: tray-only update failed');
        }
    }

    _schedulePanelSizeUpdate(scaleChanged) {
        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
            this._trayRescanIds = [];
        }
        try {
            const panelSize = {...(this._config.panelSize ?? {}), zoneScale: this._config.zoneScale};
            const colorSource = resolveColorSource(this._config.colorSource);
            this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
                if (!applied)
                    return;
                // Chip gap must update live without requiring scale change.
                try { this._builder?._applyChipGap?.(this._config); } catch (e) {}
                if (!scaleChanged)
                    return;
                this._sizeDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    this._sizeDebounceId = 0;
                    this._schedulePanelRebuild('panelSize');
                    return GLib.SOURCE_REMOVE;
                });
            });
        } catch (e) {
            logError(e, 'material-panel: theme apply on size change');
        }
    }

    _applyTheme({rebuildPanel = true} = {}) {
        const panelSize = {...(this._config.panelSize ?? {}), zoneScale: this._config.zoneScale};
        const colorSource = resolveColorSource(this._config.colorSource);
        try {
            setLayoutStyle(this._config.layoutStyle);
            setQuickSettingsSliderStyle(this._config.sliderStyle);
            setQuickSettingsTileStyle(this._config.qsTileStyle);
            setQuickSettingsTiles(this._config.qsTiles);
            setQuickSettingsFavorites(this._config.qsFavorites);
            setMediaAutoHide(this._config.autoHideMedia === true);
            setBluetoothAutoHide(this._config.autoHideBluetooth === true);
            setNetworkSpeedAutoHide(this._config.autoHideNetworkSpeed === true);
            setMediaVisualizerEnabled(this._config.mediaVisualizer);
            setWorkspaceDisplayMode(this._config.workspaceDisplay);
            setWorkspaceFilter(this._config.workspaceFilter);
            setWorkspaceScrollSwitch(this._config.workspaceScrollSwitch);
            setNetworkSpeedUnit(this._config.networkSpeedUnit);
            setProfileIdentityHidden(this._config.hideProfileIdentity === true);
            setQuickLaunchEntries(this._config.quickLaunch);
        } catch (e) {}
        try {
            // Only adjust in-memory layout placement — never save here (save → watch → rebuild loop)
            if (this._config.layoutStyle === 'end4')
                applyLayoutStyle(this._config, 'end4');
        } catch (e) {}
        this._theme.apply(colorSource, panelSize, this._config.layoutStyle ?? 'default', applied => {
            if (!applied)
                return;
            if (rebuildPanel)
                this._schedulePanelRebuild('theme');
            else
                this._applyTrayOnly();
        });

        if (colorSource) {
            this._theme.watch(colorSource, () => {
                // CSS updates immediately; modules bake primary into FileIcons at
                // build time — need a debounced rebuild so icons follow the palette.
                debugLog('matugen watch — theme + debounced rebuild for icons');
                try {
                    const freshSize = {...(this._config.panelSize ?? {}), zoneScale: this._config.zoneScale};
                    const freshSource = resolveColorSource(this._config.colorSource);
                    this._theme.apply(freshSource, freshSize, this._config.layoutStyle ?? 'default', applied => {
                        if (applied)
                            this._schedulePanelRebuild('matugen');
                    });
                } catch (e) {
                    logError(e, 'material-panel: matugen theme apply');
                }
            });
        } else {
            // Do not keep watching a palette file after switching to fixed colors.
            this._theme.unwatch();
        }
    }

    /** Coalesce rapid rebuilds (extension toggles / prefs storms) into one render. */
    _schedulePanelRebuild(reason = '') {
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        debugLog(`panel rebuild scheduled (${reason})`);
        this._rebuildDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            this._rebuildDebounceId = 0;
            try {
                this._builder.render(this._config);
                this._syncPopupShortcuts(this._config);
                this._applyTrayOnly();
                this._scheduleTrayRescan();
            } catch (e) {
                logError(e, 'material-panel: debounced panel rebuild failed');
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /** AppIndicator / foreign icons often appear after our chrome is up. */
    _scheduleTrayRescan() {
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
        }
        this._trayRescanIds = [];
        // StatusAreaBridge observes addToStatusArea and attaches new indicators
        // immediately. Keep one bounded retry for indicators registered outside
        // that path instead of waking the Shell three times after every rebuild.
        const ms = 900;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._trayRescanIds = (this._trayRescanIds ?? []).filter(timerId => timerId !== id);
            try {
                this._bridge?.reattachAll?.();
                debugLog(`tray fallback rescan +${ms}ms`);
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
        this._trayRescanIds.push(id);
    }

    disable() {
        this._unwatchContextVisibility();
        this._removePopupKeybindings(true);
        this._keybindingSettings = null;
        // Release the session inhibitor when the extension is disabled.
        stopKeepAwake();
        setMixerControlReadyCallback(null);
        // Invalidate any config load still in flight before releasing services.
        this._lifecycleGeneration = (this._lifecycleGeneration ?? 0) + 1;
        try { this._reducedMotionCleanup?.(); } catch (e) {}
        this._reducedMotionCleanup = null;

        if (this._sizeDebounceId) {
            GLib.source_remove(this._sizeDebounceId);
            this._sizeDebounceId = 0;
        }
        if (this._rebuildDebounceId) {
            try { GLib.source_remove(this._rebuildDebounceId); } catch (e) {}
            this._rebuildDebounceId = 0;
        }
        if (this._trayRescanIds) {
            for (const id of this._trayRescanIds) {
                try { GLib.source_remove(id); } catch (e) {}
            }
            this._trayRescanIds = [];
        }
        this._clipboardHistoryController?.destroy();
        this._clipboardHistoryController = null;
        this._clipboardHistoryPaused = false;
        this._clipboardHistoryLimits = null;
        setClipboardHistoryController(null, null);
        this._configStore?.unwatch();
        this._configStore = null;

        this._theme?.destroy();
        this._theme = null;

        // Restore tray icons to stock panel BEFORE destroying our chrome
        // (destroy used to run first and left indicators orphaned / missing).
        try {
            this._bridge.disable();
        } catch (e) {
            logError(e, 'material-panel: bridge.disable');
        }
        this._bridge = null;

        try { closeMixerControl(); } catch (e) {
            logError(e, 'material-panel: closeMixerControl');
        }
        try { clearPanelMenus(); } catch (e) {}

        try {
            this._builder?.destroy();
        } catch (e) {
            logError(e, 'material-panel: builder.destroy');
        }
        this._builder = null;
        clearDndFocusSession();

        try {
            if (this._panelWasVisible !== false)
                Main.panel.show();
        } catch (e) {
            try { Main.panel.show(); } catch (e2) {}
        }

        // Remove shared globals so they cannot leak across extension lifecycles.
        clearSharedState();
        clearProfileIdentityState();
        clearBluetoothVisibilityState();
        clearMediaVisibilityState();
        clearNetworkSpeedVisibilityState();
        clearNetworkSpeedUnit();
        clearWorkspaceState();
        clearMediaVisualizerState();
        clearWeatherLocation();
        clearWeatherLocations();
        clearControlCenterSummary();
        clearQuickSettingsState();
        clearQuickLaunchEntries();
        clearLayoutStyle();

        this._config = null;
    }
}
