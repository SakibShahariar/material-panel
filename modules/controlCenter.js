import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
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
import {watchWeatherSummary} from '../lib/weatherSummaryState.js';
import {watchControlCenterSummary} from '../lib/controlCenterSummaryState.js';
import {createPopupHeader} from '../lib/popupHeader.js';
import {
    CONTROL_CENTER_HOME_CARD_DEFINITIONS,
    DEFAULT_CONTROL_CENTER_HOME_LAYOUT,
    getControlCenterHomeGridPlacements,
    moveControlCenterHomeCard,
    normalizeControlCenterHomeLayout,
    setControlCenterHomeCard,
} from '../lib/controlCenterHomeLayout.js';
import {
    loadCalendarDocumentAsync,
    watchCalendarDocument,
    nextEvent,
    formatCountdown,
    formatEventTimeRange,
} from '../lib/calendarEvents.js';

const SECTIONS = [
    {id: 'home', title: 'Home', description: 'Your panel controls and at-a-glance overview.'},
    {id: 'media', title: 'Media', description: 'A focused space for now-playing controls.'},
    {id: 'system', title: 'System', description: 'A focused space for system health and activity.'},
];

function themedSurface() {
    return getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)');
}

function findWallmatApp() {
    try {
        const preferred = Gio.DesktopAppInfo.new('dev.sakib.Wallmat.desktop');
        if (preferred)
            return preferred;
        return Gio.AppInfo.get_all().find(app => {
            try {
                return String(app.get_name?.() ?? '').toLowerCase().includes('wallmat')
                    || String(app.get_id?.() ?? '').toLowerCase().includes('wallmat');
            } catch (e) {
                return false;
            }
        }) ?? null;
    } catch (e) {
        return null;
    }
}

function openWallpaperDestination(appInfo) {
    if (appInfo) {
        try {
            appInfo.launch([], null);
            return;
        } catch (error) {
            logError(error, 'material-panel: failed to launch Wallmat; opening GNOME Background settings');
        }
    }

    try {
        // Gio.Subprocess.new starts the settings application asynchronously;
        // never block the Shell main loop while handing off to another app.
        Gio.Subprocess.new(['gnome-control-center', 'background'], Gio.SubprocessFlags.NONE);
    } catch (error) {
        logError(error, 'material-panel: failed to open GNOME Background settings');
        try {
            Main.notifyError('Wallpaper settings could not be opened',
                'Install Wallmat or GNOME Control Center, then try again.');
        } catch (notifyError) {}
    }
}

function clearActors(box) {
    for (const child of [...box.get_children()]) {
        try {
            box.remove_child(child);
            child.destroy();
        } catch (e) {}
    }
}

