import {readStatusRolesFile} from '../lib/statusRolesFile.js';
import {ZONE_NAMES, roleFromExt, syncExtensionZone, friendlyRoleName} from './moduleCatalog.js';

/** Build placement controls for third-party status-area icons. */
export function buildTrayPage({Adw, Gtk, config, saveConfig, addPreferencesPage, networkSpeedUnitRow, isSyncingExternal, setSyncingExternal}) {
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
            setSyncingExternal(true);
            networkSpeedUnitRow.set_selected(config.networkSpeedUnit === 'bits' ? 1 : 0);
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
                    if (isSyncingExternal() || config.trayAllHidden)
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
            setSyncingExternal(false);
    
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
        if (isSyncingExternal()) return;
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
}
