import {applyLayoutStyle, DEFAULT_ZONES, END4_ZONES, RYOKU_ZONES, LAYOUT_DEFAULT, LAYOUT_END4, LAYOUT_RYOKU} from '../lib/layoutPresets.js';

/** Build the layout selector, previews, and layout-specific spacing controls. */
export function buildLayoutPage({Adw, Gtk, config, saveConfig, addPreferencesPage}) {
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
        updateLayoutPreviews(style);
        applyLayoutStyle(config, style);
        saveConfig()
    });
    layoutRow.add_suffix(layoutDrop);
    layoutRow.activatable_widget = layoutDrop;
    layoutGroup.add(layoutRow);
    
    // FlowBox wraps preview cards on narrow Preferences windows instead
    // of compressing three full layout summaries into unreadable columns.
    const layoutPreviewGrid = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        min_children_per_line: 1,
        max_children_per_line: 3,
        row_spacing: 10,
        column_spacing: 10,
        homogeneous: false,
        hexpand: true,
    });
    const layoutPreviewViews = new Map();
    const previewLayouts = [
        {
            id: LAYOUT_DEFAULT,
            title: 'Default',
            zones: DEFAULT_ZONES,
            quickSettings: 'Media · Volume · Brightness · Wi-Fi / Bluetooth · Toggles',
        },
        {
            id: LAYOUT_END4,
            title: 'End-4',
            zones: END4_ZONES,
            quickSettings: 'Media · Volume / Brightness · Toggles · Notifications · Calendar',
        },
        {
            id: LAYOUT_RYOKU,
            title: 'Ryoku',
            zones: RYOKU_ZONES,
            quickSettings: 'Media · Sound · Network · Bluetooth · Session',
        },
    ];
    const moduleLabel = id => String(id)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, letter => letter.toUpperCase());
    for (const entry of previewLayouts) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });
        card.add_css_class('card');
        card.set_margin_top(6);
        card.set_margin_bottom(6);
        card.set_margin_start(4);
        card.set_margin_end(4);
        card.set_hexpand(true);
    
        const title = new Gtk.Label({label: entry.title, xalign: 0});
        title.add_css_class('heading');
        card.append(title);
    
        const bar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            homogeneous: true,
        });
        for (const zone of ['left', 'center', 'right']) {
            const zoneCard = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 3,
            });
            zoneCard.add_css_class('card');
            zoneCard.set_margin_top(2);
            zoneCard.set_margin_bottom(2);
            zoneCard.set_margin_start(2);
            zoneCard.set_margin_end(2);
            const zoneTitle = new Gtk.Label({
                label: zone[0].toUpperCase() + zone.slice(1),
                xalign: 0,
            });
            zoneTitle.add_css_class('dim-label');
            const modules = new Gtk.Label({
                label: (entry.zones[zone] || []).map(moduleLabel).join(' · ') || 'Empty',
                wrap: true,
                xalign: 0,
            });
            zoneCard.append(zoneTitle);
            zoneCard.append(modules);
            bar.append(zoneCard);
        }
        card.append(bar);
    
        const quickSettings = new Gtk.Label({
            label: 'Quick Settings\\n' + entry.quickSettings,
            wrap: true,
            xalign: 0,
        });
        quickSettings.add_css_class('dim-label');
        card.append(quickSettings);
    
        const selectedLabel = new Gtk.Label({label: 'Selected'});
        selectedLabel.add_css_class('accent');
        card.append(selectedLabel);
        layoutPreviewGrid.insert(card, -1);
        layoutPreviewViews.set(entry.id, {card, selectedLabel});
    }
    const updateLayoutPreviews = selectedStyle => {
        for (const [styleId, view] of layoutPreviewViews) {
            const selected = styleId === selectedStyle;
            view.selectedLabel.set_visible(selected);
            if (selected)
                view.card.add_css_class('suggested-action');
            else
                view.card.remove_css_class('suggested-action');
        }
    };
    updateLayoutPreviews(config.layoutStyle ?? LAYOUT_DEFAULT);
    layoutGroup.add(layoutPreviewGrid);
    
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
}
