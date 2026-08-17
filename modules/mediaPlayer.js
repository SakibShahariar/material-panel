import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPathPrimary} from '../lib/iconTheme.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';

function findMprisName(callback) {
    Gio.DBusProxy.new_for_bus(
        Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
        'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', null,
        (_s, res) => {
            let bus;
            try {
                bus = Gio.DBusProxy.new_for_bus_finish(res);
            } catch (e) {
                callback(null);
                return;
            }
            bus.call('ListNames', null, Gio.DBusCallFlags.NONE, -1, null, (proxy, r) => {
                try {
                    const [names] = proxy.call_finish(r).deep_unpack();
                    callback(names.find(n => n.startsWith(MPRIS_PREFIX)) ?? null);
                } catch (e) {
                    callback(null);
                }
            });
        });
}

// Only shows/wires up to whichever MPRIS player was active when the popup
// was built - doesn't watch for players starting/stopping after that
// (would need NameOwnerChanged tracking, a reasonable v2 addition). If no
// player is running when the popup opens, the whole row just stays hidden.
export function buildMediaPlayerRow() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-media', x_expand: true});
    row.visible = false;

    const art = new St.Widget({style_class: 'material-panel-qs-media-art'});
    const textBox = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const titleLabel = new St.Label({style_class: 'material-panel-qs-media-title'});
    const subLabel = new St.Label({style_class: 'material-panel-qs-media-sub'});
    textBox.add_child(titleLabel);
    textBox.add_child(subLabel);

    const makeControlBtn = iconKey => new St.Button({
        style_class: 'material-panel-qs-media-btn',
        reactive: true,
        child: new St.Icon({
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(iconKey))),
        }),
    });
    const prevBtn = makeControlBtn('media-prev');
    const playPauseBtn = makeControlBtn('media-play');
    const nextBtn = makeControlBtn('media-next');
    const controls = new St.BoxLayout({style_class: 'material-panel-qs-media-controls'});
    controls.add_child(prevBtn);
    controls.add_child(playPauseBtn);
    controls.add_child(nextBtn);

    row.add_child(art);
    row.add_child(textBox);
    row.add_child(controls);

    findMprisName(busName => {
        if (!busName)
            return;

        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
            busName, '/org/mpris/MediaPlayer2', PLAYER_IFACE, null,
            (_s, res) => {
                let player;
                try {
                    player = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    logError(e, 'material-panel: MPRIS player proxy failed');
                    return;
                }

                const setPlayPauseIcon = playing => {
                    playPauseBtn.get_child().gicon = Gio.FileIcon.new(
                        Gio.File.new_for_path(iconPathPrimary(playing ? 'media-pause' : 'media-play')));
                };

                const updateFromMetadata = metadataVariant => {
                    const meta = metadataVariant.deep_unpack();
                    const title = meta['xesam:title']?.deep_unpack() ?? 'Unknown title';
                    const artistArr = meta['xesam:artist']?.deep_unpack();
                    const artist = Array.isArray(artistArr) && artistArr.length ? artistArr[0] : '';
                    titleLabel.text = title;
                    subLabel.text = artist;
                    row.visible = true;
                };

                // Properties.Get for the two properties we need up front.
                const propsProxy = new Gio.DBusProxy({
                    g_connection: player.get_connection(),
                    g_name: busName,
                    g_object_path: '/org/mpris/MediaPlayer2',
                    g_interface_name: 'org.freedesktop.DBus.Properties',
                });
                propsProxy.init(null);

                propsProxy.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'Metadata']),
                    Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            const [variant] = p.call_finish(r).deep_unpack();
                            updateFromMetadata(variant);
                        } catch (e) {
                            logError(e, 'material-panel: MPRIS Metadata Get failed');
                        }
                    });
                propsProxy.call('Get', new GLib.Variant('(ss)', [PLAYER_IFACE, 'PlaybackStatus']),
                    Gio.DBusCallFlags.NONE, -1, null, (p, r) => {
                        try {
                            const [variant] = p.call_finish(r).deep_unpack();
                            setPlayPauseIcon(variant.deep_unpack() === 'Playing');
                        } catch (e) {
                            logError(e, 'material-panel: MPRIS PlaybackStatus Get failed');
                        }
                    });

                propsProxy.connect('g-signal', (_p, _sender, signal, params) => {
                    if (signal !== 'PropertiesChanged')
                        return;
                    const [iface, changed] = params.deep_unpack();
                    if (iface !== PLAYER_IFACE)
                        return;
                    if ('Metadata' in changed)
                        updateFromMetadata(changed['Metadata']);
                    if ('PlaybackStatus' in changed)
                        setPlayPauseIcon(changed['PlaybackStatus'].deep_unpack() === 'Playing');
                });

                prevBtn.connect('clicked', () => {
                    player.call('Previous', null, Gio.DBusCallFlags.NONE, -1, null, () => {});
                });
                playPauseBtn.connect('clicked', () => {
                    player.call('PlayPause', null, Gio.DBusCallFlags.NONE, -1, null, () => {});
                });
                nextBtn.connect('clicked', () => {
                    player.call('Next', null, Gio.DBusCallFlags.NONE, -1, null, () => {});
                });
            });
    });

    return row;
}
