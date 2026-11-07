import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ConfigStore} from '../lib/configStore.js';
import {darkModeTile, nightLightTile, dndTile} from './quicksettings.js';
import {buildMediaPlayerRow} from './mediaPlayer.js';
import {buildControlCenterSystem} from './controlCenterSystem.js';
import {getThemeColor} from '../lib/themeColorState.js';
import {setChipA11y} from '../lib/a11y.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';

const SECTIONS = [
    {id: 'home', title: 'Home', description: 'Your panel controls and at-a-glance overview.'},
    {id: 'media', title: 'Media', description: 'A focused space for now-playing controls.'},
    {id: 'system', title: 'System', description: 'A focused space for system health and activity.'},
];

function themedSurface() {
    return getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)');
}

function clearActors(box) {
    for (const child of [...box.get_children()]) {
        try {
            box.remove_child(child);
            child.destroy();
        } catch (e) {}
    }
}

function addFocusModeControl(menu) {
    const item = new PopupMenu.PopupSwitchMenuItem('Focus Mode', false);
    menu.addMenuItem(item);
    const store = new ConfigStore();
    let userChanged = false;
    let saveQueue = Promise.resolve();

    store.loadAsync().then(config => {
        if (!userChanged)
            item.setToggleState(config.focusModeEnabled === true);
    }).catch(error => {
        logError(error, 'material-panel: failed to load Control Center Focus Mode state');
    });

    item.connect('toggled', (_item, enabled) => {
        userChanged = true;
        saveQueue = saveQueue.then(async () => {
            const config = await store.loadAsync();
            config.focusModeEnabled = enabled === true;
            await store.saveAsync(config);
        }).catch(error => {
            logError(error, 'material-panel: failed to save Control Center Focus Mode state');
            try {
                Main.notifyError('Focus Mode could not be changed',
                    'Check Material Panel configuration permissions and try again.');
            } catch (notifyError) {}
        });
    });
    return item;
}

function popupArrowSide() {
    try {
        const monitor = Main.layoutManager.primaryMonitor;
        const panelBox = Main.layoutManager.panelBox;
        if (!monitor || !panelBox)
            return St.Side.TOP;
        const [x, y] = panelBox.get_transformed_position();
        const [width, height] = panelBox.get_transformed_size();
        if (height > width)
            return x > monitor.x + monitor.width / 2 ? St.Side.LEFT : St.Side.RIGHT;
        return y > monitor.y + monitor.height / 2 ? St.Side.BOTTOM : St.Side.TOP;
    } catch (e) {
        return St.Side.TOP;
    }
}

