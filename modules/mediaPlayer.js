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
    const icon = new St.Icon({
        icon_name: 'audio-x-generic-symbolic',
        icon_size: Math.round(16 * (scale || 1.0)),
        style_class: 'material-panel-media-icon',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const label = new St.Label({
        text: 'No media',
        style_class: 'material-panel-media-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    const box = new St.BoxLayout({
        style_class: 'material-panel-media material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });
    label.text = 'No media';
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-media-btn',
        reactive: true,
        track_hover: true,
        child: box,
    });

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-media-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-media-popup-body',
    });
    const hero = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-card',
    });
    const pTitle = new St.Label({
        text: 'No media',
        style_class: 'material-panel-media-popup-title',
        x_align: Clutter.ActorAlign.CENTER,
    });
    pTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    const pArtist = new St.Label({
        text: '',
        style_class: 'material-panel-media-popup-artist',
        x_align: Clutter.ActorAlign.CENTER,
    });
    pArtist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    hero.add_child(pTitle);
    hero.add_child(pArtist);
    body.add_child(hero);

    const controls = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-popup-card material-panel-media-popup-controls',
        x_align: Clutter.ActorAlign.CENTER,
    });
    const mk = iconName => {
        const b = new St.Button({
            style_class: 'material-panel-media-popup-btn',
            reactive: true,
            track_hover: true,
        });
        b.set_child(new St.Icon({icon_name: iconName, icon_size: 20}));
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

    const attach = busName => {
        clearCtl();
        if (!busName) {
            label.text = 'No media';
            pTitle.text = 'No media';
            pArtist.text = '';
            return;
        }
        bindPlayer(busName, {
            onMeta: ({title, artist}) => {
                label.text = title || 'Media';
                pTitle.text = title || 'Unknown';
                pArtist.text = artist || '';
            },
            onStatus: playing => {
                playBtn.child.icon_name = playing
                    ? 'media-playback-pause-symbolic'
                    : 'media-playback-start-symbolic';
                icon.icon_name = playing
                    ? 'media-playback-pause-symbolic'
                    : 'audio-x-generic-symbolic';
            },
            onReady: c => {
                ctl = c;
            },
        });
    };

    prevBtn.connect('clicked', () => ctl?.previous());
    playBtn.connect('clicked', () => ctl?.playPause());
    nextBtn.connect('clicked', () => ctl?.next());

    pickPreferredPlayer(attach);
    const scanId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        pickPreferredPlayer(name => {
            if (!ctl)
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
        menu.destroy();
    });

    return button;
}
