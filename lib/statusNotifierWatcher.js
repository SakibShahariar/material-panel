/**
 * StatusNotifierWatcher — patterned on ubuntu/gnome-shell-extension-appindicator
 * (RegisterStatusNotifierItemAsync + path/sender rules + property signals).
 *
 * Only one watcher may own org.kde.StatusNotifierWatcher.
 * Disable BetterTrayIcons / system AppIndicator while this runs.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

const WATCHER_BUS_NAME = 'org.kde.StatusNotifierWatcher';
const WATCHER_OBJECT = '/StatusNotifierWatcher';
const DEFAULT_ITEM_OBJECT_PATH = '/StatusNotifierItem';
const BUS_ADDRESS_REGEX = /([a-zA-Z0-9._-]+\.[a-zA-Z0-9.-]+)|(:[0-9]+\.[0-9]+)$/;

const WATCHER_IFACE_XML = `<node>
<interface name="org.kde.StatusNotifierWatcher">

    <!-- methods -->
    <method name="RegisterStatusNotifierItem">
        <arg name="service" type="s" direction="in"/>
    </method>

    <method name="RegisterStatusNotifierHost">
        <arg name="service" type="s" direction="in"/>
    </method>


    <!-- properties -->

    <property name="RegisteredStatusNotifierItems" type="as" access="read">
        <annotation name="org.qtproject.QtDBus.QtTypeName.Out0" value="QStringList"/>
    </property>

    <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>

    <property name="ProtocolVersion" type="i" access="read"/>


    <!-- signals -->
    <signal name="StatusNotifierItemRegistered">
        <arg type="s"/>
    </signal>

    <signal name="StatusNotifierItemUnregistered">
        <arg type="s"/>
    </signal>

    <signal name="StatusNotifierHostRegistered">
    </signal>

    <signal name="StatusNotifierHostUnregistered">
    </signal>
</interface>

</node>`;

function indicatorId(service, busName, objectPath) {
    if (service !== busName && service && BUS_ADDRESS_REGEX.test(service))
        return service;
    return `${busName}@${objectPath}`;
}

function unpack(v) {
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

async function getUniqueBusName(name, cancellable) {
    if (!name)
        return null;
    if (name[0] === ':')
        return name;
    try {
        const [unique] = (await Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/',
            'org.freedesktop.DBus',
            'GetNameOwner',
            new GLib.Variant('(s)', [name]),
            new GLib.VariantType('(s)'),
            Gio.DBusCallFlags.NONE,
            -1,
            cancellable)).deep_unpack();
        return unique;
    } catch (e) {
        logError(e, `material-panel: GetNameOwner ${name}`);
        return null;
    }
}

Gio._promisify(Gio.DBusConnection.prototype, 'call');

class TrayItem {
    constructor(watcher, service, busName, objectPath, id) {
        this._watcher = watcher;
        this.service = service;
        this.busName = busName;
        this.objectPath = objectPath;
        this.id = id;
        this.uniqueId = id;
        this.proxy = null;
        this.button = null;
        this._icon = null;
        this._destroyed = false;
        this._nameWatch = 0;
    }

    start() {
        const paths = [this.objectPath];
        if (this.objectPath === DEFAULT_ITEM_OBJECT_PATH)
            paths.push('/org/freedesktop/StatusNotifierItem');

        const tryAt = (i) => {
            if (this._destroyed)
                return;
            if (i >= paths.length) {
                log(`material-panel: SNI no proxy for ${this.id}`);
                this._watcher._onItemDestroyed(this);
                return;
            }
            const path = paths[i];
            Gio.DBusProxy.new(
                Gio.DBus.session,
                Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
                null,
                this.busName,
                path,
                'org.kde.StatusNotifierItem',
                null,
                (_o, res) => {
                    if (this._destroyed)
                        return;
                    let proxy;
                    try {
                        proxy = Gio.DBusProxy.new_finish(res);
                    } catch (e) {
                        tryAt(i + 1);
                        return;
                    }
                    this.objectPath = path;
                    this.proxy = proxy;
                    try {
                        this._buildUi();
                        this._refresh();
                        proxy.connect('g-properties-changed', () => {
                            try { this._refresh(); } catch (e) {}
                        });
                        proxy.connect('g-signal', (_p, _s, signal) => {
                            if (/^New/.test(String(signal))) {
                                try { this._refresh(); } catch (e) {}
                            }
                        });
                        log(`material-panel: SNI item live ${this.busName}${path}`);
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                            try { this._watcher.rehostAll(); } catch (e) {}
                            return GLib.SOURCE_REMOVE;
                        });
                    } catch (e) {
                        logError(e, 'material-panel: SNI UI');
                        this._watcher._onItemDestroyed(this);
                    }
                });
        };
        tryAt(0);

        try {
            this._nameWatch = Gio.DBus.session.watch_name(
                this.busName,
                Gio.BusNameWatcherFlags.NONE,
                null,
                () => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                        if (!this._destroyed)
                            this._watcher._onItemDestroyed(this);
                        return GLib.SOURCE_REMOVE;
                    });
                });
        } catch (e) {}
    }

    _prop(name) {
        try {
            return unpack(this.proxy?.get_cached_property(name));
        } catch (e) {
            return null;
        }
    }

    _buttonAlive() {
        try {
            return !!(this.button && this.button.get_stage && this.button.get_stage());
        } catch (e) {
            return false;
        }
    }

    _buildUi() {
        // Panel rebuild destroys actors; recreate when needed
        if (this._buttonAlive()) {
            this._watcher._hostItem(this);
            return;
        }
        this.button = null;
        this._icon = null;

        this.button = new St.Button({
            style_class: 'material-panel-chip material-panel-sni',
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            visible: true,
            opacity: 255,
        });
        try {
            // Explicit chip so theme/zero-size can't hide it
            this.button.style =
                'padding: 4px 10px; border-radius: 999px; min-width: 28px; min-height: 28px;' +
                'background-color: rgba(128,128,128,0.35);';
        } catch (e) {}

        const box = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-sni-inner',
        });
        try { box.style = 'spacing: 4px;'; } catch (e) {}

        this._icon = new St.Icon({
            style_class: 'material-panel-sni-icon',
            icon_size: 18,
            y_align: Clutter.ActorAlign.CENTER,
            icon_name: 'qbittorrent',
            fallback_icon_name: 'application-x-executable-symbolic',
        });
        // fallback_icon_name may not exist on all St — try/catch
        try {
            this._icon.icon_name = 'qbittorrent';
        } catch (e) {
            this._icon.icon_name = 'application-x-executable-symbolic';
        }

        this._label = new St.Label({
            text: '●',
            style_class: 'material-panel-sni-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        try {
            this._label.style = 'font-size: 11px; font-weight: 700;';
        } catch (e) {}

        box.add_child(this._icon);
        box.add_child(this._label);
        this.button.set_child(box);

        this.button.connect('button-press-event', (_a, event) => {
            try {
                const b = event.get_button();
                log(`material-panel: SNI click button=${b} id=${this.id}`);
                if (b === 2) {
                    this._call('Activate');
                } else {
                    // Prefer tray menu; fall back to Activate if ContextMenu fails
                    this._call('ContextMenu', () => this._call('Activate'));
                }
            } catch (e) {
                logError(e, 'material-panel: SNI click');
            }
            return Clutter.EVENT_STOP;
        });
        this._watcher._hostItem(this);
    }

    _refresh() {
        if (this._destroyed || !this._icon)
            return;
        let title = 'App';
        try {
            title = String(this._prop('Title') || this._prop('Id') || 'App');
            this.button.accessible_name = title;
            if (this._label) {
                // Short chip text
                const short = title.length > 10 ? title.slice(0, 8) + '…' : title;
                this._label.text = short || '●';
            }
        } catch (e) {}
        try {
            const name = this._prop('IconName') || this._prop('AttentionIconName');
            if (name && String(name).length) {
                this._icon.icon_name = String(name);
                return;
            }
        } catch (e) {}
        try {
            const id = String(this._prop('Id') || this.id || title || '').toLowerCase();
            this._icon.icon_name = id.includes('qbit')
                ? 'qbittorrent'
                : 'application-x-executable-symbolic';
        } catch (e) {}
    }

    _call(method, onFail = null) {
        if (!this.proxy) {
            log(`material-panel: SNI ${method} — no proxy`);
            return;
        }
        try {
            const [x, y] = global.get_pointer();
            this.proxy.call(
                method,
                new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]),
                Gio.DBusCallFlags.NONE,
                2000,
                null,
                (_p, res) => {
                    try {
                        this.proxy.call_finish(res);
                        log(`material-panel: SNI ${method} ok`);
                    } catch (e) {
                        logError(e, `material-panel: SNI ${method}`);
                        try { onFail?.(); } catch (e2) {}
                    }
                });
        } catch (e) {
            logError(e, `material-panel: SNI ${method} throw`);
            try { onFail?.(); } catch (e2) {}
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        try {
            if (this._nameWatch)
                Gio.DBus.session.unwatch_name(this._nameWatch);
        } catch (e) {}
        this._nameWatch = 0;
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
    /**
     * @param {() => ({add: Function}|null)} hostProvider tray drawer / zone host
     */
    constructor(hostProvider, extensionPath = null) {
        this._hostProvider = hostProvider;
        this._extensionPath = extensionPath;
        this._items = new Map();
        this._cancellable = new Gio.Cancellable();
        this._ownName = 0;
        this._dbusImpl = null;
        this._enabled = false;
        this._seekProc = null;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;
        try {
            this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(WATCHER_IFACE_XML, this);
            this._dbusImpl.export(Gio.DBus.session, WATCHER_OBJECT);
        } catch (e) {
            logError(e, 'material-panel: export StatusNotifierWatcher');
            this._enabled = false;
            return;
        }

        this._ownName = Gio.DBus.session.own_name(
            WATCHER_BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            () => {
                log(`material-panel: acquired ${WATCHER_BUS_NAME}`);
            },
            () => {
                log(`material-panel: lost ${WATCHER_BUS_NAME}`);
            });

        try {
            this._dbusImpl.emit_signal('StatusNotifierHostRegistered', null);
        } catch (e) {}

        // Official appindicator: delay then brute-force bus scan (dropbox/qbit don't re-register)
        this._announceHost();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            try {
                this._announceHost();
                this._seekBruteForce();
            } catch (e) {
                logError(e, 'material-panel: SNI seek start');
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
            try {
                this._announceHost();
                this._seekBruteForce();
                this.rehostAll();
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    }

    _announceHost() {
        try {
            this._dbusImpl?.emit_signal?.('StatusNotifierHostRegistered', null);
            log('material-panel: SNI HostRegistered announced');
        } catch (e) {}
    }

    /**
     * Find StatusNotifierItem well-known names already on the bus (login race).
     * Pattern matches official appindicator _seekStatusNotifierItems idea.
     */
    /**
     * Official approach: external gjs bus analyzer finds SNI objects that never re-register.
     */
    _seekBruteForce() {
        const path = this._extensionPath
            ? `${this._extensionPath}/tools/sni-bus-analyzer.js`
            : null;
        if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS)) {
            log(`material-panel: SNI analyzer missing at ${path}`);
            this._seekExistingItemsFallback();
            return;
        }
        log('material-panel: SNI brute-force bus scan starting…');
        try {
            const proc = Gio.Subprocess.new(
                ['gjs', '-m', path],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            const stdout = new Gio.DataInputStream({
                base_stream: proc.get_stdout_pipe(),
            });
            const decoder = new TextDecoder();
            const readLine = () => {
                stdout.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (_s, res) => {
                    try {
                        const [line] = stdout.read_line_finish(res);
                        if (!line) {
                            proc.wait_async(this._cancellable, () => {
                                log('material-panel: SNI brute-force scan finished');
                                this.rehostAll();
                            });
                            return;
                        }
                        const text = decoder.decode(line instanceof Uint8Array ? line : new Uint8Array(line));
                        try {
                            const {services, name, path: objPath} = JSON.parse(text);
                            const service = (services || []).find(s =>
                                /statusnotifieritem/i.test(String(s))) ?? (services || [])[0] ?? name;
                            log(`material-panel: SNI scan hit name=${name} path=${objPath}`);
                            this._ensureItemRegistered(service || name, name, objPath).then(() => {
                                this.rehostAll();
                            }).catch(e => logError(e, 'material-panel: SNI scan register'));
                        } catch (e) {
                            logError(e, 'material-panel: SNI scan parse');
                        }
                        readLine();
                    } catch (e) {
                        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                            logError(e, 'material-panel: SNI scan read');
                    }
                });
            };
            readLine();
        } catch (e) {
            logError(e, 'material-panel: SNI brute-force spawn');
            this._seekExistingItemsFallback();
        }
    }

    _seekExistingItemsFallback() {
        // Lightweight fallback: probe unique names at default path only
        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/', 'org.freedesktop.DBus', 'ListNames',
            null, new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (_c, res) => {
                try {
                    const [names] = Gio.DBus.session.call_finish(res).deep_unpack();
                    for (const name of names.filter(n => n.startsWith(':'))) {
                        this._probeAndRegister(name, name);
                    }
                } catch (e) {}
            });
    }

    _probeAndRegister(service, busName) {
        const paths = ['/StatusNotifierItem', '/org/freedesktop/StatusNotifierItem'];
        for (const objPath of paths) {
            const id = indicatorId(service, busName, objPath);
            if (this._items.has(id))
                continue;
            try {
                Gio.DBus.session.call(
                    busName, objPath, 'org.freedesktop.DBus.Properties', 'Get',
                    new GLib.Variant('(ss)', ['org.kde.StatusNotifierItem', 'Id']),
                    new GLib.VariantType('(v)'),
                    Gio.DBusCallFlags.NONE, 400, this._cancellable,
                    (_c, res) => {
                        try {
                            const [variant] = Gio.DBus.session.call_finish(res).deep_unpack();
                            const itemId = variant?.deep_unpack?.() ?? variant;
                            log(`material-panel: SNI probe hit ${busName}${objPath} Id=${itemId}`);
                            this._ensureItemRegistered(service, busName, objPath).then(() => {
                                this.rehostAll();
                            }).catch(() => {});
                        } catch (e) {}
                    });
            } catch (e) {}
        }
    }

    disable() {


        this._enabled = false;
        try {
            this._cancellable.cancel();
        } catch (e) {}
        this._cancellable = new Gio.Cancellable();

        for (const item of [...this._items.values()]) {
            try { item.destroy(); } catch (e) {}
        }
        this._items.clear();

        try {
            this._dbusImpl?.unexport?.();
        } catch (e) {}
        this._dbusImpl = null;

        try {
            if (this._ownName) {
                Gio.DBus.session.unown_name(this._ownName);
                this._ownName = 0;
            }
        } catch (e) {}
    }

    /**
     * Official AppIndicator logic:
     *  - path  → busName = sender, objPath = path
     *  - bus name → resolve unique name, objPath = /StatusNotifierItem
     */
    async RegisterStatusNotifierItemAsync(params, invocation) {
        const [service] = params;
        let busName = null;
        let objPath = null;

        try {
            if (String(service).charAt(0) === '/') {
                busName = invocation.get_sender();
                objPath = service;
            } else if (String(service).match(BUS_ADDRESS_REGEX)) {
                busName = await getUniqueBusName(service, this._cancellable);
                objPath = DEFAULT_ITEM_OBJECT_PATH;
            }

            if (!busName || !objPath) {
                const error = `Impossible to register indicator for '${service}'`;
                log(`material-panel: ${error}`);
                invocation.return_dbus_error(
                    'org.gnome.gjs.JSError.ValueError', error);
                return;
            }

            log(`material-panel: SNI Register service="${service}" bus=${busName} path=${objPath}`);
            await this._ensureItemRegistered(service, busName, objPath);
            invocation.return_value(null);
        } catch (e) {
            logError(e, 'material-panel: RegisterStatusNotifierItemAsync');
            try {
                invocation.return_dbus_error(
                    'org.gnome.gjs.JSError.ValueError',
                    e.message || String(e));
            } catch (e2) {
                try { invocation.return_value(null); } catch (e3) {}
            }
        }
    }

    async RegisterStatusNotifierHostAsync(_service, invocation) {
        try {
            invocation.return_value(null);
        } catch (e) {}
    }

    async _ensureItemRegistered(service, busName, objPath) {
        const id = indicatorId(service, busName, objPath);
        if (this._items.has(id)) {
            log(`material-panel: SNI already registered ${id}`);
            return;
        }

        const item = new TrayItem(this, service, busName, objPath, id);
        this._items.set(id, item);
        item.start();

        try {
            this._dbusImpl.emit_signal(
                'StatusNotifierItemRegistered',
                new GLib.Variant('(s)', [id]));
            this._dbusImpl.emit_property_changed(
                'RegisteredStatusNotifierItems',
                new GLib.Variant('as', this.RegisteredStatusNotifierItems));
        } catch (e) {
            logError(e, 'material-panel: SNI signals');
        }
    }

    _onItemDestroyed(item) {
        if (!this._items.has(item.id))
            return;
        this._items.delete(item.id);
        try { item.destroy(); } catch (e) {}
        try {
            this._dbusImpl?.emit_signal?.(
                'StatusNotifierItemUnregistered',
                new GLib.Variant('(s)', [item.id]));
            this._dbusImpl?.emit_property_changed?.(
                'RegisteredStatusNotifierItems',
                new GLib.Variant('as', this.RegisteredStatusNotifierItems));
        } catch (e) {}
    }

    _hostItem(item) {
        if (!item?.button)
            return;
        const tryHost = () => {
            const host = this._hostProvider?.() ?? null;
            if (!host) {
                log('material-panel: SNI host not ready yet');
                return false;
            }
            if (typeof host.add !== 'function') {
                log(`material-panel: SNI host has no add() (${typeof host})`);
                return false;
            }
            try {
                // Detach if already parented elsewhere (panel rebuild)
                const parent = item.button.get_parent?.();
                if (parent)
                    parent.remove_child(item.button);
                host.add(item.button);
                try {
                    item.button.visible = true;
                    item.button.opacity = 255;
                    item.button.queue_relayout();
                    host.actor?.queue_relayout?.();
                } catch (e) {}
                log(`material-panel: SNI hosted ${item.id} parent=${item.button.get_parent()?.constructor?.name}`);
                return true;
            } catch (e) {
                logError(e, 'material-panel: SNI host');
                return false;
            }
        };
        if (tryHost())
            return;
        let n = 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            if (item._destroyed)
                return GLib.SOURCE_REMOVE;
            if (tryHost())
                return GLib.SOURCE_REMOVE;
            if (++n > 40) {
                log(`material-panel: SNI gave up hosting ${item.id}`);
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    /** Call after panel/tray rebuild so icons re-attach (buttons may have been destroyed). */
    rehostAll() {
        log(`material-panel: SNI rehostAll count=${this._items.size}`);
        for (const item of this._items.values()) {
            if (item?._destroyed)
                continue;
            try {
                if (!item._buttonAlive()) {
                    if (item.proxy)
                        item._buildUi();
                    else
                        log(`material-panel: SNI rehost skip (no proxy) ${item.id}`);
                } else {
                    this._hostItem(item);
                }
            } catch (e) {
                logError(e, 'material-panel: SNI rehostAll');
            }
        }
    }

    get RegisteredStatusNotifierItems() {
        return [...this._items.keys()];
    }

    get IsStatusNotifierHostRegistered() {
        return true;
    }

    get ProtocolVersion() {
        return 0;
    }
}