export function buildControlCenter(_extensionPath, scale = 1.0) {
    const icon = new St.Icon({
        icon_name: 'view-grid-symbolic',
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
    });
    const button = new St.Button({
        style_class: 'material-panel-control-center-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: icon,
    });
    setChipA11y(button, 'Control Center');

    const menu = new PopupMenu.PopupMenu(button, 0.5, popupArrowSide());
    menu.actor.add_style_class_name('material-panel-popup material-panel-control-center-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const monitor = Main.layoutManager.primaryMonitor;
    const availableWidth = Math.max(240, (monitor?.width ?? 900) - 32);
    const width = Math.min(520, availableWidth);
    const maxHeight = Math.max(160, Math.floor((monitor?.height ?? 800) * 0.78));
    const compact = width < 420;

    const frame = new St.BoxLayout({
        style_class: 'material-panel-control-center-frame',
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_expand: true,
    });
    frame.style = `spacing: 12px; padding: 12px; width: ${width}px; max-height: ${maxHeight}px;`;

    const navigation = new St.BoxLayout({
        style_class: 'material-panel-control-center-navigation',
        orientation: Clutter.Orientation.VERTICAL,
        y_expand: true,
    });
    navigation.style = `spacing: 6px; min-width: ${compact ? 76 : 112}px; padding: 4px;`;

    const scroll = new St.ScrollView({
        style_class: 'material-panel-control-center-scroll',
        x_expand: true,
        y_expand: true,
    });
    scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

    const page = new St.BoxLayout({
        style_class: 'material-panel-control-center-page',
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
    });
    page.style = 'spacing: 12px; padding: 6px;';
    scroll.set_child(page);
    frame.add_child(navigation);
    frame.add_child(scroll);

    const shellItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
    });
    shellItem.set_style('padding: 0; margin: 0;');
    shellItem.add_child(frame);
    menu.addMenuItem(shellItem);

    const focusModeItem = addFocusModeControl(menu);
    const navButtons = new Map();

    const renderSection = sectionId => {
        const section = SECTIONS.find(entry => entry.id === sectionId) ?? SECTIONS[0];
        clearActors(page);

        const heading = new St.Label({
            text: section.title,
            style_class: 'material-panel-control-center-title',
        });
        heading.style = 'font-size: 20px; font-weight: 700;';
        const description = new St.Label({
            text: section.description,
            style_class: 'material-panel-control-center-description',
            x_expand: true,
        });
        description.clutter_text.line_wrap = true;
        description.style = 'font-size: 12px;';

        const card = new St.BoxLayout({
            style_class: 'material-panel-control-center-card',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        card.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 16px; spacing: 8px;`;

        let message = 'The Home dashboard is being built in the next Control Center phase.';
        if (section.id === 'media')
            message = 'The full Media experience is tracked in phase 3 (#122).';
        else if (section.id === 'system')
            message = 'Detailed system monitoring is tracked in phase 4 (#123).';

        const body = new St.Label({
            text: message,
            style_class: 'material-panel-control-center-placeholder',
            x_expand: true,
        });
        body.clutter_text.line_wrap = true;
        if (section.id !== 'media' && section.id !== 'system')
            card.add_child(body);
        if (section.id === 'media') {
            const mediaRow = buildMediaPlayerRow({detailed: true});
            const noMedia = new St.Label({
                text: 'No media is playing',
                style_class: 'material-panel-control-center-placeholder',
            });
            mediaRow.connect('notify::visible', () => {
                noMedia.visible = !mediaRow.visible;
            });
            card.add_child(noMedia);
            card.add_child(mediaRow);
        }
        const systemView = section.id === 'system' ? buildControlCenterSystem() : null;
        if (section.id === 'home') {
            const actionsCard = new St.BoxLayout({
                style_class: 'material-panel-control-center-card',
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            actionsCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px; spacing: 10px;`;
            const actionsTitle = new St.Label({text: 'Quick actions'});
            actionsTitle.style = 'font-size: 14px; font-weight: 650;';
            const actionGrid = new St.Widget({
                style_class: 'material-panel-control-center-actions',
                layout_manager: new Clutter.GridLayout(),
                x_expand: true,
            });
            actionGrid.layout_manager.column_spacing = 8;
            actionGrid.layout_manager.row_spacing = 8;
            const actions = [darkModeTile(), nightLightTile(), dndTile()];
            actions.forEach((action, index) => {
                action.x_expand = true;
                actionGrid.layout_manager.attach(action, index % 2, Math.floor(index / 2), 1, 1);
            });
            const mediaCard = new St.BoxLayout({
                style_class: 'material-panel-control-center-card',
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            mediaCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px; spacing: 8px;`;
            const mediaTitle = new St.Label({text: 'Now playing'});
            mediaTitle.style = 'font-size: 14px; font-weight: 650;';
            const mediaRow = buildMediaPlayerRow();
            const noMedia = new St.Label({
                text: 'No media is playing',
                style_class: 'material-panel-control-center-placeholder',
            });
            mediaRow.connect('notify::visible', () => {
                noMedia.visible = !mediaRow.visible;
            });
            mediaCard.add_child(mediaTitle);
            mediaCard.add_child(noMedia);
            mediaCard.add_child(mediaRow);
            page.add_child(mediaCard);

            actionsCard.add_child(actionsTitle);
            actionsCard.add_child(actionGrid);
            page.add_child(actionsCard);
        }

        page.add_child(heading);
        page.add_child(description);
        if (systemView)
            page.add_child(systemView);
        else
            page.add_child(card);

        focusModeItem.visible = section.id === 'home';
        for (const [id, navButton] of navButtons) {
            const active = id === section.id;
            navButton.style = active
                ? `background-color: ${getThemeColor('primaryContainer', 'rgba(137, 180, 250, 0.22)')}; border-radius: 12px; padding: 10px 8px;`
                : 'background-color: transparent; border-radius: 12px; padding: 10px 8px;';
        }
    };

    for (const section of SECTIONS) {
        const navButton = new St.Button({
            style_class: 'material-panel-control-center-nav-button',
            reactive: true,
            can_focus: true,
            x_expand: true,
            child: new St.Label({
                text: compact ? section.title.slice(0, 1) : section.title,
                x_align: Clutter.ActorAlign.START,
            }),
        });
        navButton.accessible_name = section.title;
        navButton.connect('clicked', () => renderSection(section.id));
        navigation.add_child(navButton);
        navButtons.set(section.id, navButton);
    }

    renderSection('home');
    menu.connect('open-state-changed', (_menu, open) => {
        if (open) {
            renderSection('home');
        } else {
            clearActors(page);
            focusModeItem.visible = false;
        }
    });
    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else
            menuOpen(menu);
    });
    button.connect('destroy', () => menu.destroy());

    return button;
}
