import {getOptionalModuleDependencies} from '../lib/moduleAvailability.js';
// Import module IDs rather than the registry: preferences run outside GNOME Shell.
import {hasBuiltin} from '../lib/moduleIds.js';
import {ALL_MODULES, EXT_PREFIX, ZONE_NAMES} from './moduleCatalog.js';

/** Build module visibility and per-zone ordering controls. */
export function buildModulesPage({Adw, Gtk, GLib, config, saveConfig, window, addPreferencesPage, isSyncingExternal}) {
    let preset = config.presets[config.activePreset];
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
        description: 'Requirement hints are informational, not live availability checks. Hardware, running services, and permissions can affect whether a module can provide data.',
    });
    modulesPage.add(visibilityGroup);
    
    const createModuleToggle = (module) => {
        const activePreset = config.presets?.[config.activePreset];
        const zones = activePreset?.zones ?? {};
        const isPlaced = ZONE_NAMES.some(zone => (zones[zone] ?? []).includes(module.id));
        const isHidden = config.hiddenModules.includes(module.id) || !isPlaced;
        const optionalDependencies = getOptionalModuleDependencies(
            module.id,
            program => Boolean(GLib.find_program_in_path(program)),
        );
        const dependencyHint = optionalDependencies.map(dependency =>
            dependency.available
                ? `${dependency.label}: available`
                : `${dependency.label} unavailable (${dependency.program} not found). ${dependency.installHint}`,
        ).join(' • ');
        const row = new Adw.ActionRow({
            title: module.name,
            subtitle: [
                `${hasBuiltin(module.id) ? 'Built-in' : 'External'} • Default zone: ${module.zone} • ${module.requirement}`,
                dependencyHint,
            ].filter(Boolean).join(' • '),
        });
    
        const toggle = new Gtk.Switch({
            active: !isHidden,
            valign: Gtk.Align.CENTER,
        });
        toggle.connect('notify::active', () => {
            if (isSyncingExternal()) return;
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
    

    // Status indicators are informational; their existing modules retain control ownership.
    const statusPreferencesGroup = new Adw.PreferencesGroup({
        title: 'System Status Indicators',
        description: 'Choose which supported states appear in the optional aggregate panel module. Inactive states are hidden by default; these indicators never toggle system settings.',
    });
    modulesPage.add(statusPreferencesGroup);
    if (!config.statusIndicatorPreferences || typeof config.statusIndicatorPreferences !== 'object')
        config.statusIndicatorPreferences = {
            dnd: {enabled: true, showInactive: false},
            nightlight: {enabled: true, showInactive: false},
        };
    for (const [id, title] of [['dnd', 'Do Not Disturb'], ['nightlight', 'Night Light']]) {
        if (!config.statusIndicatorPreferences[id])
            config.statusIndicatorPreferences[id] = {enabled: true, showInactive: false};
        const options = config.statusIndicatorPreferences[id];
        const enabledRow = new Adw.ActionRow({
            title,
            subtitle: 'Include this state in System Status Indicators',
        });
        const enabledSwitch = new Gtk.Switch({
            active: options.enabled !== false,
            valign: Gtk.Align.CENTER,
        });
        enabledSwitch.connect('notify::active', () => {
            if (isSyncingExternal())
                return;
            options.enabled = enabledSwitch.active;
            saveConfig();
        });
        enabledRow.add_suffix(enabledSwitch);
        enabledRow.activatable_widget = enabledSwitch;
        statusPreferencesGroup.add(enabledRow);

        const inactiveRow = new Adw.ActionRow({
            title: `Show ${title} while inactive`,
            subtitle: 'Display a muted icon even when this state is off',
        });
        const inactiveSwitch = new Gtk.Switch({
            active: options.showInactive === true,
            valign: Gtk.Align.CENTER,
            sensitive: options.enabled !== false,
        });
        enabledSwitch.connect('notify::active', () => {
            inactiveSwitch.sensitive = enabledSwitch.active;
        });
        inactiveSwitch.connect('notify::active', () => {
            if (isSyncingExternal())
                return;
            options.showInactive = inactiveSwitch.active;
            saveConfig();
        });
        inactiveRow.add_suffix(inactiveSwitch);
        inactiveRow.activatable_widget = inactiveSwitch;
        statusPreferencesGroup.add(inactiveRow);
    }

    // Focus Mode selection is independent from normal module visibility.
    const focusGroup = new Adw.PreferencesGroup({
        title: 'Focus Mode',
        description: 'Choose modules to hide temporarily while Focus Mode is on. This selection does not change Module Visibility or context-aware visibility rules. Nothing is selected by default.',
    });
    modulesPage.add(focusGroup);
    if (!Array.isArray(config.focusModeModules))
        config.focusModeModules = [];
    for (const module of ALL_MODULES) {
        const row = new Adw.ActionRow({
            title: module.name,
            subtitle: 'Hide this module only while Focus Mode is enabled',
        });
        const toggle = new Gtk.Switch({
            active: config.focusModeModules.includes(module.id),
            valign: Gtk.Align.CENTER,
        });
        toggle.connect('notify::active', () => {
            if (isSyncingExternal())
                return;
            const selected = config.focusModeModules;
            const index = selected.indexOf(module.id);
            if (toggle.active && index < 0)
                selected.push(module.id);
            else if (!toggle.active && index >= 0)
                selected.splice(index, 1);
            saveConfig();
        });
        row.add_suffix(toggle);
        row.activatable_widget = toggle;
        focusGroup.add(row);
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
}
