import {getThemeColor} from '../lib/themeColorState.js';
import {setChipA11y} from '../lib/a11y.js';
import {isMediaAutoHideEnabled} from '../lib/mediaVisibilityState.js';
import {isMediaVisualizerEnabled} from '../lib/mediaVisualizerState.js';
import {refreshQuickSettingsChrome} from '../lib/quickSettingsRechrome.js';
import {createStatusState} from '../lib/statusState.js';
import {wireChipPress, giconForKey, tintSymbolic, primaryColor, onPrimaryColor} from '../lib/pressFx.js';

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose, prefersReducedMotion} from '../lib/shellCompat.js';


function setArtFromUrl(container, artUrl, size = 48) {
    if (!container)
        return;

    const setChild = child => {
        const previous = container.get_child();
        if (previous) {
            container.set_child(null);
            if (previous !== child)
                previous.destroy();
        }
        if (child)
            container.set_child(child);
    };
    const showFallback = () => setChild(new St.Icon({
        icon_name: 'audio-x-generic-symbolic',
        icon_size: size,
        y_align: Clutter.ActorAlign.CENTER,
    }));

    if (!artUrl) {
        showFallback();
        return;
    }

    try {
        const value = String(artUrl);
        let uri;
        if (/^https?:\/\//i.test(value) || value.startsWith('file://')) {
            uri = value;
        } else if (value.startsWith('/')) {
            // Convert local paths to file URIs without blocking on query_exists().
            uri = Gio.File.new_for_path(value).get_uri();
        } else {
            showFallback();
            return;
        }

        // This returns a Clutter actor that fills in asynchronously. Keep it as
        // the bin's child so remote artwork is actually displayed when loaded.
        const texture = St.TextureCache.get_default().load_uri_async(
            uri, size, size, 1);
        if (!texture) {
            showFallback();
            return;
        }
        texture.set_size(size, size);
        setChild(texture);
    } catch (e) {
        showFallback();
    }
}

const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

function makePlayerProxy(busName, callback) {
    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
        busName, '/org/mpris/MediaPlayer2', PLAYER_IFACE, null,
        (_s, res) => {
            try {
                callback(Gio.DBusProxy.new_for_bus_finish(res), busName);
            } catch (e) {
                callback(null, busName);
            }
        });
}

function makePropsProxy(busName, callback) {
    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
        busName, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties', null,
        (_s, res) => {
            try {
                callback(Gio.DBusProxy.new_for_bus_finish(res));
            } catch (e) {
                callback(null);
            }
        });
}

