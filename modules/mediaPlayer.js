import {setChipA11y} from '../lib/a11y.js';
import {wireChipPress, giconForKey, tintSymbolic, primaryColor, onPrimaryColor} from '../lib/pressFx.js';

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';


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
                    hooks.onMeta?.({title, artist, artUrl, busName: name});
                } catch (e) {}
            };
            const applyStatus = variant => {
                try {
                    const st = variant.deep_unpack();
                    hooks.onStatus?.(st === 'Playing');
                } catch (e) {}
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
            });

            hooks.onReady?.({
                player,
                destroy: () => {
                    try { propsProxy.disconnect(sigId); } catch (e) {}
                },
                previous: () => player.call('Previous', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
                playPause: () => player.call('PlayPause', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
                next: () => player.call('Next', null, Gio.DBusCallFlags.NONE, -1, null, () => {}),
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

    const choose = () => {
        if (destroyed)
            return;
        const revision = ++selectionRevision;
        const candidates = [...names];
        if (candidates.length === 0) {
            callback(null);
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
                        callback(playing || fallback);
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

    return () => {
        if (destroyed)
            return;
        destroyed = true;
        selectionRevision++;
        dbus.signal_unsubscribe(ownerSignalId);
        dbus.signal_unsubscribe(statusSignalId);
    };
}

/** QS media card */
export function buildMediaPlayerRow() {
    const row = new St.BoxLayout({
        style_class: 'material-panel-qs-media',
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });
    try {
        // Cap width so long titles cannot stretch the QS menu
        row.style = 'spacing: 10px; padding: 8px 10px; border-radius: 16px; max-width: 360px;';
    } catch (e) {}

    const artIcon = new St.Bin({
        style_class: 'material-panel-qs-media-art',
        width: 40,
        height: 40,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { artIcon.style = 'border-radius: 10px;'; } catch (e) {}

    const textCol = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { textCol.style = 'spacing: 2px;'; } catch (e) {}
    const titleLabel = new St.Label({
        text: 'No media',
        style_class: 'material-panel-qs-media-title',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    try {
        titleLabel.clutter_text.max_width_chars = 28;
        titleLabel.style = 'max-width: 180px;';
    } catch (e) {}
    const artistLabel = new St.Label({
        text: '',
        style_class: 'material-panel-qs-media-artist',
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
    });
    artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    try {
        artistLabel.clutter_text.max_width_chars = 28;
        artistLabel.style = 'max-width: 180px;';
    } catch (e) {}
    textCol.add_child(titleLabel);
    textCol.add_child(artistLabel);

    const controls = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'material-panel-qs-media-controls',
    });
    try { controls.style = 'spacing: 4px;'; } catch (e) {}
    const mk = name => {
        const b = new St.Button({
            style_class: 'material-panel-qs-media-btn',
            reactive: true,
            track_hover: true,
        });
        b.set_child(new St.Icon({icon_name: name, icon_size: 16}));
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

    row.add_child(artIcon);
    row.add_child(textCol);
    row.add_child(controls);

    let ctl = null;
    let attachedBusName = null;
    const clearCtl = () => {
        try { ctl?.destroy(); } catch (e) {}
        ctl = null;
        attachedBusName = null;
    };

    const attach = busName => {
        clearCtl();
        attachedBusName = busName || null;
        if (!busName) {
            row.visible = false;
            try { globalThis._materialPanelQsRechrome?.(); } catch (e) {}
            titleLabel.text = 'No media';
            artistLabel.text = '';
            setArtFromUrl(artIcon, null, 40);
            return;
        }
        bindPlayer(busName, {
            onMeta: ({title, artist, artUrl}) => {
                row.visible = true;
            try { globalThis._materialPanelQsRechrome?.(); } catch (e) {}
                titleLabel.text = title || 'Media';
                artistLabel.text = artist || '';
                setArtFromUrl(artIcon, artUrl, 40);
            },
            onStatus: playing => {
                row.visible = true;
                try {
                    playBtn.child.icon_name = playing
                        ? 'media-playback-pause-symbolic'
                        : 'media-playback-start-symbolic';
                    setChipA11y(playBtn, playing ? 'Play or pause, playing' : 'Play or pause, paused');
                } catch (e) {}
            },
            onReady: c => { ctl = c; },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    const stopWatching = watchPreferredPlayer(name => {
        if (name !== attachedBusName)
            attach(name);
    });
    row.connect('destroy', () => {
        stopWatching();
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
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-media-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
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

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    let ctl = null;
    let attachedBusName = null;
    const clearCtl = () => {
        try { ctl?.destroy(); } catch (e) {}
        ctl = null;
        attachedBusName = null;
    };

    const setPlayingUi = playing => {
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
            label.text = 'No media';
            pTitle.text = 'No media';
            pArtist.text = '';
            currentTrackTitle = 'No media';
            currentPlaybackState = 'paused';
            updateMediaChipA11y();
            setPlayingUi(false);
            return;
        }
        bindPlayer(busName, {
            onMeta: ({title, artist, artUrl}) => {
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
                setChipA11y(playBtn, playing ? 'Play or pause, playing' : 'Play or pause, paused');
                updateMediaChipA11y();
                setPlayingUi(!!playing);
            },
            onReady: c => { ctl = c; },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    const stopWatching = watchPreferredPlayer(name => {
        if (name !== attachedBusName)
            attach(name);
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        stopWatching();
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
