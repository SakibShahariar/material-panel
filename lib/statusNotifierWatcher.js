/**
 * Built-in StatusNotifier / AppIndicator watcher.
 * Replaces gnome-shell-extension-appindicator for background app tray icons.
 *
 * Protocol: org.kde.StatusNotifierWatcher + org.kde.StatusNotifierItem
 * Disable the system AppIndicator extension first — only one watcher can own the name.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Cogl from 'gi://Cogl';

const WATCHER_NAME = 'org.kde.StatusNotifierWatcher';
const WATCHER_PATH = '/StatusNotifierWatcher';
const WATCHER_IFACE = 'org.kde.StatusNotifierWatcher';
const ITEM_IFACE = 'org.kde.StatusNotifierItem';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const WATCHER_XML = `
<node>
  <interface name="org.kde.StatusNotifierWatcher">
    <method name="RegisterStatusNotifierItem">
      <arg type="s" direction="in"/>
    </method>
    <method name="RegisterStatusNotifierHost">
      <arg type="s" direction="in"/>
    </method>
    <property name="RegisteredStatusNotifierItems" type="as" access="read"/>
    <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
    <property name="ProtocolVersion" type="i" access="read"/>
    <signal name="StatusNotifierItemRegistered">
      <arg type="s" direction="out"/>
    </signal>
    <signal name="StatusNotifierItemUnregistered">
      <arg type="s" direction="out"/>
    </signal>
    <signal name="StatusNotifierHostRegistered"/>
  </interface>
</node>`;

function parseItemId(serviceOrPath) {
    // "org.kde.StatusNotifierItem-123-1" or ":1.42/StatusNotifierItem"
    const s = String(serviceOrPath || '');
    if (s.startsWith('/') || s.includes('/')) {
        // path only — need bus name from elsewhere
        return {busName: null, objectPath: s.startsWith('/') ? s : `/${s}`};
    }
    if (s.includes('/')) {
        const i = s.indexOf('/');
        return {busName: s.slice(0, i), objectPath: s.slice(i)};
    }
    // service name only — conventional path
    return {
        busName: s,
        objectPath: '/StatusNotifierItem',
    };
}

function variantToJs(v) {
    try {
        if (v == null)
            return null;
        if (v instanceof GLib.Variant)
            return v.deep_unpack();
        return v;
    } catch (e) {
        return null;
    }
}

/**
 * One tray icon for a StatusNotifierItem.
 */
class TrayItem {
    constructor(watcher, busName, objectPath, id) {
        this._watcher = watcher;
        this.busName = busName;
        this.objectPath = objectPath;
        this.id = id;
        this.proxy = null;
        this.propsProxy = null;
        this.button = null;
        this._icon = null;
        this._title = '';
        this._destroyed = false;
    }

