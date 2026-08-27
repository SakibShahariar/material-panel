import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ConfigStore} from './lib/configStore.js';

const ZONE_NAMES = ['left', 'center', 'right'];

export default class MaterialPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const store = new ConfigStore();
        const config = store.load();
        const preset = config.presets[config.activePreset];

        const page = new Adw.PreferencesPage({
            title: 'Layout',
            icon_name: 'view-grid-symbolic',
        });
        window.add(page);

        const infoGroup = new Adw.PreferencesGroup({
            description: `Editing preset "${config.activePreset}". Changes apply live — no need to restart the shell.\nConfig file: ${store.path}`,
        });
        page.add(infoGroup);

        // Whitelist only the current keys - old configs may still carry
        // iconScale/pillHeight/gap until configStore's next load rewrites them.
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

        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Panel Size',
            description: 'Doesn\'t affect the quick settings popup, which is a separate surface.',
        });
        page.add(sizeGroup);

        let saveDebounceId = null;
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
            const valueLabel = new Gtk.Label({
                label: formatValue(adjustment.value),
                width_request: 52,
                xalign: 1,
                valign: Gtk.Align.CENTER,
                css_classes: ['dim-label', 'monospace'],
            });
            const updateValueLabel = () => {
                valueLabel.label = formatValue(adjustment.value);
            };
            scale.connect('value-changed', () => {
                panelSize[key] = adjustment.value;
                updateValueLabel();
                // Debounced - a Gtk.Scale fires value-changed continuously
                // during drag (many times per second), and writing
                // config.json that often flooded the shell-side file
                // watcher, which appeared to cause icons to intermittently
                // fail to regenerate correctly during rapid drags.
                if (saveDebounceId)
                    GLib.source_remove(saveDebounceId);
                saveDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    saveDebounceId = null;
                    store.save(config);
                    return GLib.SOURCE_REMOVE;
                });
                // Applies live via the config file watcher - no window.close()
                // needed here, unlike the zone-reorder rows below (which
                // change the list structure itself, not just a stored value).
            });
            row.add_suffix(scale);
            row.add_suffix(valueLabel);
            sizeGroup.add(row);
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
        // Some Shell versions destroy the prefs window without emitting
        // close-request (e.g. when Extension Manager is closed externally).
        // Also handle destroy/unrealize as a fallback.
        window.connect('destroy', flushPendingSave);
        window.connect('unrealize', flushPendingSave);

        for (const zoneName of ZONE_NAMES) {
            const group = new Adw.PreferencesGroup({
                title: `${zoneName[0].toUpperCase()}${zoneName.slice(1)} zone`,
            });
            page.add(group);

            const moduleIds = preset.zones[zoneName] ?? [];
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

        // NOTE: this is deliberately minimal (reorder/remove only, close+
        // reopen to see the new state) rather than a live drag-and-drop
        // editor. See project notes on the config+render split for why
        // that's a cheap upgrade later rather than a rewrite.
    }
}