function formatMediaTime(positionUs) {
    const seconds = Math.max(0, Math.floor((Number(positionUs) || 0) / 1000000));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function metaField(meta, key) {
    try {
        if (!meta || !(key in meta))
            return '';
        const v = meta[key].deep_unpack();
        if (Array.isArray(v))
            return v[0] || '';
        return String(v || '');
    } catch (e) {
        return '';
    }
}

function bindPlayer(busName, hooks) {
    makePlayerProxy(busName, (player, name) => {
        if (!player) {
            hooks.onGone?.();
            return;
        }
        makePropsProxy(name, propsProxy => {
            if (!propsProxy) {
                hooks.onGone?.();
                return;
            }

            const applyMeta = variant => {
                try {
                    const meta = variant.deep_unpack();
                    const title = metaField(meta, 'xesam:title') || 'Unknown';
                    const artist = metaField(meta, 'xesam:artist');
                    const artUrl = metaField(meta, 'mpris:artUrl');
                    const trackId = metaField(meta, 'mpris:trackid');
                    let lengthUs = 0;
                    try { lengthUs = Number(meta['mpris:length']?.deep_unpack?.()) || 0; } catch (e) {}
                    const album = metaField(meta, 'xesam:album');
                    hooks.onMeta?.({title, artist, album, artUrl, trackId, lengthUs, busName: name});
                } catch (e) {}
            };
            const applyStatus = variant => {
                try {
                    const st = variant.deep_unpack();
                    hooks.onStatus?.(st === 'Playing');
                } catch (e) {}
            };
            const applyPosition = variant => {
                try { hooks.onPosition?.(Number(variant.deep_unpack()) || 0); } catch (e) {}
            };
            const applyCanSeek = variant => {
                try { hooks.onCanSeek?.(Boolean(variant.deep_unpack())); } catch (e) {}
            };

            propsProxy.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'Metadata']),
                Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                    try {
                        const [v] = p.call_finish(r).deep_unpack();
                        applyMeta(v);
                    } catch (e) {}
                });
            propsProxy.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'PlaybackStatus']),
                Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                    try {
                        const [v] = p.call_finish(r).deep_unpack();
                        applyStatus(v);
                    } catch (e) {}
                });
            for (const [property, apply] of [['Position', applyPosition], ['CanSeek', applyCanSeek]]) {
                propsProxy.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, property]),
                    Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            const [value] = p.call_finish(r).deep_unpack();
                            apply(value);
                        } catch (e) {}
                    });
            }

            const sigId = propsProxy.connect('g-signal', (_p, _sender, signal, params) => {
                if (signal !== 'PropertiesChanged')
                    return;
                const [iface, changed] = params.deep_unpack();
                if (iface !== PLAYER_IFACE)
                    return;
                if ('Metadata' in changed)
                    applyMeta(changed['Metadata']);
                if ('PlaybackStatus' in changed)
                    applyStatus(changed['PlaybackStatus']);
                if ('Position' in changed)
                    applyPosition(changed['Position']);
                if ('CanSeek' in changed)
                    applyCanSeek(changed['CanSeek']);
            });

            hooks.onReady?.({
                player,
                destroy: () => {
                    try { propsProxy.disconnect(sigId); } catch (e) {}
                },
                previous: () => player.call('Previous', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
                playPause: () => player.call('PlayPause', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
                next: () => player.call('Next', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
                getPosition: callback => propsProxy.call('Get',
                    new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
                    Gio.DBusCallFlags.NONE, 2000, null, (proxy, result) => {
                        try {
                            const [value] = proxy.call_finish(result).deep_unpack();
                            callback(Number(value.deep_unpack()) || 0);
                        } catch (e) {}
                    }),
                setPosition: (positionUs, trackId) => {
                    const target = Math.max(0, Math.round(positionUs));
                    const origin = hooks.currentPosition?.() || 0;
                    const seekRelative = () => player.call('Seek',
                        new GLib.Variant('(x)', [target - origin]),
                        Gio.DBusCallFlags.NONE, 3000, null, () => {});
                    if (!trackId) {
                        seekRelative();
                        return;
                    }
                    player.call('SetPosition', new GLib.Variant('(ox)', [trackId, target]),
                        Gio.DBusCallFlags.NONE, 3000, null, (_proxy, result) => {
                            try { player.call_finish(result); } catch (e) { seekRelative(); }
                        });
                },
            });
        });
    });
}

function watchPreferredPlayer(callback) {
    const dbus = Gio.DBus.session;
    const names = new Set();
    const changesDuringInitialScan = new Map();
    let initialized = false;
    let destroyed = false;
    let selectionRevision = 0;
    let preferredName = null;

    const choose = () => {
        if (destroyed)
            return;
        const revision = ++selectionRevision;
        const candidates = [...names];
        if (preferredName && candidates.includes(preferredName)) {
            callback(preferredName, candidates);
            return;
        }
        if (preferredName && !candidates.includes(preferredName))
            preferredName = null;
        if (candidates.length === 0) {
            callback(null, candidates);
            return;
        }

        let pending = candidates.length;
        let playing = null;
        const fallback = candidates[0];
        for (const name of candidates) {
            makePropsProxy(name, props => {
                if (destroyed || revision !== selectionRevision)
                    return;
                const finishOne = () => {
                    pending--;
                    if (pending === 0 && !destroyed && revision === selectionRevision)
                        callback(playing || fallback, candidates);
                };
                if (!props) {
                    finishOne();
                    return;
                }
                props.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'PlaybackStatus']),
                    Gio.DBusCallFlags.NONE, 5000, null, (proxy, result) => {
                        if (destroyed || revision !== selectionRevision)
                            return;
                        try {
                            const [value] = proxy.call_finish(result).deep_unpack();
                            if (value.deep_unpack() === 'Playing')
                                playing = name;
                        } catch (e) {}
                        finishOne();
                    });
            });
        }
    };

    // Subscribe before ListNames and replay changes observed during that scan.
    const ownerSignalId = dbus.signal_subscribe(
        'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
        '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
        (_connection, _sender, _path, _iface, _signal, parameters) => {
            const [name, _oldOwner, newOwner] = parameters.deep_unpack();
            if (!name.startsWith(MPRIS_PREFIX))
                return;
            if (!initialized) {
                changesDuringInitialScan.set(name, Boolean(newOwner));
                return;
            }
            if (newOwner)
                names.add(name);
            else
                names.delete(name);
            choose();
        });

    const statusSignalId = dbus.signal_subscribe(
        null, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
        '/org/mpris/MediaPlayer2', PLAYER_IFACE, Gio.DBusSignalFlags.NONE,
        (_connection, _sender, _path, _iface, _signal, parameters) => {
            try {
                const [iface, changed] = parameters.deep_unpack();
                if (iface === PLAYER_IFACE && 'PlaybackStatus' in changed)
                    choose();
            } catch (e) {}
        });

    dbus.call(
        'org.freedesktop.DBus', '/', 'org.freedesktop.DBus', 'ListNames',
        null, null, Gio.DBusCallFlags.NONE, 5000, null,
        (_connection, result) => {
            if (destroyed)
                return;
            try {
                const [busNames] = dbus.call_finish(result).deep_unpack();
                for (const name of busNames) {
                    if (name.startsWith(MPRIS_PREFIX))
                        names.add(name);
                }
            } catch (e) {
                // Stay subscribed so NameOwnerChanged can recover later.
            }
            for (const [name, owned] of changesDuringInitialScan) {
                if (owned)
                    names.add(name);
                else
                    names.delete(name);
            }
            changesDuringInitialScan.clear();
            initialized = true;
            choose();
        });

    const stop = () => {
        if (destroyed)
            return;
        destroyed = true;
        selectionRevision++;
        dbus.signal_unsubscribe(ownerSignalId);
        dbus.signal_unsubscribe(statusSignalId);
    };
    stop.select = name => {
        preferredName = names.has(name) ? name : null;
        choose();
    };
    return stop;
}