    start() {
        Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.NONE,
            null,
            this.busName,
            this.objectPath,
            ITEM_IFACE,
            null,
            (_o, res) => {
                if (this._destroyed)
                    return;
                try {
                    this.proxy = Gio.DBusProxy.new_finish(res);
                } catch (e) {
                    logError(e, `material-panel: SNI proxy ${this.id}`);
                    this._watcher._dropItem(this.id);
                    return;
                }
                Gio.DBusProxy.new(
                    Gio.DBus.session,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    this.busName,
                    this.objectPath,
                    PROPS_IFACE,
                    null,
                    (_o2, res2) => {
                        if (this._destroyed)
                            return;
                        try {
                            this.propsProxy = Gio.DBusProxy.new_finish(res2);
                        } catch (e) {}
                        this._buildUi();
                        this._refresh();
                        try {
                            this.proxy.connect('g-signal', (_p, _sender, signal) => {
                                if (signal === 'NewIcon' || signal === 'NewAttentionIcon' ||
                                    signal === 'NewStatus' || signal === 'NewTitle' ||
                                    signal === 'NewOverlayIcon')
                                    this._refresh();
                            });
                        } catch (e) {}
                    });
            });
    }

    _getProp(name) {
        try {
            if (this.proxy) {
                const v = this.proxy.get_cached_property(name);
                if (v)
                    return variantToJs(v);
            }
        } catch (e) {}
        try {
            if (this.propsProxy) {
                const result = this.propsProxy.call_sync(
                    'Get',
                    new GLib.Variant('(ss)', [ITEM_IFACE, name]),
                    Gio.DBusCallFlags.NONE,
                    800,
                    null);
                const [val] = result.deep_unpack();
                return variantToJs(val);
            }
        } catch (e) {}
        return null;
    }

    _buildUi() {
        this.button = new St.Button({
            style_class: 'material-panel-chip material-panel-sni material-panel-foreign',
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this.button.style = 'padding: 2px 6px; border-radius: 999px;';
        } catch (e) {}
        this._icon = new St.Icon({
            style_class: 'material-panel-sni-icon',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
            icon_name: 'application-x-executable-symbolic',
        });
        this.button.set_child(this._icon);
        this.button.connect('button-press-event', (_a, event) => {
            const btn = event.get_button();
            try {
                if (btn === 1)
                    this._activate();
                else if (btn === 2)
                    this._secondaryActivate();
                else if (btn === 3)
                    this._contextMenu(event);
            } catch (e) {
                logError(e, 'material-panel: SNI click');
            }
            return Clutter.EVENT_STOP;
        });
        this._watcher._hostItem(this);
    }

    _refresh() {
        if (this._destroyed || !this.button)
            return;
        try {
            this._title = String(this._getProp('Title') || this._getProp('Id') || 'App');
            this.button.accessible_name = this._title;
        } catch (e) {}

        // Prefer IconName, then IconPixmap
        let set = false;
        try {
            const name = this._getProp('IconName');
            if (name && typeof name === 'string' && name.length) {
                this._icon.icon_name = name;
                this._icon.gicon = null;
                set = true;
            }
        } catch (e) {}
        if (!set) {
            try {
                const pix = this._getProp('IconPixmap');
                // a(iiay) — array of (width, height, pixels)
                if (pix && pix.length) {
                    // pick largest
                    let best = pix[0];
                    for (const p of pix) {
                        if (p[0] * p[1] > best[0] * best[1])
                            best = p;
                    }
                    const [w, h, data] = best;
                    if (w > 0 && h > 0 && data) {
                        const bytes = data instanceof Uint8Array
                            ? data
                            : new Uint8Array(data);
                        // ARGB → GdkPixbuf expects RGBA often; many SNIs send ARGB
                        const gicon = this._pixbufFromArgb(w, h, bytes);
                        if (gicon) {
                            this._icon.gicon = gicon;
                            set = true;
                        }
                    }
                }
            } catch (e) {
                logError(e, 'material-panel: SNI pixmap');
            }
        }
        if (!set) {
            this._icon.icon_name = 'application-x-executable-symbolic';
        }
    }

    _pixbufFromArgb(w, h, bytes) {
        try {
            // Convert ARGB32 to RGBA
            const rgba = new Uint8Array(w * h * 4);
            for (let i = 0; i < w * h; i++) {
                const o = i * 4;
                const a = bytes[o];
                const r = bytes[o + 1];
                const g = bytes[o + 2];
                const b = bytes[o + 3];
                rgba[o] = r;
                rgba[o + 1] = g;
                rgba[o + 2] = b;
                rgba[o + 3] = a;
            }
            const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
                GLib.Bytes.new(rgba),
                GdkPixbuf.Colorspace.RGB,
                true,
                8,
                w,
                h,
                w * 4);
            return pixbuf;
        } catch (e) {
            // Fallback: try raw as RGBA
            try {
                return GdkPixbuf.Pixbuf.new_from_bytes(
                    GLib.Bytes.new(bytes),
                    GdkPixbuf.Colorspace.RGB,
                    true,
                    8,
                    w,
                    h,
                    w * 4);
            } catch (e2) {
                return null;
            }
        }
    }

    _activate() {
        try {
            const [x, y] = global.get_pointer();
            this.proxy.call(
                'Activate',
                new GLib.Variant('(ii)', [x, y]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null);
        } catch (e) {
            logError(e, 'material-panel: SNI Activate');
        }
    }

    _secondaryActivate() {
        try {
            const [x, y] = global.get_pointer();
            this.proxy.call(
                'SecondaryActivate',
                new GLib.Variant('(ii)', [x, y]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null);
        } catch (e) {}
    }

    _contextMenu(event) {
        try {
            const [x, y] = global.get_pointer();
            this.proxy.call(
                'ContextMenu',
                new GLib.Variant('(ii)', [x, y]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null);
        } catch (e) {
            this._activate();
        }
    }

    destroy() {
        this._destroyed = true;
        try {
            if (this.button) {
                const parent = this.button.get_parent();
                if (parent)
                    parent.remove_child(this.button);
                this.button.destroy();
            }
        } catch (e) {}
        this.button = null;
        this.proxy = null;
        this.propsProxy = null;
    }
}

export class StatusNotifierWatcher {
    /**
     * @param {{getHost: () => (null|{add: Function})}} hostProvider
     *   returns tray drawer or a zone-like host with add(actor)
     */
    constructor(hostProvider) {
        this._hostProvider = hostProvider;
        this._items = new Map(); // id -> TrayItem
        this._ownName = null;
        this._exported = null;
        this._busNameWatch = 0;
        this._enabled = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;
        this._exportWatcher();
    }

    disable() {
        this._enabled = false;
        for (const id of [...this._items.keys()])
            this._dropItem(id);
        try {
            if (this._exported) {
                Gio.DBus.session.unregister_object(this._exported);
                this._exported = null;
            }
        } catch (e) {}
        try {
            if (this._filterId) {
                Gio.DBus.session.remove_filter(this._filterId);
                this._filterId = 0;
            }
        } catch (e) {}
        try {
            if (this._ownName) {
                Gio.DBus.session.unown_name(this._ownName);
                this._ownName = null;
            }
        } catch (e) {}
    }

    _exportWatcher() {
        const self = this;
        const ifaceImpl = {
            RegisterStatusNotifierItem(service) {
                self._registerItem(service, null);
            },
            RegisterStatusNotifierHost(_service) {},
            get RegisteredStatusNotifierItems() {
                return [...self._items.keys()];
            },
            get IsStatusNotifierHostRegistered() {
                return true;
            },
            get ProtocolVersion() {
                return 0;
            },
        };

        let iface;
        try {
            iface = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, ifaceImpl);
            iface.export(Gio.DBus.session, WATCHER_PATH);
            this._exported = iface;
        } catch (e) {
            logError(e, 'material-panel: export StatusNotifierWatcher');
            return;
        }

        // Also filter method calls to capture sender when client only passes a path
        try {
            this._methodId = Gio.DBus.session.signal_subscribe(
                null,
                null,
                null,
                null,
                null,
                Gio.DBusSignalFlags.NONE,
                () => {});
            // Use connection filter for RegisterStatusNotifierItem
            this._filterId = Gio.DBus.session.add_filter((conn, message, _inv) => {
                try {
                    if (message.get_path() !== WATCHER_PATH)
                        return Gio.DBusMessage.NONE;
                    if (message.get_interface() !== WATCHER_IFACE)
                        return Gio.DBusMessage.NONE;
                    if (message.get_member() !== 'RegisterStatusNotifierItem')
                        return Gio.DBusMessage.NONE;
                    if (message.get_message_type() !== Gio.DBusMessageType.METHOD_CALL)
                        return Gio.DBusMessage.NONE;
                    const body = message.get_body();
                    const service = body?.deep_unpack?.()?.[0] ?? '';
                    const sender = message.get_sender();
                    self._registerItem(service, sender);
                } catch (e) {}
                return Gio.DBusMessage.NONE; // let normal export also handle reply
            });
        } catch (e) {
            logError(e, 'material-panel: SNI filter');
        }

        this._ownName = Gio.DBus.session.own_name(
            WATCHER_NAME,
            Gio.BusNameOwnerFlags.NONE,
            (_conn, name) => {
                log(`material-panel: acquired ${name} — built-in AppIndicator watcher active`);
                try {
                    iface.emit_signal('StatusNotifierHostRegistered', null);
                } catch (e) {}
            },
            (_conn, name) => {
                log(`material-panel: lost ${name} (is another AppIndicator extension running?)`);
            });
    }

    /**
     * @param {string} service path, bus name, or busname/path
     * @param {string|null} sender unique name from D-Bus message
     */
    _registerItem(service, sender) {
        try {
            let busName = null;
            let objectPath = '/StatusNotifierItem';
            const s = String(service || '');

            if (s.startsWith('/')) {
                busName = sender;
                objectPath = s;
            } else if (s.startsWith(':')) {
                busName = s;
                objectPath = '/StatusNotifierItem';
            } else if (s.includes('/')) {
                const i = s.indexOf('/');
                busName = s.slice(0, i);
                objectPath = s.slice(i);
            } else if (s) {
                busName = s;
                objectPath = '/StatusNotifierItem';
            } else {
                busName = sender;
                objectPath = '/StatusNotifierItem';
            }

            if (!busName) {
                log(`material-panel: SNI register missing bus name (service="${s}")`);
                return;
            }

            const id = `${busName}${objectPath}`;
            if (this._items.has(id))
                return;

            log(`material-panel: SNI register ${id}`);
            const item = new TrayItem(this, busName, objectPath, id);
            this._items.set(id, item);
            item.start();

            try {
                Gio.DBus.session.watch_name(
                    busName,
                    Gio.BusNameWatcherFlags.NONE,
                    null,
                    () => this._dropItem(id));
            } catch (e) {}
        } catch (e) {
            logError(e, 'material-panel: RegisterStatusNotifierItem');
        }
    }

    _hostItem(item) {
        if (!item?.button)
            return;
        const host = this._hostProvider?.() ?? null;
        if (host && typeof host.add === 'function') {
            host.add(item.button);
        } else {
            log('material-panel: SNI item ready but no tray host yet — retry');
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                if (item._destroyed || !item.button)
                    return GLib.SOURCE_REMOVE;
                const h = this._hostProvider?.();
                if (h && typeof h.add === 'function') {
                    h.add(item.button);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _dropItem(id) {
        const item = this._items.get(id);
        if (!item)
            return;
        this._items.delete(id);
        try { item.destroy(); } catch (e) {}
        log(`material-panel: SNI removed ${id}`);
    }
}