function applyHomeCardSize(actor, size) {
    try {
        actor.add_style_class_name(`material-panel-control-center-card-size-${size}`);
        if (size === 'compact')
            actor.style = `${actor.style ?? ''} padding: 10px; spacing: 5px;`;
    } catch (error) {}
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
    const homeCardStore = new ConfigStore();
    const homeCardsMenu = new PopupMenu.PopupSubMenuMenuItem('Home cards', false);
    homeCardsMenu.sensitive = false;
    const homeCardItems = new Map();
    let homeCardLayout = normalizeControlCenterHomeLayout(DEFAULT_CONTROL_CENTER_HOME_LAYOUT);
    let homeCardLayoutChanged = false;
    let applyingHomeCardLayout = false;
    let homeCardSaveQueue = Promise.resolve();
    let currentSectionId = 'home';
    let homeEditMode = false;
    let destroyed = false;

    const updateHomeCardMenuStates = () => {
        applyingHomeCardLayout = true;
        for (const definition of CONTROL_CENTER_HOME_CARD_DEFINITIONS) {
            const entry = homeCardLayout.cards.find(card => card.id === definition.id);
            homeCardItems.get(definition.id)?.setToggleState(entry?.visible !== false);
        }
        applyingHomeCardLayout = false;
    };

    const persistHomeCardLayout = transform => {
        if (applyingHomeCardLayout || destroyed)
            return;
        homeCardLayout = normalizeControlCenterHomeLayout(transform(homeCardLayout));
        homeCardLayoutChanged = true;
        updateHomeCardMenuStates();
        homeCardSaveQueue = homeCardSaveQueue.then(async () => {
            if (destroyed)
                return;
            const config = await homeCardStore.loadAsync();
            config.controlCenterHomeLayout = homeCardLayout;
            const byId = new Map(homeCardLayout.cards.map(card => [card.id, card]));
            config.controlCenterHomeCards = {
                ...(config.controlCenterHomeCards || {}),
                weather: byId.get('weather')?.visible !== false,
                calendar: byId.get('calendar')?.visible !== false,
            };
            await homeCardStore.saveAsync(config);
        }).catch(error => {
            logError(error, 'material-panel: failed to save Home card layout');
            try {
                Main.notifyError('Home layout could not be saved',
                    'Check Material Panel configuration permissions and try again.');
            } catch (notifyError) {}
        });
        if (currentSectionId === 'home')
            renderSection('home');
    };

    const persistHomeCardVisibility = (id, enabled) => {
        persistHomeCardLayout(layout => setControlCenterHomeCard(layout, id, {visible: enabled === true}));
    };

    for (const definition of CONTROL_CENTER_HOME_CARD_DEFINITIONS) {
        const entry = homeCardLayout.cards.find(card => card.id === definition.id);
        const item = new PopupMenu.PopupSwitchMenuItem(definition.label, entry?.visible !== false);
        homeCardItems.set(definition.id, item);
        homeCardsMenu.menu.addMenuItem(item);
        item.connect('toggled', (_item, enabled) => persistHomeCardVisibility(definition.id, enabled));
    }
    menu.addMenuItem(homeCardsMenu);

    const homeEditModeItem = new PopupMenu.PopupSwitchMenuItem('Edit Home layout', false);
    menu.addMenuItem(homeEditModeItem);
    const homeLayoutEditMenu = new PopupMenu.PopupSubMenuMenuItem('Arrange Home cards', false);
    homeLayoutEditMenu.visible = false;
    menu.addMenuItem(homeLayoutEditMenu);
    homeEditModeItem.connect('toggled', (_item, enabled) => {
        homeEditMode = enabled === true;
        homeCardsMenu.visible = homeEditMode && currentSectionId === 'home';
        homeLayoutEditMenu.visible = homeEditMode && currentSectionId === 'home';
    });

    const resetHomeLayoutItem = new PopupMenu.PopupMenuItem('Reset to default layout');
    resetHomeLayoutItem.connect('activate', () =>
        persistHomeCardLayout(() => DEFAULT_CONTROL_CENTER_HOME_LAYOUT));
    homeLayoutEditMenu.menu.addMenuItem(resetHomeLayoutItem);
    homeLayoutEditMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const sizeLabels = {compact: 'Compact', half: 'Half width', full: 'Full width'};
    for (const definition of CONTROL_CENTER_HOME_CARD_DEFINITIONS) {
        const cardMenu = new PopupMenu.PopupSubMenuMenuItem(definition.label, false);
        const moveUpItem = new PopupMenu.PopupMenuItem('Move up');
        const moveDownItem = new PopupMenu.PopupMenuItem('Move down');
        moveUpItem.connect('activate', () =>
            persistHomeCardLayout(layout => moveControlCenterHomeCard(layout, definition.id, -1)));
        moveDownItem.connect('activate', () =>
            persistHomeCardLayout(layout => moveControlCenterHomeCard(layout, definition.id, 1)));
        cardMenu.menu.addMenuItem(moveUpItem);
        cardMenu.menu.addMenuItem(moveDownItem);
        cardMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const sizeMenu = new PopupMenu.PopupSubMenuMenuItem('Size', false);
        for (const size of definition.sizes) {
            const sizeItem = new PopupMenu.PopupMenuItem(sizeLabels[size]);
            sizeItem.connect('activate', () =>
                persistHomeCardLayout(layout => setControlCenterHomeCard(layout, definition.id, {size})));
            sizeMenu.menu.addMenuItem(sizeItem);
        }
        cardMenu.menu.addMenuItem(sizeMenu);
        homeLayoutEditMenu.menu.addMenuItem(cardMenu);
    }

    const navButtons = new Map();

    const renderSection = sectionId => {
        const section = SECTIONS.find(entry => entry.id === sectionId) ?? SECTIONS[0];
        currentSectionId = section.id;
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
        const homeCardActors = {};
        let homeGrid = null;
        if (section.id === 'home') {
            const isHomeCardVisible = id =>
                homeCardLayout.cards.find(cardEntry => cardEntry.id === id)?.visible !== false;
            if (isHomeCardVisible('actions')) {
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
                actionsCard.add_child(actionsTitle);
                actionsCard.add_child(actionGrid);
                homeCardActors.actions = actionsCard;
            }
            if (isHomeCardVisible('media')) {
                const mediaCard = new St.BoxLayout({
                    style_class: 'material-panel-control-center-card',
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                });
                mediaCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px; spacing: 8px;`;
                const mediaHeader = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    x_expand: true,
                });
                mediaHeader.style = 'spacing: 8px;';
                const mediaTitle = new St.Label({text: 'Now playing', x_expand: true});
                mediaTitle.style = 'font-size: 14px; font-weight: 650;';
                const mediaOpen = new St.Button({
                    style_class: 'material-panel-control-center-card-link',
                    reactive: true,
                    can_focus: true,
                    child: new St.Label({text: 'Open Media'}),
                });
                mediaOpen.accessible_name = 'Open detailed Media section';
                mediaOpen.set_tooltip_text('Open detailed Media view');
                mediaOpen.connect('clicked', () => renderSection('media'));
                mediaHeader.add_child(mediaTitle);
                mediaHeader.add_child(mediaOpen);
                const mediaRow = buildMediaPlayerRow({progress: true});
                const noMedia = new St.Label({
                    text: 'No media is playing',
                    style_class: 'material-panel-control-center-placeholder',
                });
                mediaRow.connect('notify::visible', () => {
                    noMedia.visible = !mediaRow.visible;
                });
                mediaCard.add_child(mediaHeader);
                mediaCard.add_child(noMedia);
                mediaCard.add_child(mediaRow);
                homeCardActors.media = mediaCard;
            }

            if (isHomeCardVisible('weather')) {
                const weatherCard = new St.BoxLayout({
                    style_class: 'material-panel-control-center-card',
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                });
                weatherCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px; spacing: 5px;`;
                const weatherTitle = new St.Label({text: 'Weather'});
                weatherTitle.style = 'font-size: 14px; font-weight: 650;';
                const weatherTemp = new St.Label({text: '—°'});
                weatherTemp.style = 'font-size: 24px; font-weight: 700;';
                const weatherCondition = new St.Label({text: 'No weather data yet'});
                weatherCondition.style = 'font-size: 12px;';
                const weatherPlace = new St.Label({text: 'Enable Weather and configure a location'});
                weatherPlace.style = 'font-size: 10px; opacity: 0.72;';
                weatherPlace.clutter_text.line_wrap = true;
                weatherCard.add_child(weatherTitle);
                weatherCard.add_child(weatherTemp);
                weatherCard.add_child(weatherCondition);
                weatherCard.add_child(weatherPlace);

                const renderWeatherSummary = summary => {
                    if (!summary) {
                        weatherTemp.text = '—°';
                        weatherCondition.text = 'No weather data yet';
                        weatherPlace.text = 'Enable Weather and configure a location';
                        return;
                    }
                    if (summary.source === 'Error' || summary.temp == null) {
                        weatherTemp.text = '—°';
                        weatherCondition.text = summary.condition || 'Weather is unavailable';
                        weatherPlace.text = 'Check the Weather module and its location settings';
                        return;
                    }
                    weatherTemp.text = `${Math.round(summary.temp)}°`;
                    weatherCondition.text = summary.condition || 'Current conditions';
                    const ageMinutes = summary.savedAt > 0
                        ? Math.max(0, Math.floor((GLib.get_monotonic_time() - summary.savedAt) / 60000000))
                        : null;
                    const age = ageMinutes == null ? '' : ageMinutes < 1
                        ? 'Updated just now' : `Updated ${ageMinutes} min ago`;
                    const stale = summary.stale ? ' · refresh unavailable' : '';
                    weatherPlace.text = [summary.place, age].filter(Boolean).join(' · ') + stale;
                };
                const stopWeatherWatch = watchWeatherSummary(renderWeatherSummary);
                weatherCard.connect('destroy', stopWeatherWatch);
                homeCardActors.weather = weatherCard;
            }

            if (isHomeCardVisible('calendar')) {
                const calendarCard = new St.BoxLayout({
                    style_class: 'material-panel-control-center-card',
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                });
                calendarCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px; spacing: 5px;`;
                const calendarTitle = new St.Label({text: 'Calendar'});
                calendarTitle.style = 'font-size: 14px; font-weight: 650;';
                const calendarEvent = new St.Label({text: 'Calendar not synced'});
                calendarEvent.style = 'font-size: 13px; font-weight: 600;';
                calendarEvent.clutter_text.line_wrap = true;
                const calendarMeta = new St.Label({text: 'Sync a calendar to see upcoming events'});
                calendarMeta.style = 'font-size: 10px; opacity: 0.72;';
                calendarMeta.clutter_text.line_wrap = true;
                calendarCard.add_child(calendarTitle);
                calendarCard.add_child(calendarEvent);
                calendarCard.add_child(calendarMeta);

                let calendarCardDestroyed = false;
                const renderCalendarSummary = document => {
                    if (calendarCardDestroyed)
                        return;
                    if (!document) {
                        calendarEvent.text = 'Calendar not synced';
                        calendarMeta.text = 'Sync a calendar to see upcoming events';
                        return;
                    }
                    const events = Array.isArray(document.events) ? document.events : [];
                    const upcoming = nextEvent(events);
                    if (upcoming) {
                        calendarEvent.text = String(upcoming.title || 'Upcoming event');
                        calendarMeta.text = [formatEventTimeRange(upcoming), formatCountdown(upcoming)]
                            .filter(Boolean).join(' · ');
                    } else if (events.length > 0) {
                        calendarEvent.text = 'No upcoming timed events';
                        calendarMeta.text = 'Your synced calendar has no future timed event';
                    } else {
                        calendarEvent.text = 'No upcoming events';
                        calendarMeta.text = 'Your synced calendar is currently empty';
                    }
                };
                const stopCalendarWatch = watchCalendarDocument(() => {
                    loadCalendarDocumentAsync(renderCalendarSummary);
                });
                loadCalendarDocumentAsync(renderCalendarSummary);
                calendarCard.connect('destroy', () => {
                    calendarCardDestroyed = true;
                    stopCalendarWatch();
                });
                homeCardActors.calendar = calendarCard;
            }

            if (isHomeCardVisible('system')) {
                const systemSummaryContent = new St.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                });
                systemSummaryContent.style = 'spacing: 8px; padding: 14px;';
                const systemSummaryTitle = new St.Label({text: 'System overview'});
                systemSummaryTitle.style = 'font-size: 14px; font-weight: 650;';
                const systemSummaryGrid = new St.Widget({layout_manager: new Clutter.GridLayout(), x_expand: true});
                systemSummaryGrid.layout_manager.column_spacing = 8;
                systemSummaryGrid.layout_manager.row_spacing = 6;
                const makeSummaryMetric = (title, showUsageBar = false) => {
                    const tile = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
                    tile.style = 'spacing: 2px; padding: 6px 8px; border-radius: 10px;';
                    const name = new St.Label({text: title});
                    name.style = 'font-size: 10px; opacity: 0.7;';
                    const value = new St.Label({text: '—'});
                    value.style = 'font-size: 14px; font-weight: 700;';
                    tile.add_child(name);
                    tile.add_child(value);
                    let fill = null;
                    let track = null;
                    if (showUsageBar) {
                        track = new St.Widget({width: 100, height: 4});
                        track.style = 'background-color: rgba(127, 127, 127, 0.24); border-radius: 4px;';
                        fill = new St.Widget({width: 0, height: 4});
                        fill.style = 'background-color: ' + getThemeColor('primary', '#89b4fa') + '; border-radius: 4px;';
                        track.add_child(fill);
                        track.accessible_name = title + ' usage';
                        tile.add_child(track);
                    }
                    return {
                        actor: tile,
                        value,
                        update(number) {
                            if (!fill)
                                return;
                            const valid = Number.isFinite(number);
                            fill.set_width(valid ? Math.round(Math.max(0, Math.min(100, number))) : 0);
                            track.accessible_name = valid ? title + ' usage ' + Math.round(number) + ' percent' : title + ' usage unavailable';
                        },
                    };
                };
                const cpuMetric = makeSummaryMetric('CPU', true);
                const memoryMetric = makeSummaryMetric('Memory', true);
                const temperatureMetric = makeSummaryMetric('CPU temp');
                const diskMetric = makeSummaryMetric('Disk', true);
                systemSummaryGrid.layout_manager.attach(cpuMetric.actor, 0, 0, 1, 1);
                systemSummaryGrid.layout_manager.attach(memoryMetric.actor, 1, 0, 1, 1);
                systemSummaryGrid.layout_manager.attach(temperatureMetric.actor, 0, 1, 1, 1);
                systemSummaryGrid.layout_manager.attach(diskMetric.actor, 1, 1, 1, 1);
                const systemSummaryMeta = new St.Label({text: 'Open System for the first CPU, memory and temperature sample'});
                systemSummaryMeta.style = 'font-size: 10px; opacity: 0.72;';
                systemSummaryMeta.clutter_text.line_wrap = true;
                systemSummaryContent.add_child(systemSummaryTitle);
                systemSummaryContent.add_child(systemSummaryGrid);
                systemSummaryContent.add_child(systemSummaryMeta);
                const systemSummaryCard = new St.Button({
                    style_class: 'material-panel-control-center-card',
                    reactive: true,
                    can_focus: true,
                    x_expand: true,
                    child: systemSummaryContent,
                });
                systemSummaryCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 0;`;
                systemSummaryCard.accessible_name = 'System overview; open detailed System view';
                systemSummaryCard.set_tooltip_text('Open detailed System view');
                systemSummaryCard.connect('clicked', () => renderSection('system'));
                const sampleAge = (sampledAt, sampledAtLabel) => {
                    if (sampledAtLabel)
                        return `at ${sampledAtLabel}`;
                    if (!(sampledAt > 0))
                        return 'sample time unavailable';
                    const minutes = Math.max(0, Math.floor((GLib.get_monotonic_time() - sampledAt) / 60000000));
                    return minutes < 1 ? 'sampled just now' : `sampled ${minutes} min ago`;
                };
                const renderSystemSummary = snapshot => {
                    const system = snapshot?.system;
                    const disk = snapshot?.disk;
                    cpuMetric.value.text = system?.cpu == null ? '—' : `${Math.round(system.cpu)}%`;
                    memoryMetric.value.text = system?.memory == null ? '—' : `${Math.round(system.memory)}%`;
                    temperatureMetric.value.text = system?.temperature == null ? 'Unavailable' : `${Math.round(system.temperature)}°C`;
                    diskMetric.value.text = disk?.pct == null ? 'Unavailable' : `${Math.round(disk.pct)}%`;
                    cpuMetric.update(system?.cpu);
                    memoryMetric.update(system?.memory);
                    diskMetric.update(disk?.pct);
                    const systemAge = system ? sampleAge(system.sampledAt, system.sampledAtLabel) : null;
                    const diskAge = disk ? sampleAge(disk.sampledAt, disk.sampledAtLabel) : null;
                    if (!system) {
                        systemSummaryMeta.text = disk
                            ? `Open System for CPU, memory and temperature · Disk ${diskAge}`
                            : 'Open System to collect CPU, memory and temperature readings';
                        return;
                    }
                    systemSummaryMeta.text = disk
                        ? `System ${systemAge} · Disk ${diskAge}`
                        : `System ${systemAge} · Enable the Disk module for storage usage`;
                };
                const stopSystemSummaryWatch = watchControlCenterSummary(renderSystemSummary);
                systemSummaryCard.connect('destroy', stopSystemSummaryWatch);
                homeCardActors.system = systemSummaryCard;
            }
            if (isHomeCardVisible('wallpaper')) {
                const wallpaperApp = findWallmatApp();
                const wallpaperCard = new St.Button({
                    style_class: 'material-panel-control-center-card',
                    reactive: true,
                    can_focus: true,
                    x_expand: true,
                });
                wallpaperCard.style = `background-color: ${themedSurface()}; border-radius: 18px; padding: 14px;`;
                const wallpaperContent = new St.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                });
                wallpaperContent.style = 'spacing: 6px;';
                const wallpaperTitle = new St.Label({text: 'Wallpaper'});
                wallpaperTitle.style = 'font-size: 14px; font-weight: 650;';
                const wallpaperDescription = new St.Label({
                    text: wallpaperApp
                        ? 'Browse and apply wallpapers with Wallmat.'
                        : "Wallmat isn't installed. Open GNOME Background settings instead.",
                    x_expand: true,
                });
                wallpaperDescription.clutter_text.line_wrap = true;
                wallpaperDescription.style = 'font-size: 11px; opacity: 0.78;';
                const wallpaperAction = new St.Label({
                    text: wallpaperApp ? 'Open Wallmat' : 'Open Background Settings',
                    x_expand: true,
                });
                wallpaperAction.style = 'font-size: 12px; font-weight: 650;';
                wallpaperContent.add_child(wallpaperTitle);
                wallpaperContent.add_child(wallpaperDescription);
                wallpaperContent.add_child(wallpaperAction);
                wallpaperCard.set_child(wallpaperContent);
                wallpaperCard.accessible_name = wallpaperApp
                    ? 'Open Wallmat wallpaper chooser'
                    : 'Open GNOME Background settings';
                wallpaperCard.set_tooltip_text(wallpaperApp
                    ? 'Browse and apply wallpapers with Wallmat'
                    : 'Open GNOME Background settings');
                wallpaperCard.connect('clicked', () => openWallpaperDestination(wallpaperApp));
                homeCardActors.wallpaper = wallpaperCard;
            }

            const placements = getControlCenterHomeGridPlacements(
                homeCardLayout, Object.keys(homeCardActors), compact);
            for (const [id, actor] of Object.entries(homeCardActors)) {
                const entry = homeCardLayout.cards.find(cardEntry => cardEntry.id === id);
                applyHomeCardSize(actor, entry?.size ?? 'half');
            }

            homeGrid = new St.Widget({
                style_class: 'material-panel-control-center-home-grid',
                layout_manager: new Clutter.GridLayout(),
                x_expand: true,
            });
            const gridLayout = homeGrid.layout_manager;
            gridLayout.column_spacing = compact ? 0 : 10;
            gridLayout.row_spacing = 10;
            if (!placements.length) {
                const empty = new St.Label({
                    text: 'No Home cards are visible. Use Home cards to add one.',
                    style_class: 'material-panel-control-center-placeholder',
                    x_expand: true,
                });
                empty.clutter_text.line_wrap = true;
                homeGrid.add_child(empty);
            } else {
                for (const placement of placements) {
                    gridLayout.attach(
                        homeCardActors[placement.id],
                        placement.column,
                        placement.row,
                        placement.columnSpan,
                        1);
                }
            }
        }

        const sectionHeader = createPopupHeader({
            titleActor: heading,
            statusActor: description,
            styleClass: 'material-panel-control-center-header',
            style: 'spacing: 10px; padding: 6px;',
        });
        page.add_child(sectionHeader.actor);
        if (section.id === 'home') {
            page.add_child(homeGrid);
        } else if (systemView) {
            page.add_child(systemView);
        } else {
            page.add_child(card);
        }

        focusModeItem.visible = section.id === 'home';
        homeCardsMenu.visible = section.id === 'home' && homeEditMode;
        homeEditModeItem.visible = section.id === 'home';
        homeLayoutEditMenu.visible = section.id === 'home' && homeEditMode;
        for (const [id, navButton] of navButtons) {
            const active = id === section.id;
            navButton.style = active
                ? `background-color: ${getThemeColor('primaryContainer', 'rgba(137, 180, 250, 0.22)')}; border-radius: 12px; padding: 10px 8px;`
                : 'background-color: transparent; border-radius: 12px; padding: 10px 8px;';
        }
    };

    homeCardStore.loadAsync().then(config => {
        if (homeCardLayoutChanged || destroyed)
            return;
        homeCardLayout = normalizeControlCenterHomeLayout(
            config.controlCenterHomeLayout, config.controlCenterHomeCards);
        updateHomeCardMenuStates();
        homeCardsMenu.sensitive = true;
        if (currentSectionId === 'home')
            renderSection('home');
    }).catch(error => {
        homeCardsMenu.sensitive = true;
        logError(error, 'material-panel: failed to load Home card layout');
    });

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
    button.connect('destroy', () => {
        destroyed = true;
        menu.destroy();
    });

    return button;
}