/** QS media card */
export function buildMediaPlayerRow({detailed = false} = {}) {
    const row = new St.BoxLayout({
        style_class: 'material-panel-qs-media',
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });
    try {
        // Cap width so long titles cannot stretch the QS menu
        row.style = detailed
            ? 'spacing: 14px; padding: 12px; border-radius: 16px; max-width: 460px;'
            : 'spacing: 10px; padding: 8px 10px; border-radius: 16px; max-width: 360px;';
    } catch (e) {}

    const artIcon = new St.Bin({
        style_class: 'material-panel-qs-media-art',
        width: detailed ? 88 : 40,
        height: detailed ? 88 : 40,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { artIcon.style = detailed ? 'border-radius: 14px;' : 'border-radius: 10px;'; } catch (e) {}

    const textCol = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { textCol.style = detailed ? 'spacing: 6px; min-width: 0;' : 'spacing: 2px;'; } catch (e) {}
    const titleLabel = new St.Label({
        text: 'No media',
        style_class: 'material-panel-qs-media-title',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    try {
        titleLabel.clutter_text.max_width_chars = detailed ? 48 : 28;
        titleLabel.style = detailed ? 'font-size: 16px; font-weight: 700; max-width: 300px;' : 'max-width: 180px;';
    } catch (e) {}
    const artistLabel = new St.Label({
        text: '',
        style_class: 'material-panel-qs-media-artist',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    try {
        artistLabel.clutter_text.max_width_chars = detailed ? 48 : 28;
        artistLabel.style = detailed ? 'font-size: 12px; max-width: 300px;' : 'max-width: 180px;';
    } catch (e) {}
    const albumLabel = detailed ? new St.Label({text: '', x_expand: true}) : null;
    const playbackLabel = detailed ? new St.Label({text: 'Connecting…'}) : null;
    if (albumLabel) {
        albumLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        albumLabel.style = 'font-size: 11px; opacity: 0.72; max-width: 300px;';
        albumLabel.visible = false;
    }
    if (playbackLabel)
        playbackLabel.style = 'font-size: 10px; opacity: 0.7;';
    textCol.add_child(titleLabel);
    textCol.add_child(artistLabel);
    if (albumLabel)
        textCol.add_child(albumLabel);
    if (playbackLabel)
        textCol.add_child(playbackLabel);

    let durationUs = 0;
    let currentPositionUs = 0;
    let positionTimerId = 0;
    let progressFill = null;
    let progressTime = null;
    if (detailed) {
        const progressTrack = new St.Widget({x_expand: true, height: 4});
        try { progressTrack.style = 'background-color: rgba(127, 127, 127, 0.25); border-radius: 4px;'; } catch (e) {}
        progressFill = new St.Widget({height: 4});
        try { progressFill.style = 'background-color: ' + getThemeColor('primary', '#89b4fa') + '; border-radius: 4px;'; } catch (e) {}
        progressTrack.add_child(progressFill);
        progressTime = new St.Label({text: '—:— / —:—'});
        try { progressTime.style = 'font-size: 10px; opacity: 0.7;'; } catch (e) {}
        textCol.add_child(progressTrack);
        textCol.add_child(progressTime);
    }
    const updateDetailedProgress = positionUs => {
        if (destroyed)
            return;
        currentPositionUs = Math.max(0, Number(positionUs) || 0);
        if (!detailed || !progressFill || !progressTime)
            return;
        const ratio = durationUs > 0 ? Math.max(0, Math.min(1, currentPositionUs / durationUs)) : 0;
        try { progressFill.set_width(Math.round(260 * ratio)); } catch (e) {}
        progressTime.text = durationUs > 0
            ? formatMediaTime(currentPositionUs) + ' / ' + formatMediaTime(durationUs)
            : '—:— / —:—';
    };
    const stopPositionPolling = () => {
        if (positionTimerId) {
            try { GLib.source_remove(positionTimerId); } catch (e) {}
            positionTimerId = 0;
        }
    };

    const controls = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-qs-media-controls',
    });
    try { controls.style = detailed ? 'spacing: 8px;' : 'spacing: 4px;'; } catch (e) {}
    const mk = name => {
        const b = new St.Button({
            style_class: 'material-panel-qs-media-btn',
            reactive: true,
            track_hover: true,
        });
        b.set_child(new St.Icon({icon_name: name, icon_size: detailed ? 20 : 16}));
        return b;
    };
    const prevBtn = mk('media-skip-backward-symbolic');
    const playBtn = mk('media-playback-start-symbolic');
    const nextBtn = mk('media-skip-forward-symbolic');
    setChipA11y(prevBtn, 'Previous track');
    setChipA11y(playBtn, 'Play or pause, paused');
    setChipA11y(nextBtn, 'Next track');
    controls.add_child(prevBtn);
    controls.add_child(playBtn);
    controls.add_child(nextBtn);

    const visualizerEnabled = detailed && isMediaVisualizerEnabled();
    const visualizer = visualizerEnabled
        ? new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, y_align: Clutter.ActorAlign.CENTER})
        : null;
    const visualizerBars = [];
    if (visualizer) {
        visualizer.style = 'spacing: 2px; width: 22px; height: 16px;';
        for (const height of [5, 9, 6, 12, 7]) {
            const bar = new St.Widget({width: 3, height});
            bar.style = 'background-color: ' + getThemeColor('primary', '#89b4fa') + '; border-radius: 2px;';
            visualizer.add_child(bar);
            visualizerBars.push(bar);
        }
        visualizer.visible = false;
    }

    const playerButton = detailed ? new St.Button({
        style_class: 'material-panel-qs-media-btn',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: new St.Label({text: 'Player'}),
    }) : null;
    if (playerButton) {
        playerButton.visible = false;
        playerButton.child.style = 'font-size: 10px;';
        setChipA11y(playerButton, 'Choose media player');
    }
    const playerMenu = playerButton ? new PopupMenu.PopupMenu(playerButton, 0.5, St.Side.TOP) : null;
    if (playerMenu) {
        Main.uiGroup.add_child(playerMenu.actor);
        playerMenu.actor.hide();
        attachPopupDismiss(playerMenu, playerButton);
    }
    let playerChoices = [];
    let playerNamesSignature = '';
    let selectPreferredPlayer = null;
    const playerDisplayName = name => String(name || '')
        .replace(MPRIS_PREFIX, '')
        .replace(/[-_]/g, ' ');
    const updatePlayerChoices = (selectedName, players = []) => {
        if (!playerMenu || !playerButton)
            return;
        const signature = players.join('|');
        if (signature !== playerNamesSignature) {
            for (const choice of playerChoices) {
                try { playerMenu.removeMenuItem(choice.item); } catch (e) {}
            }
            playerChoices = [];
            playerNamesSignature = signature;
            for (const name of players) {
                const choice = new PopupMenu.PopupMenuItem(playerDisplayName(name));
                choice.connect('activate', () => {
                    selectPreferredPlayer?.(name);
                    menuClose(playerMenu);
                });
                playerMenu.addMenuItem(choice);
                playerChoices.push({name, item: choice});
            }
        }
        playerButton.visible = players.length > 1;
        playerButton.child.text = players.length > 1
            ? playerDisplayName(selectedName)
            : 'Player';
        setChipA11y(playerButton, players.length > 1
            ? 'Choose media player, current ' + playerDisplayName(selectedName)
            : 'Choose media player');
        for (const choice of playerChoices) {
            try {
                choice.item.setOrnament(choice.name === selectedName
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE);
            } catch (e) {}
        }
    };
    if (playerButton) {
        playerButton.connect('clicked', () => {
            if (playerMenu.isOpen)
                menuClose(playerMenu);
            else
                menuOpen(playerMenu);
        });
    }

    row.add_child(artIcon);
    row.add_child(textCol);
    if (visualizer)
        row.add_child(visualizer);
    if (playerButton)
        row.add_child(playerButton);
    row.add_child(controls);

    let ctl = null;
    let attachedBusName = null;
    let playerGeneration = 0;
    let destroyed = false;
    let visualizerPlaying = false;
    let visualizerTimerId = 0;
    const resetVisualizer = () => {
        [5, 9, 6, 12, 7].forEach((height, index) => {
            try { visualizerBars[index].height = height; } catch (e) {}
        });
    };
    const stopVisualizer = () => {
        if (visualizerTimerId) {
            try { GLib.source_remove(visualizerTimerId); } catch (e) {}
            visualizerTimerId = 0;
        }
        if (visualizer) {
            visualizer.visible = false;
            resetVisualizer();
        }
    };
    const startVisualizer = () => {
        if (!visualizer || !visualizerPlaying || !row.mapped || prefersReducedMotion())
            return;
        visualizer.visible = true;
        if (visualizerTimerId)
            return;
        visualizerTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            if (destroyed || !visualizerPlaying || !row.mapped || prefersReducedMotion()) {
                visualizerTimerId = 0;
                visualizer.visible = false;
                resetVisualizer();
                return GLib.SOURCE_REMOVE;
            }
            for (const bar of visualizerBars) {
                try { bar.height = 4 + Math.floor(Math.random() * 13); } catch (e) {}
            }
            return GLib.SOURCE_CONTINUE;
        });
    };
    if (visualizer) {
        row.connect('notify::mapped', () => {
            if (row.mapped)
                startVisualizer();
            else
                stopVisualizer();
        });
    }
    const clearCtl = () => {
        try { ctl?.destroy(); } catch (e) {}
        ctl = null;
        attachedBusName = null;
    };

    const attach = busName => {
        const generation = ++playerGeneration;
        stopPositionPolling();
        clearCtl();
        attachedBusName = busName || null;
        if (!busName) {
            row.visible = false;
            refreshQuickSettingsChrome();
            titleLabel.text = 'No media';
            artistLabel.text = '';
            if (albumLabel) {
                albumLabel.text = '';
                albumLabel.visible = false;
            }
            if (playbackLabel)
                playbackLabel.text = 'No player';
            visualizerPlaying = false;
            stopVisualizer();
            setArtFromUrl(artIcon, null, detailed ? 88 : 40);
            durationUs = 0;
            currentPositionUs = 0;
            updateDetailedProgress(0);
            stopPositionPolling();
            return;
        }
        row.visible = true;
        titleLabel.text = 'Connecting…';
        artistLabel.text = '';
        if (albumLabel) {
            albumLabel.text = '';
            albumLabel.visible = false;
        }
        if (playbackLabel)
            playbackLabel.text = 'Connecting to player';
        bindPlayer(busName, {
            onMeta: ({title, artist, album, artUrl, lengthUs}) => {
                if (destroyed || generation !== playerGeneration)
                    return;
                durationUs = Math.max(0, Number(lengthUs) || 0);
                updateDetailedProgress(currentPositionUs);
                row.visible = true;
                refreshQuickSettingsChrome();
                titleLabel.text = title || 'Media';
                artistLabel.text = artist || 'Unknown artist';
                if (albumLabel) {
                    albumLabel.text = album || '';
                    albumLabel.visible = Boolean(album);
                }
                setArtFromUrl(artIcon, artUrl, detailed ? 88 : 40);
            },
            onPosition: updateDetailedProgress,
            onStatus: playing => {
                if (destroyed || generation !== playerGeneration)
                    return;
                row.visible = true;
                visualizerPlaying = playing === true;
                if (playbackLabel)
                    playbackLabel.text = playing ? 'Playing' : 'Paused';
                if (playing)
                    startVisualizer();
                else
                    stopVisualizer();
                try {
                    playBtn.child.icon_name = playing
                        ? 'media-playback-pause-symbolic'
                        : 'media-playback-start-symbolic';
                    setChipA11y(playBtn, playing ? 'Play or pause, playing' : 'Play or pause, paused');
                } catch (e) {}
            },
            onReady: c => {
                if (destroyed || generation !== playerGeneration) {
                    try { c?.destroy(); } catch (e) {}
                    return;
                }
                ctl = c;
                if (detailed) {
                    ctl.getPosition?.(updateDetailedProgress);
                    if (!positionTimerId) {
                        positionTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                            if (!row.get_stage() || !attachedBusName || !ctl) {
                                positionTimerId = 0;
                                return GLib.SOURCE_REMOVE;
                            }
                            ctl.getPosition?.(updateDetailedProgress);
                            return GLib.SOURCE_CONTINUE;
                        });
                    }
                }
            },
            onGone: () => {
                if (destroyed || generation !== playerGeneration)
                    return;
                if (attachedBusName === busName) {
                    clearCtl();
                    stopPositionPolling();
                    visualizerPlaying = false;
                    stopVisualizer();
                    row.visible = false;
                }
            },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    const stopWatching = watchPreferredPlayer((name, players) => {
        updatePlayerChoices(name, players);
        if (name !== attachedBusName)
            attach(name);
    });
    selectPreferredPlayer = stopWatching.select;
    row.connect('destroy', () => {
        destroyed = true;
        stopWatching();
        stopPositionPolling();
        stopVisualizer();
        try { menuClose(playerMenu); playerMenu?.destroy(); } catch (e) {}
        clearCtl();
    });
    return row;
}

/** Panel chip + popup controls */
export function buildMedia(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-media',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { box.style = 'spacing: 6px;'; } catch (e) {}

    const icon = new St.Icon({
        style_class: 'material-panel-media-icon',
        icon_size: Math.round(16 * scale),
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        const g = giconForKey('media-play', false);
        if (g)
            icon.gicon = g;
        else
            icon.icon_name = 'audio-x-generic-symbolic';
    } catch (e) {
        icon.icon_name = 'audio-x-generic-symbolic';
    }
    const label = new St.Label({
        text: 'No media',
        style_class: 'material-panel-media-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    } catch (e) {}
    const visualizerEnabled = isMediaVisualizerEnabled();
    const visualizer = visualizerEnabled
        ? new St.BoxLayout({
            style_class: 'material-panel-media-visualizer',
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
        })
        : null;
    const visualizerBars = [];
    if (visualizer) {
        try { visualizer.style = 'spacing: 2px; width: 22px; height: 16px;'; } catch (e) {}
        const heights = [5, 9, 6, 12, 7];
        const color = getThemeColor('primary', '#89b4fa');
        for (const height of heights) {
            const bar = new St.Widget({width: 3, height});
            try { bar.style = `background-color: ${color}; border-radius: 2px;`; } catch (e) {}
            visualizer.add_child(bar);
            visualizerBars.push(bar);
        }
        visualizer.visible = false;
    }
    box.add_child(icon);
    box.add_child(label);
    if (visualizer)
        box.add_child(visualizer);

    const button = new St.Button({
        style_class: 'material-panel-media-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
    });
    const autoHideWhenInactive = isMediaAutoHideEnabled();
    button.visible = !autoHideWhenInactive;
    let visualizerPlaying = false;
    let visualizerTimerId = 0;
    const resetVisualizer = () => {
        const heights = [5, 9, 6, 12, 7];
        visualizerBars.forEach((bar, index) => {
            try { bar.height = heights[index]; } catch (e) {}
        });
    };
    const stopVisualizer = () => {
        if (visualizerTimerId) {
            try { GLib.source_remove(visualizerTimerId); } catch (e) {}
            visualizerTimerId = 0;
        }
        if (visualizer) {
            visualizer.visible = false;
            resetVisualizer();
        }
    };
    const startVisualizer = () => {
        if (!visualizer || !visualizerPlaying || !button.mapped)
            return;
        if (prefersReducedMotion()) {
            stopVisualizer();
            return;
        }
        visualizer.visible = true;
        if (visualizerTimerId)
            return;
        visualizerTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            if (!visualizerPlaying || !button.mapped || prefersReducedMotion()) {
                visualizerTimerId = 0;
                visualizer.visible = false;
                resetVisualizer();
                return GLib.SOURCE_REMOVE;
            }
            for (const bar of visualizerBars) {
                try { bar.height = 4 + Math.floor(Math.random() * 13); } catch (e) {}
            }
            return GLib.SOURCE_CONTINUE;
        });
    };
    button.connect('notify::mapped', () => {
        if (button.mapped)
            startVisualizer();
        else
            stopVisualizer();
    });
    let currentTrackTitle = 'No media';
    let currentPlaybackState = 'paused';
    const updateMediaChipA11y = () => {
        const track = currentTrackTitle.length > 80
            ? currentTrackTitle.slice(0, 77) + '…'
            : currentTrackTitle;
        setChipA11y(button, currentTrackTitle === 'No media'
            ? 'Media, no media'
            : `Media: ${track}, ${currentPlaybackState}`);
    };
    try {
        button.style = `max-width: ${Math.round(160 * scale)}px;`;
    } catch (e) {}

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-media-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    menu.connect('open-state-changed', (_menu, open) => {
        if (open) {
            pollPosition();
            if (!progressTimerId) {
                progressTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                    if (!menu.isOpen) {
                        progressTimerId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    pollPosition();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        } else if (progressTimerId) {
            GLib.source_remove(progressTimerId);
            progressTimerId = 0;
        }
    });


    const body = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-media-popup-body',
    });
    try { body.style = 'spacing: 10px; padding: 4px; min-width: 220px;'; } catch (e) {}

    const head = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-popup-card',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { head.style = 'spacing: 12px; padding: 10px 12px;'; } catch (e) {}

    const art = new St.Bin({
        width: 48,
        height: 48,
        style_class: 'material-panel-media-popup-art',
    });
    const textCol = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    try { textCol.style = 'spacing: 4px;'; } catch (e) {}
    const pTitle = new St.Label({
        text: 'No media',
        style_class: 'material-panel-media-popup-title',
        x_expand: true,
    });
    try { pTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END; } catch (e) {}
    const pArtist = new St.Label({
        text: '',
        style_class: 'material-panel-media-popup-artist',
        x_expand: true,
    });
    try { pArtist.clutter_text.ellipsize = Pango.EllipsizeMode.END; } catch (e) {}
    textCol.add_child(pTitle);
    textCol.add_child(pArtist);
    head.add_child(art);
    head.add_child(textCol);
    body.add_child(head);

    const noMediaState = createStatusState({
        message: 'No media player is active. Open a player that supports MPRIS to see playback controls here.',
        iconName: 'media-playback-start-symbolic',
        styleClass: 'material-panel-media-empty-state',
        labelStyleClass: 'material-panel-media-popup-artist',
        iconSize: 20,
        style: 'spacing: 10px; padding: 8px 10px; border-radius: 10px;',
    });
    body.add_child(noMediaState.actor);

    const progressSlider = new PopupMenu.PopupSliderMenuItem(0);
    progressSlider.actor.visible = false;
    const timeLabel = new St.Label({
        text: '0:00 / 0:00',
        style_class: 'material-panel-media-popup-time',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const progressRow = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-media-popup-progress',
        x_expand: true,
    });
    progressRow.add_child(progressSlider.actor);
    progressRow.add_child(timeLabel);
    body.add_child(progressRow);

    const controls = new St.BoxLayout({
        style_class: 'material-panel-popup-card material-panel-media-popup-controls',
        x_align: Clutter.ActorAlign.CENTER,
    });
    try { controls.style = 'spacing: 8px; padding: 8px;'; } catch (e) {}

    const mk = iconName => {
        const b = new St.Button({
            style_class: 'material-panel-media-popup-btn',
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
        const ic = new St.Icon({icon_name: iconName, icon_size: 20});
        try { tintSymbolic(ic, primaryColor()); } catch (e) {}
        b.set_child(ic);
        b.connect('button-press-event', () => {
            try { tintSymbolic(ic, onPrimaryColor()); } catch (e) {}
            return Clutter.EVENT_PROPAGATE;
        });
        b.connect('button-release-event', () => {
            try { tintSymbolic(ic, primaryColor()); } catch (e) {}
            return Clutter.EVENT_PROPAGATE;
        });
        return b;
    };
    const prevBtn = mk('media-skip-backward-symbolic');
    const playBtn = mk('media-playback-start-symbolic');
    const nextBtn = mk('media-skip-forward-symbolic');
    setChipA11y(prevBtn, 'Previous track');
    setChipA11y(playBtn, 'Play or pause, paused');
    setChipA11y(nextBtn, 'Next track');
    controls.add_child(prevBtn);
    controls.add_child(playBtn);
    controls.add_child(nextBtn);
    body.add_child(controls);
    controls.visible = false;

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const playerMenuItem = new PopupMenu.PopupSubMenuMenuItem('Player', false);
    playerMenuItem.actor.visible = false;
    menu.addMenuItem(playerMenuItem);
    let playerChoices = [];
    let playerNamesSignature = '';

    let ctl = null;
    let attachedBusName = null;
    let durationUs = 0;
    let trackId = '';
    let currentPositionUs = 0;
    let canSeek = false;
    let updatingProgress = false;
    let progressTimerId = 0;
    const updateProgressUi = positionUs => {
        currentPositionUs = Math.max(0, Math.min(durationUs || Number.MAX_SAFE_INTEGER, Number(positionUs) || 0));
        if (durationUs <= 0) {
            progressSlider.actor.visible = false;
            timeLabel.text = '—:— / —:—';
            return;
        }
        progressSlider.actor.visible = canSeek;
        updatingProgress = true;
        try { progressSlider.setValue(Math.max(0, Math.min(1, currentPositionUs / durationUs))); } catch (e) {}
        updatingProgress = false;
        timeLabel.text = formatMediaTime(currentPositionUs) + ' / ' + formatMediaTime(durationUs);
    };
    const pollPosition = () => {
        if (ctl?.getPosition)
            ctl.getPosition(updateProgressUi);
    };
    progressSlider.connect('value-changed', (_item, value) => {
        if (updatingProgress || !canSeek || durationUs <= 0 || !ctl?.setPosition)
            return;
        const target = Math.max(0, Math.min(1, Number(value) || 0)) * durationUs;
        ctl.setPosition(target, trackId);
        updateProgressUi(target);
    });
    const setPlayingUi = playing => {
        visualizerPlaying = !!playing;
        if (visualizerPlaying)
            startVisualizer();
        else
            stopVisualizer();
        try {
            playBtn.child.icon_name = playing
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            setChipA11y(playBtn, playing ? 'Play or pause, playing' : 'Play or pause, paused');
        } catch (e) {}
        try {
            const key = playing ? 'media-pause' : 'media-play';
            const g = giconForKey(key, false);
            if (g)
                icon.gicon = g;
            else
                icon.icon_name = playing
                    ? 'media-playback-pause-symbolic'
                    : 'audio-x-generic-symbolic';
        } catch (e) {}
    };

    const attach = busName => {
        clearCtl();
        attachedBusName = busName || null;
        if (!busName) {
            button.visible = !autoHideWhenInactive;
            durationUs = 0;
            trackId = '';
            currentPositionUs = 0;
            canSeek = false;
            updateProgressUi(0);
            noMediaState.setMessage('No media player is active. Open a player that supports MPRIS to see playback controls here.');
            controls.visible = false;
            progressRow.visible = false;
            label.text = 'No media';
            pTitle.text = 'No media';
            pArtist.text = '';
            currentTrackTitle = 'No media';
            currentPlaybackState = 'paused';
            updateMediaChipA11y();
            setPlayingUi(false);
            return;
        }
        noMediaState.setMessage('');
        controls.visible = true;
        progressRow.visible = true;
        bindPlayer(busName, {
            onMeta: ({title, artist, artUrl, trackId: nextTrackId, lengthUs}) => {
                durationUs = Math.max(0, Number(lengthUs) || 0);
                trackId = nextTrackId || '';
                updateProgressUi(currentPositionUs);
                const t = title || 'Media';
                currentTrackTitle = title || 'Unknown track';
                label.text = t.length > 22 ? `${t.slice(0, 20)}…` : t;
                pTitle.text = title || 'Unknown';
                pArtist.text = artist || '';
                updateMediaChipA11y();
                try { setArtFromUrl(art, artUrl); } catch (e) {}
            },
            onStatus: playing => {
                currentPlaybackState = playing ? 'playing' : 'paused';
                updateMediaChipA11y();
                setPlayingUi(!!playing);
                if (playing && menu.isOpen)
                    pollPosition();
            },
            onPosition: updateProgressUi,
            onCanSeek: value => {
                canSeek = value;
                updateProgressUi(currentPositionUs);
            },
            currentPosition: () => currentPositionUs,
            onReady: c => {
                ctl = c;
                pollPosition();
            },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    let selectPreferredPlayer = null;
    const playerDisplayName = name => String(name || '')
        .replace(MPRIS_PREFIX, '')
        .replace(/[-_]/g, ' ');
    const updatePlayerChoices = (selectedName, players = []) => {
        const signature = players.join('|');
        if (signature !== playerNamesSignature) {
            for (const choice of playerChoices) {
                try { playerMenuItem.menu.removeMenuItem(choice.item); } catch (e) {}
            }
            playerChoices = [];
            playerNamesSignature = signature;
            for (const name of players) {
                const choice = new PopupMenu.PopupMenuItem(playerDisplayName(name));
                choice.connect('activate', () => {
                    selectPreferredPlayer?.(name);
                    if (menu.isOpen)
                        menuClose(menu);
                });
                playerMenuItem.menu.addMenuItem(choice);
                playerChoices.push({name, item: choice});
            }
        }
        playerMenuItem.actor.visible = players.length > 1;
        playerMenuItem.label.text = players.length > 1
            ? 'Player: ' + playerDisplayName(selectedName)
            : 'Player';
        for (const choice of playerChoices) {
            try {
                choice.item.setOrnament(choice.name === selectedName
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE);
            } catch (e) {}
        }
    };
    const stopWatching = watchPreferredPlayer((name, players) => {
        updatePlayerChoices(name, players);
        if (name !== attachedBusName)
            attach(name);
    });
    selectPreferredPlayer = stopWatching.select;

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        stopWatching();
        stopVisualizer();
        if (progressTimerId) {
            try { GLib.source_remove(progressTimerId); } catch (e) {}
            progressTimerId = 0;
        }
        clearCtl();
        try { menu.destroy(); } catch (e) {}
    });

    try {
        wireChipPress(button, {
            stickyUntilLeave: true,
            getIcons: () => [{icon, key: label.text === 'No media' ? 'media-play' : 'media-pause'}],
        });
    } catch (e) {}
    try { updateMediaChipA11y(); } catch (e) {}
    return button;
}
