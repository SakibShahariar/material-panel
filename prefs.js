import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
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

        const panelSize = {scale: 1.0, gap: 5, ...config.panelSize};
        config.panelSize = panelSize;

        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Panel Size',
            description: 'Doesn\'t affect the quick settings popup, which is a separate surface.',
        });
        page.add(sizeGroup);

        const makeSliderRow = ({title, subtitle, key, min, max, step}) => {
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
                width_request: 160,
                valign: Gtk.Align.CENTER,
            });
            scale.connect('value-changed', () => {
                panelSize[key] = adjustment.value;
                store.save(config);
                // Applies live via the config file watcher - no window.close()
                // needed here, unlike the zone-reorder rows below (which
                // change the list structure itself, not just a stored value).
            });
            row.add_suffix(scale);
            sizeGroup.add(row);
        };

        makeSliderRow({
            title: 'Size',
            subtitle: 'Icon size and pill height together, so they always stay in proportion',
            key: 'scale', min: 0.7, max: 1.5, step: 0.05,
        });
        makeSliderRow({
            title: 'Gap',
            subtitle: 'Space between the pills and the screen edge',
            key: 'gap', min: 0, max: 14, step: 1,
        });

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
