import {wireChipPress, giconForKey, tintSymbolic, primaryColor, onPrimaryColor} from '../lib/pressFx.js';
import {iconPathPrimary} from '../lib/iconTheme.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';

const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';

function listMprisNames() {
    try {
        const dbus = Gio.DBus.session;
        const reply = dbus.call_sync(
            'org.freedesktop.DBus', '/', 'org.freedesktop.DBus',
            'ListNames', null, null, Gio.DBusCallFlags.NONE, -1, null);
        const [names] = reply.deep_unpack();
        return names.filter(n => n.startsWith(MPRIS_PREFIX));
    } catch (e) {
        return [];
    }
}

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
                    hooks.onMeta?.({title, artist, busName: name});
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

function pickPreferredPlayer(callback) {
    const names = listMprisNames();
    if (names.length === 0) {
        callback(null);
        return;
    }
    // Prefer one that is Playing
    let pending = names.length;
    let playing = null;
    let fallback = names[0];
    for (const name of names) {
        makePropsProxy(name, props => {
            if (!props) {
                if (--pending === 0)
                    callback(playing || fallback);
                return;
            }
            props.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'PlaybackStatus']),
                Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                    try {
                        const [v] = p.call_finish(r).deep_unpack();
                        if (v.deep_unpack() === 'Playing')
                            playing = name;
                    } catch (e) {}
                    if (--pending === 0)
                        callback(playing || fallback);
                });
        });
    }
}

/** QS media card */
export function buildMediaPlayerRow() {
    const row = new St.BoxLayout({
        style_class: 'material-panel-qs-media',
        vertical: false,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });
    const titleLabel = new St.Label({
        text: 'No media',
        style_class: 'material-panel-qs-media-title',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    const artistLabel = new St.Label({
        text: '',
        style_class: 'material-panel-qs-media-artist',
        y_align: Clutter.ActorAlign.CENTER,
    });
    artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    artistLabel.visible = false; // compact: title only in QS
    const textCol = new St.BoxLayout({vertical: false, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    textCol.add_child(titleLabel);

    const mkBtn = (iconName) => {
        const b = new St.Button({
            style_class: 'material-panel-qs-media-btn',
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        b.set_child(new St.Icon({icon_name: iconName, icon_size: 16}));
        return b;
    };
    const prevBtn = mkBtn('media-skip-backward-symbolic');
    const playPauseBtn = mkBtn('media-playback-start-symbolic');
    const nextBtn = mkBtn('media-skip-forward-symbolic');

    row.add_child(textCol);
    row.add_child(prevBtn);
    row.add_child(playPauseBtn);
    row.add_child(nextBtn);

    let ctl = null;
    const clearCtl = () => {
        try { ctl?.destroy(); } catch (e) {}
        ctl = null;
    };

    const attach = busName => {
        clearCtl();
        if (!busName) {
            titleLabel.text = 'No media';
            artistLabel.text = '';
            row.visible = false;
            return;
        }
        bindPlayer(busName, {
            onMeta: ({title, artist}) => {
                // Keep one short line in QS
                let t = title || 'Media';
                if (t.length > 40)
                    t = t.slice(0, 39) + '…';
                titleLabel.text = t;
                artistLabel.text = artist || '';
            },
            onStatus: playing => {
                playPauseBtn.child.icon_name = playing
                    ? 'media-playback-pause-symbolic'
                    : 'media-playback-start-symbolic';
                row.visible = !!playing;
            },
            onReady: c => {
                ctl = c;
                prevBtn.connect('clicked', () => c.previous());
                playPauseBtn.connect('clicked', () => c.playPause());
                nextBtn.connect('clicked', () => c.next());
            },
            onGone: () => {
                titleLabel.text = 'No media';
                artistLabel.text = '';
                row.visible = false;
            },
        });
    };

    pickPreferredPlayer(attach);
    const scanId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        pickPreferredPlayer(name => {
            if (!ctl)
                attach(name);
        });
        return GLib.SOURCE_CONTINUE;
    });
    row.connect('destroy', () => {
        clearCtl();
        try { GLib.source_remove(scanId); } catch (e) {}
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
    try {
        button.style = `max-width: ${Math.round(160 * scale)}px;`;
    } catch (e) {}

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-media-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-media-popup-body',
    });
    try { body.style = 'spacing: 10px; padding: 4px; min-width: 220px;'; } catch (e) {}

    const head = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-popup-card',
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { head.style = 'spacing: 12px; padding: 10px 12px;'; } catch (e) {}

    const art = new St.Icon({
        icon_size: 48,
        style_class: 'material-panel-media-popup-art',
        icon_name: 'audio-x-generic-symbolic',
    });
    const textCol = new St.BoxLayout({vertical: true, x_expand: true});
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
    controls.add_child(prevBtn);
    controls.add_child(playBtn);
    controls.add_child(nextBtn);
    body.add_child(controls);

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    let ctl = null;
    const clearCtl = () => {
        try { ctl?.destroy(); } catch (e) {}
        ctl = null;
    };

    const setPlayingUi = playing => {
        try {
            playBtn.child.icon_name = playing
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
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
        if (!busName) {
            label.text = 'No media';
            pTitle.text = 'No media';
            pArtist.text = '';
            setPlayingUi(false);
            return;
        }
        bindPlayer(busName, {
            onMeta: ({title, artist}) => {
                const t = title || 'Media';
                label.text = t.length > 22 ? `${t.slice(0, 20)}…` : t;
                pTitle.text = title || 'Unknown';
                pArtist.text = artist || '';
            },
            onStatus: playing => setPlayingUi(!!playing),
            onReady: c => { ctl = c; },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    pickPreferredPlayer(attach);
    const scanId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
        pickPreferredPlayer(name => {
            if (!ctl || !name)
                attach(name);
        });
        return GLib.SOURCE_CONTINUE;
    });

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            pickPreferredPlayer(attach);
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        clearCtl();
        try { GLib.source_remove(scanId); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    try {
        wireChipPress(button, {
            stickyUntilLeave: true,
            getIcons: () => [{icon, key: label.text === 'No media' ? 'media-play' : 'media-pause'}],
        });
    } catch (e) {}
    return button;
}
