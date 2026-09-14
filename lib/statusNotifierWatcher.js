/**
 * Built-in StatusNotifier watcher (optional AppIndicator replacement).
 * Keep defensive: never throw into the shell; bad items are dropped.
 *
 * If qBittorrent/other apps crash on start, disable via config:
 *   statusNotifier: false
 * and re-enable system AppIndicator extension instead.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

const WATCHER_NAME = 'org.kde.StatusNotifierWatcher';
const WATCHER_PATH = '/StatusNotifierWatcher';
const WATCHER_IFACE = 'org.kde.StatusNotifierWatcher';
const ITEM_IFACE = 'org.kde.StatusNotifierItem';

const WATCHER_XML = `
<node>
  <interface name="org.kde.StatusNotifierWatcher">
    <method name="RegisterStatusNotifierItem">
      <arg name="service" type="s" direction="in"/>
    </method>
    <method name="RegisterStatusNotifierHost">
      <arg name="service" type="s" direction="in"/>
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

function unpack(v) {
    try {
        if (v == null) return null;
        if (v instanceof GLib.Variant) return v.deep_unpack();
        return v;
    } catch (e) {
        return null;
    }
}

class TrayItem {
    constructor(watcher, busName, objectPath, id) {
        this._watcher = watcher;
        this.busName = busName;
        this.objectPath = objectPath;
        this.id = id;
        this.proxy = null;
        this.button = null;
        this._icon = null;
        this._destroyed = false;
        this._nameWatch = 0;
    }

    start() {
        try {
            Gio.DBusProxy.new(
                Gio.DBus.session,
                Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
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
                    try {
                        this._buildUi();
                        this._refresh();
                        this.proxy.connect('g-properties-changed', () => {
                            try { this._refresh(); } catch (e) {}
                        });
                        this.proxy.connect('g-signal', (_p, _s, signal) => {
                            if (/^New/.test(signal)) {
                                try { this._refresh(); } catch (e) {}
                            }
                        });
                    } catch (e) {
                        logError(e, 'material-panel: SNI item UI');
                        this._watcher._dropItem(this.id);
                    }
                });
        } catch (e) {
            logError(e, 'material-panel: SNI start');
            this._watcher._dropItem(this.id);
        }
    }

    _prop(name) {
        try {
            return unpack(this.proxy?.get_cached_property(name));
        } catch (e) {
            return null;
        }
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
            try {
                const b = event.get_button();
                if (b === 1)
                    this._call('Activate');
                else if (b === 2)
                    this._call('SecondaryActivate');
                else if (b === 3)
                    this._call('ContextMenu');
            } catch (e) {}
            return Clutter.EVENT_STOP;
        });
        this._watcher._hostItem(this);
    }

    _refresh() {
        if (this._destroyed || !this._icon)
            return;
        try {
            const title = this._prop('Title') || this._prop('Id') || 'App';
            this.button.accessible_name = String(title);
        } catch (e) {}
        try {
            const name = this._prop('IconName') || this._prop('AttentionIconName');
            if (name && String(name).length) {
                this._icon.icon_name = String(name);
                return;
            }
        } catch (e) {}
        this._icon.icon_name = 'application-x-executable-symbolic';
    }

    _call(method) {
        if (!this.proxy)
            return;
        try {
            const [x, y] = global.get_pointer();
            this.proxy.call(
                method,
                new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]),
                Gio.DBusCallFlags.NONE,
                2000,
                null,
                null);
        } catch (e) {}
    }

    destroy() {
        this._destroyed = true;
        try {
            if (this.button) {
                const p = this.button.get_parent();
                if (p)
                    p.remove_child(this.button);
                this.button.destroy();
            }
        } catch (e) {}
        this.button = null;
        this.proxy = null;
    }
}

export class StatusNotifierWatcher {
    constructor(hostProvider) {
        this._hostProvider = hostProvider;
        this._items = new Map();
        this._ownName = 0;
        this._exported = null;
        this._enabled = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;
        try {
            this._exportWatcher();
        } catch (e) {
            logError(e, 'material-panel: SNI enable failed');
            this._enabled = false;
        }
    }

    disable() {
        this._enabled = false;
        for (const id of [...this._items.keys()])
            this._dropItem(id);
        try {
            if (this._exported) {
                this._exported.unexport();
                this._exported = null;
            }
        } catch (e) {
            try {
                Gio.DBus.session.unregister_object?.(this._exported);
            } catch (e2) {}
            this._exported = null;
        }
        try {
            if (this._ownName) {
                Gio.DBus.session.unown_name(this._ownName);
                this._ownName = 0;
            }
        } catch (e) {}
    }

    _exportWatcher() {
        const self = this;
        const impl = {
            RegisterStatusNotifierItem(service) {
                // Called by Gio.DBusExportedObject — always reply OK to avoid killing clients
                try {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        try {
                            self._registerItem(String(service || ''), null);
                        } catch (e) {
                            logError(e, 'material-panel: SNI register');
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                } catch (e) {
                    logError(e, 'material-panel: SNI RegisterStatusNotifierItem');
                }
            },
            RegisterStatusNotifierHost(_service) {},
            get RegisteredStatusNotifierItems() {
                try {
                    return [...self._items.keys()];
                } catch (e) {
                    return [];
                }
            },
            get IsStatusNotifierHostRegistered() {
                return true;
            },
            get ProtocolVersion() {
                return 0;
            },
        };

        const iface = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, impl);
        iface.export(Gio.DBus.session, WATCHER_PATH);
        this._exported = iface;

        this._ownName = Gio.DBus.session.own_name(
            WATCHER_NAME,
            Gio.BusNameOwnerFlags.NONE,
            (_c, name) => {
                log(`material-panel: acquired ${name}`);
                try {
                    iface.emit_signal('StatusNotifierHostRegistered', null);
                } catch (e) {}
            },
            (_c, name) => {
                log(`material-panel: lost ${name}`);
            });
    }

    _registerItem(service, sender) {
        let busName = null;
        let objectPath = '/StatusNotifierItem';
        const s = String(service || '');

        if (s.startsWith('/')) {
            // Path only — without sender we cannot connect; ignore safely
            if (!sender) {
                log(`material-panel: SNI path-only "${s}" ignored (no sender)`);
                return;
            }
            busName = sender;
            objectPath = s;
        } else if (s.startsWith(':')) {
            busName = s;
        } else if (s.includes('/')) {
            const i = s.indexOf('/');
            busName = s.slice(0, i);
            objectPath = s.slice(i);
        } else if (s) {
            busName = s;
        } else {
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
    }

    _hostItem(item) {
        if (!item?.button)
            return;
        const tryHost = () => {
            const host = this._hostProvider?.() ?? null;
            if (host && typeof host.add === 'function') {
                try {
                    host.add(item.button);
                    return true;
                } catch (e) {
                    logError(e, 'material-panel: SNI host add');
                }
            }
            return false;
        };
        if (tryHost())
            return;
        let tries = 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (item._destroyed)
                return GLib.SOURCE_REMOVE;
            if (tryHost() || ++tries > 10)
                return GLib.SOURCE_REMOVE;
            return GLib.SOURCE_CONTINUE;
        });
    }

    _dropItem(id) {
        const item = this._items.get(id);
        if (!item)
            return;
        this._items.delete(id);
        try { item.destroy(); } catch (e) {}
    }
}
