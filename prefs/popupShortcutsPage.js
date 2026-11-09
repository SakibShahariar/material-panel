import {
    DEFAULT_POPUP_SHORTCUTS,
    findPopupShortcutConflicts,
    normalizePopupShortcuts,
    POPUP_SHORTCUT_TARGETS,
} from '../lib/popupShortcuts.js';

export function buildPopupShortcutsPage({
    Adw, Gtk, config, saveConfig, window, groupParent,
    isSyncingExternal, setSyncingExternal,
}) {
        const popupShortcutGroup = new Adw.PreferencesGroup({
            title: 'Popup keyboard shortcuts',
            description: 'Optional global shortcuts. Enter a GTK accelerator such as <Super><Alt>V. Leave a field empty to clear it. Assignments must be unique within Material Panel; GNOME-reserved shortcuts are rejected rather than overridden.',
        });
        groupParent.add(popupShortcutGroup);
        config.popupShortcuts = normalizePopupShortcuts(config.popupShortcuts);
        const popupShortcutRows = new Map();
        const savePopupShortcut = (target, row) => {
            if (isSyncingExternal())
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


    const refresh = () => {
        const wasSyncing = isSyncingExternal();
        setSyncingExternal(true);
        config.popupShortcuts = normalizePopupShortcuts(config.popupShortcuts);
        for (const target of POPUP_SHORTCUT_TARGETS) {
            const row = popupShortcutRows.get(target.id);
            if (row)
                row.set_text(config.popupShortcuts[target.id] || '');
        }
        setSyncingExternal(wasSyncing);
    };
    return {refresh};
}
