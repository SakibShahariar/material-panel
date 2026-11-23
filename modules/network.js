import St from 'gi://St';
import {createPopupHeader} from '../lib/popupHeader.js';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import NM from 'gi://NM';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachPopupDismiss, closeAfter} from '../lib/popupDismiss.js';
import {menuToggle, menuClose} from '../lib/shellCompat.js';
import {getNetworkMetrics} from '../lib/systemMetricsState.js';
import {getThemeColor, subscribeThemeColors} from '../lib/themeColorState.js';

import {iconPathPrimary, iconPathOnAccent} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {networkIconForType} from '../lib/networkIcon.js';
import {setChipA11y} from '../lib/a11y.js';
import {findBestAccessPoint, getAccessPointInfo, ssidKey} from '../lib/wifiAccessPoints.js';
import {addAndActivateWifiConnection, createWifiActivationGate, reportWifiActivationStatus} from '../lib/wifiConnection.js';
import {signalGlyph, sortAccessPoints, parseArpNeighbors, classifyCaptivePortal,
    parsePingResult, wifiChannel} from '../lib/networkDesign.js';
import {loadHiddenNetworks, saveHiddenNetworks, toggleHiddenNetwork} from '../lib/hiddenNetworks.js';
import {probeCaptivePortal, getNearbyDevices, probePing} from '../lib/networkDiagnostics.js';

// Saved profiles are reactivated directly; unsaved access points are
// activated through NetworkManager's session secret-agent flow below.
export function buildNetwork(_extensionPath, scale = 1.0) {
    let destroyed = false;
    const activationCancellables = new Set();
    const activationGate = createWifiActivationGate();
    let refreshChipIcon = null;
    const button = new St.Button({
        style_class: 'material-panel-network material-panel-chip',
        reactive: true,
    });
    const box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
    const icon = new St.Icon({
        style_class: 'material-panel-network-icon',
        icon_size: Math.round(17 * scale),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('network-offline'))),
    });
    box.add_child(icon);
    const chipLabel = new St.Label({
        text: '',
        style_class: 'material-panel-network-chip-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    // Inline accent colour keeps the chip in sync with the active palette
    // even when generated CSS is reloaded. Repaint when the theme is applied,
    // since chips are constructed before the first palette update.
    let chipPressed = false;
    const applyChipColor = () => {
        try {
            const foreground = chipPressed
                ? getThemeColor('onPrimary', '#1e1e2e')
                : getThemeColor('primary', '#89b4fa');
            chipLabel.style = `font-size: 10px; font-weight: 600; color: ${foreground};`;
        } catch (e) {}
    };
    const unsubscribeChipColor = subscribeThemeColors(applyChipColor);
    const setChipPressed = pressed => {
        if (chipPressed === pressed)
            return;
        chipPressed = pressed;
        applyChipColor();
        try { refreshChipIcon?.(); } catch (e) {}
    };
    box.add_child(chipLabel);
    button.set_child(box);
    setChipA11y(button, 'Network status unavailable');

    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);
    button.connect('clicked', () => menuToggle(menu));
    button.connect('destroy', () => {
        destroyed = true;
        unsubscribeChipColor();
        for (const cancellable of activationCancellables) {
            try { cancellable.cancel(); } catch (error) {}
        }
        activationCancellables.clear();
        activationGate.clear();
        menu.destroy();
    });

    NM.Client.new_async(null, (_obj, res) => {
        let client;
        try {
            client = NM.Client.new_finish(res);
        } catch (e) {
            if (!destroyed) {
                logError(e, 'material-panel: NetworkManager unavailable');
                setChipA11y(button, 'NetworkManager unavailable');
                // An empty popup looks like there are simply no networks.
                // Surface the actual failure so users can distinguish it.
                const unavailableItem = new PopupMenu.PopupMenuItem(
                    'NetworkManager unavailable', {reactive: false});
                unavailableItem.label.style = 'font-family: "Noto Sans", sans-serif; font-size: 11px;';
                menu.addMenuItem(unavailableItem);
                const settingsItem = new PopupMenu.PopupMenuItem('Network settings…');
                settingsItem.label.style = 'font-family: "Noto Sans", sans-serif; font-size: 11px;';
                settingsItem.connect('activate', closeAfter(menu, () => {
                    try {
                        GLib.spawn_command_line_async('gnome-control-center network');
                    } catch (launchError) {
                        logError(launchError, 'material-panel: open network settings failed');
                    }
                }));
                menu.addMenuItem(settingsItem);
            }
            return;
        }
        // The panel may have been rebuilt while NetworkManager initialized.
        // Finish the async operation, but don't attach UI or signals to a dead chip.
        if (destroyed)
            return;

        let currentIconKey = 'network-offline';
        let heroIcon = null;
        const setIcon = key => {
            currentIconKey = key;
            const path = chipPressed ? iconPathOnAccent(key) : iconPathPrimary(key);
            icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(path));
            if (heroIcon)
                heroIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary(key)));
        };
        refreshChipIcon = () => setIcon(currentIconKey);

        // Popup actors are built before the first theme apply, so paint them
        // from the live palette and repaint when the palette changes.
        const themedLabels = new Map();
        const themedIcons = new Map();
        const wifiUi = (text, style = '') => {
            const label = new St.Label({text: String(text ?? '')});
            const applyStyle = () => {
                try {
                    label.style = `color: ${getThemeColor('onSurface', '#cdd6f4')}; ${style}`;
                } catch (e) {}
            };
            themedLabels.set(label, applyStyle);
            label.connect('destroy', () => themedLabels.delete(label));
            applyStyle();
            return label;
        };
        const wifiLockIcon = () => {
            const lockIcon = new St.Icon({icon_size: Math.round(12 * scale)});
            const applyIcon = () => {
                try {
                    lockIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('lock')));
                } catch (e) {}
            };
            themedIcons.set(lockIcon, applyIcon);
            lockIcon.connect('destroy', () => themedIcons.delete(lockIcon));
            applyIcon();
            return lockIcon;
        };
        const repaintPopupTheme = () => {
            for (const applyStyle of themedLabels.values()) {
                try { applyStyle(); } catch (e) {}
            }
            for (const applyIcon of themedIcons.values()) {
                try { applyIcon(); } catch (e) {}
            }
            try { setIcon(currentIconKey); } catch (e) {}
        };
        const unsubscribePopupColors = subscribeThemeColors(repaintPopupTheme);
        const wifiEyebrow = t => wifiUi(t, 'font-family: "Noto Sans", sans-serif; font-size: 9px; font-weight: 700; opacity: 0.55; letter-spacing: 1px;');

        const connectionStatus = wifiUi('Checking connection…',
            'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.65;');
        connectionStatus.style_class = 'material-panel-network-popup-status';

        // Hero card: large status icon, SSID + state, and optional actions from
        // the reference network panels (QR sharing / speed test when installed).
        const heroCard = new St.BoxLayout({
            style_class: 'material-panel-wifi-hero',
            x_expand: true,
            style: 'spacing: 12px; padding: 12px; border-radius: 14px;',
        });
        heroIcon = new St.Icon({
            style_class: 'material-panel-wifi-hero-icon',
            icon_size: Math.round(34 * scale),
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(iconPathPrimary('network-offline'))),
            y_align: Clutter.ActorAlign.CENTER,
        });
        heroCard.add_child(heroIcon);
        const heroText = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style: 'spacing: 3px;',
        });
        const heroTitle = wifiUi('Wi-Fi', 'font-family: "Noto Sans", sans-serif; font-size: 15px; font-weight: 700;');
        heroTitle.clutter_text.ellipsize = 1;
        const heroSub = wifiUi('Checking connection…',
            'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.65;');
        heroSub.clutter_text.ellipsize = 1;
        heroText.add_child(heroTitle);
        heroText.add_child(heroSub);
        heroCard.add_child(heroText);
        const heroActions = new St.BoxLayout({style: 'spacing: 6px;'});
        heroCard.add_child(heroActions);
        const updateStatusIcon = () => {
            const conn = client.get_primary_connection();
            if (!conn) {
                connectionStatus.text = 'Offline';
                heroTitle.text = client.wireless_enabled ? 'Wi-Fi' : 'Not connected';
                heroSub.text = client.wireless_enabled ? 'No active connection' : 'Wi-Fi is off';
                setIcon(client.wireless_enabled ? 'network-wifi' : 'network-offline');
                updateChipLabel();
                setChipA11y(button, client.wireless_enabled ? 'Wi-Fi on, not connected' : 'Wi-Fi off');
                return;
            }
            const type = String(conn.get_connection_type() ?? '');
            connectionStatus.text = type.includes('wireless') ? 'Wi-Fi connected'
                : type.includes('ethernet') ? 'Wired connection'
                    : 'Network connected';
            const info = activeWifiInfo();
            heroTitle.text = info?.ssid || conn.get_id?.() || 'Connected';
            heroSub.text = connectionStatus.text;
            setIcon(networkIconForType(type, NM));
            updateChipLabel();
            if (type.includes('wireless'))
                setChipA11y(button, 'Wi-Fi enabled, connected');
            else if (type.includes('ethernet'))
                setChipA11y(button, 'Wired connection active');
            else
                setChipA11y(button, type ? type + ' connection active' : 'Network connected');
        };
        const activeWifiInfo = () => {
            try {
                const conn = client.get_primary_connection();
                if (!conn || !String(conn.get_connection_type() ?? '').includes('wireless'))
                    return null;
                const ap = conn.get_access_points?.()?.[0] ?? null;
                return ap ? getAccessPointInfo(ap) : null;
            } catch (e) {
                return null;
            }
        };
        // The icon carries the on/off/connection state; the label only shows
        // the connected network name so the chip stays compact.
        const updateChipLabel = () => {
            try {
                const type = String(client.get_primary_connection()?.get_connection_type?.() ?? '');
                if (!type.includes('wireless')) {
                    chipLabel.text = '';
                    return;
                }
                const info = activeWifiInfo();
                chipLabel.text = info?.ssid
                    ? `${info.ssid.slice(0, 16)} ${signalGlyph(info.strength)}`
                    : '';
            } catch (e) {
                chipLabel.text = '';
            }
        };
        updateStatusIcon();
        const networkTitle = new St.Label({
            text: 'NETWORK',
            style_class: 'material-panel-cpu-popup-title',
            style: 'font-family: "Noto Sans", sans-serif; font-size: 11px; font-weight: 700; opacity: 0.85;',
        });
        const {actor: networkHeader} = createPopupHeader({
            titleActor: networkTitle,
            statusActor: connectionStatus,
            styleClass: 'material-panel-network-popup-header',
            style: 'spacing: 8px; padding: 4px 2px;',
        });
        const networkHeaderItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        networkHeaderItem.add_child(networkHeader);
        menu.addMenuItem(networkHeaderItem);
        const primaryConnId = client.connect('notify::primary-connection', updateStatusIcon);

        const wifiToggle = new PopupMenu.PopupSwitchMenuItem('Wi-Fi', !!client.wireless_enabled);
        try {
            wifiToggle.label.style = 'font-family: "Noto Sans", sans-serif; font-size: 11px; font-weight: 600;';
        } catch (e) {}
        wifiToggle.connect('toggled', item => {
            const want = !!item.state;
            try {
                // NetworkManager owns the radio state; avoid a redundant nmcli
                // subprocess and let notify::wireless-enabled synchronize UI.
                client.wireless_enabled = want;
            } catch (e) {
                logError(e, 'material-panel: NM wireless_enabled set failed');
            }
        });
        const wirelessEnabledId = client.connect('notify::wireless-enabled', () => {
            try {
                wifiToggle.setToggleState(!!client.wireless_enabled);
            } catch (e) {}
            updateStatusIcon();
        });
        menu.addMenuItem(wifiToggle);

        // Adapter switcher appears only with 2+ Wi-Fi radios (elliot/penguine style).
        const adapterSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(adapterSection);
        const adapterName = (device, index) => {
            if (destroyed)
                return 'Wi-Fi';
            const iface = device?.get_interface?.() || `Wi-Fi ${index + 1}`;
            const match = iface.match(/^wlp(\d+)s(\d+)(?:f(\d+)u(\d+))?/);
            if (match)
                return `Wi-Fi ${match[3] || match[1]}`;
            return iface;
        };
        const updateAdapterSwitcher = () => {
            if (destroyed)
                return;
            adapterSection.visible = wifiDevices.length > 1;
            // Rebuild only when the switcher is actually shown. Every
            // addMenuItem reuses destroyed Clutter actors if we recreate
            // items blindly, which crashes the Shell with use-after-free.
            if (!adapterSection.visible)
                return;
            adapterSection.removeAll();
            adapterItems.length = 0;
            const adapterTitle = styleMenuLabel(new PopupMenu.PopupMenuItem('Wi-Fi adapter', {reactive: false}));
            adapterTitle.label.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.6;';
            adapterSection.addMenuItem(adapterTitle);
            wifiDevices.forEach((device, index) => {
                const item = styleMenuLabel(new PopupMenu.PopupMenuItem(
                    `${index === wifiDeviceIndex ? '● ' : '   '}${adapterName(device, index)}`, {reactive: true}));
                item.connect('activate', () => {
                    wifiDeviceIndex = index;
                    bindWifiDevice();
                    rebuildNetworkList();
                });
                adapterItems.push(item);
                adapterSection.addMenuItem(item);
            });
        };

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const styleMenuLabel = item => {
            try {
                item.label.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px;';
            } catch (e) {}
            return item;
        };
        const wifiSurface = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style: 'spacing: 8px; padding: 2px; width: 400px;',
        });
        wifiSurface.add_child(heroCard);

        // Hero actions are advertised only when their helper tools exist, so
        // the popup never offers a button that silently does nothing.
        const addHeroAction = (label, callback) => {
            const b = new St.Button({
                label, style_class: 'material-panel-wifi-action',
                reactive: true, can_focus: true,
            });
            try { b.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px; padding: 4px 8px; border-radius: 999px;'; } catch (e) {}
            b.connect('clicked', callback);
            heroActions.add_child(b);
        };
        try {
            if (GLib.find_program_in_path('omarchy.wifiqr')) {
                addHeroAction('QR', closeAfter(menu, () => {
                    try { GLib.spawn_command_line_async('omarchy.wifiqr'); } catch (e) {}
                }));
            }
            if (GLib.find_program_in_path('omarchy.speedtest')) {
                addHeroAction('Speed', closeAfter(menu, () => {
                    try { GLib.spawn_command_line_async('omarchy.speedtest'); } catch (e) {}
                }));
            }
        } catch (e) {}

        // Connection details grid, modelled on the reference network panels.
        const formatRateValue = n => {
            n = Math.max(0, Number(n) || 0);
            if (n < 1024) return `${Math.round(n)} B/s`;
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB/s`;
            return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
        };
        const formatBytesValue = n => {
            n = Math.max(0, Number(n) || 0);
            if (n < 1024) return `${Math.round(n)} B`;
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
            if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
            return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        const bandForAccessPoint = ap => {
            try {
                const frequency = Number(ap?.get_frequency?.()) || 0;
                if (frequency >= 5900) return '6 GHz';
                if (frequency >= 4900) return '5 GHz';
                if (frequency > 0) return '2.4 GHz';
            } catch (e) {}
            return '—';
        };
        const dnsForConnection = conn => {
            try {
                const servers = conn?.get_ip4_config?.()?.get_dns?.() || [];
                if (!servers.length) return 'DHCP';
                const joined = servers.join(' ');
                if (joined.includes('1.1.1.1')) return 'Cloudflare';
                if (joined.includes('8.8.8.8')) return 'Google';
                return String(servers[0]);
            } catch (e) { return '—'; }
        };
        const detailsCard = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-wifi-detail-card',
            x_expand: true,
            style: 'spacing: 6px; padding: 10px 12px; border-radius: 12px;',
        });
        detailsCard.add_child(wifiEyebrow('CONNECTION DETAILS'));
        const deviceCard = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-wifi-detail-card',
            x_expand: true,
            style: 'spacing: 6px; padding: 10px 12px; border-radius: 12px;',
        });
        deviceCard.add_child(wifiEyebrow('DEVICE & LINK'));
        const detailRows = {};
        const addDetailRow = (card, fields) => {
            const row = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
            for (const {key, label} of fields) {
                const cell = new St.BoxLayout({x_expand: true, style: 'spacing: 6px;'});
                cell.add_child(wifiUi(label,
                    'font-family: "Noto Sans", sans-serif; font-size: 9px; opacity: 0.5; width: 60px;'));
                const value = wifiUi('—',
                    'font-family: "Noto Sans", sans-serif; font-size: 10px; font-weight: 600;');
                value.x_expand = true;
                detailRows[key] = value;
                cell.add_child(value);
                row.add_child(cell);
            }
            card.add_child(row);
        };
        addDetailRow(detailsCard, [{key: 'ping', label: 'PING'}, {key: 'loss', label: 'PACKET LOSS'}]);
        addDetailRow(detailsCard, [
            {key: 'receiving', label: 'RECEIVING'}, {key: 'sending', label: 'SENDING'},
        ]);
        addDetailRow(detailsCard, [
            {key: 'downloaded', label: 'DOWNLOADED'}, {key: 'uploaded', label: 'UPLOADED'},
        ]);
        addDetailRow(detailsCard, [{key: 'ip', label: 'IP ADDRESS'}, {key: 'gateway', label: 'GATEWAY'}]);
        addDetailRow(detailsCard, [{key: 'band', label: 'BAND'}, {key: 'dns', label: 'DNS'}]);
        addDetailRow(deviceCard, [
            {key: 'interface', label: 'INTERFACE'}, {key: 'mac', label: 'MAC ADDRESS'},
        ]);
        addDetailRow(deviceCard, [{key: 'subnet', label: 'SUBNET'}, {key: 'ipv6', label: 'IPv6'}]);
        addDetailRow(deviceCard, [
            {key: 'link', label: 'LINK SPEED'}, {key: 'channel', label: 'CHANNEL'},
        ]);
        wifiSurface.add_child(detailsCard);
        wifiSurface.add_child(deviceCard);

        // Ping results arrive asynchronously; keep them across list rebuilds
        // and ignore replies from a probe started for an older connection.
        let pingStats = {gateway: null, internet: null};
        let pingGeneration = 0;
        const measurePing = async () => {
            const generation = ++pingGeneration;
            const conn = client.get_primary_connection();
            const gateway = conn?.get_ip4_config?.()?.get_gateway?.() || null;
            const [gatewayResult, internetResult] = await Promise.all([
                probePing(gateway),
                probePing('1.1.1.1'),
            ]);
            if (destroyed || generation !== pingGeneration)
                return;
            pingStats = {gateway: gatewayResult, internet: internetResult};
            if (menu.isOpen)
                updateDetails();
        };

        const updateDetails = () => {
            try {
                const conn = client.get_primary_connection();
                const ip4 = conn?.get_ip4_config?.();
                const addresses = ip4?.get_addresses?.() || [];
                const ap = conn?.get_access_points?.()?.[0];
                const device = conn?.get_devices?.()?.[0] || wifiDevice;
                const metrics = getNetworkMetrics() || {};
                const rate = value => Number.isFinite(Number(value)) && Number(value) > 0
                    ? formatRateValue(value) : '—';
                const total = value => Number(value) > 0 ? formatBytesValue(value) : '—';
                const internet = pingStats.internet;
                detailRows.ping.text = internet?.latencyMs != null
                    ? `${internet.latencyMs.toFixed(1)} ms` : '—';
                detailRows.loss.text = internet?.lossPercent != null
                    ? `${internet.lossPercent}%` : '—';
                detailRows.receiving.text = rate(metrics.down);
                detailRows.sending.text = rate(metrics.up);
                detailRows.downloaded.text = total(metrics.sessionRx);
                detailRows.uploaded.text = total(metrics.sessionTx);
                detailRows.ip.text = addresses[0]?.get_address?.() || '—';
                detailRows.gateway.text = ip4?.get_gateway?.() || '—';
                detailRows.band.text = bandForAccessPoint(ap);
                detailRows.dns.text = dnsForConnection(conn);
                detailRows.interface.text = device?.get_interface?.() || '—';
                try { detailRows.mac.text = device?.get_hardware_address?.() || '—'; }
                catch (e) { detailRows.mac.text = '—'; }
                try {
                    const prefix = addresses[0]?.get_prefix?.();
                    detailRows.subnet.text = Number.isFinite(prefix) ? `/${prefix}` : '—';
                } catch (e) { detailRows.subnet.text = '—'; }
                try {
                    const ipv6 = conn?.get_ip6_config?.()?.get_addresses?.()?.[0]?.get_address?.();
                    detailRows.ipv6.text = ipv6 || '—';
                } catch (e) { detailRows.ipv6.text = '—'; }
                try {
                    let speed = device?.get_speed?.();
                    if (!speed)
                        speed = (Number(device?.get_bitrate?.()) || 0) / 1000;
                    detailRows.link.text = Number(speed) > 0 ? `${Math.round(speed)} Mb/s` : '—';
                } catch (e) { detailRows.link.text = '—'; }
                try {
                    const channel = wifiChannel(ap?.get_frequency?.());
                    detailRows.channel.text = channel ? `CH ${channel}` : '—';
                } catch (e) { detailRows.channel.text = '—'; }
            } catch (e) {
                for (const key of Object.keys(detailRows))
                    detailRows[key].text = '—';
            }
        };

        // Quick actions.
        const actionsRow = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            style: 'spacing: 6px;',
        });
        const addAction = (label, callback) => {
            const b = new St.Button({
                label, style_class: 'material-panel-wifi-action',
                reactive: true, can_focus: true, x_expand: true,
            });
            try { b.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px; padding: 6px 8px; border-radius: 999px;'; } catch (e) {}
            b.connect('clicked', callback);
            actionsRow.add_child(b);
            return b;
        };
        addAction('↻ Scan', () => requestWifiScan());
        addAction('Band', () => {
            menuClose(menu);
            try { GLib.spawn_command_line_async('gnome-control-center wifi'); } catch (e) {}
        });
        addAction('DNS', () => {
            menuClose(menu);
            try { GLib.spawn_command_line_async('gnome-control-center network'); } catch (e) {}
        });
        wifiSurface.add_child(actionsRow);

        const networkCards = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style: 'spacing: 6px;',
        });
        wifiSurface.add_child(networkCards);

        // One scroll view for the whole surface; nested scrollers made the
        // network list detach and left an apparently empty popup.
        const networksSection = new PopupMenu.PopupMenuSection();
        const networkBodyItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const wifiScroll = new St.ScrollView({
            style_class: 'material-panel-wifi-scroll',
            overlay_scrollbars: true,
            x_expand: true,
        });
        try {
            wifiScroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            wifiScroll.set_child(wifiSurface);
            wifiScroll.style = 'max-height: 520px;';
        } catch (e) {}
        networkBodyItem.add_child(wifiScroll);
        networksSection.addMenuItem(networkBodyItem);
        menu.addMenuItem(networksSection);

        let wifiDevice = null;
        let wifiDevices = [];
        let wifiDeviceIndex = 0;
        let wifiDeviceSignalIds = [];
        let scanStatus = '';
        let scanInFlight = false;
        let scanCancellable = null;

        const setScanStatus = message => {
            scanStatus = message || '';
            if (!destroyed)
                rebuildNetworkList();
        };

        const updateActivationStatus = message => reportWifiActivationStatus(
            setScanStatus,
            message,
            error => {
                try { logError(error, 'material-panel: could not update Wi-Fi activation status'); } catch (ignored) {}
            },
        );

        const bindWifiDevice = () => {
            for (const id of wifiDeviceSignalIds) {
                try { wifiDevice?.disconnect(id); } catch (e) {}
            }
            wifiDeviceSignalIds = [];
            try {
                wifiDevices = client.get_devices().filter(d =>
                    d.get_device_type() === NM.DeviceType.WIFI);
            } catch (e) {
                wifiDevices = [];
            }
            if (wifiDevices.length > 1) {
                // Snap to the radio carrying the default route (elliot style).
                try {
                    const primary = client.get_primary_connection();
                    const primaryAp = primary?.get_access_points?.()?.[0];
                    const routeIndex = primaryAp
                        ? wifiDevices.findIndex(d =>
                            d.get_access_points?.().some(a => a?.get_path?.() === primaryAp?.get_path?.()))
                        : -1;
                    if (routeIndex >= 0)
                        wifiDeviceIndex = routeIndex;
                } catch (e) {}
            }
            wifiDeviceIndex = Math.max(0, Math.min(wifiDeviceIndex, wifiDevices.length - 1));
            wifiDevice = wifiDevices[wifiDeviceIndex] || null;
            updateAdapterSwitcher();
            if (!wifiDevice)
                return;
            for (const signal of ['access-point-added', 'access-point-removed', 'notify::access-points']) {
                try {
                    wifiDeviceSignalIds.push(wifiDevice.connect(signal, () => {
                        scanStatus = '';
                        scanInFlight = false;
                        if (!destroyed)
                            rebuildNetworkList();
                    }));
                } catch (e) {}
            }
        };

        const activationSignals = new Set();
        const watchActivation = (activeConnection, ssid, onSettled = () => {}) => {
            let settled = false;
            let signalId = 0;
            const disconnect = () => {
                if (!signalId)
                    return;
                try { activeConnection.disconnect(signalId); } catch (e) {}
                activationSignals.delete(disconnect);
                signalId = 0;
            };
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                disconnect();
                try { onSettled(); } catch (error) {}
            };
            if (!activeConnection || destroyed) {
                finish();
                return;
            }
            const updateActivation = () => {
                if (destroyed) {
                    finish();
                    return;
                }
                let state;
                try { state = activeConnection.get_state(); } catch (e) { return; }
                if (state === NM.ActiveConnectionState.ACTIVATED) {
                    updateActivationStatus(`Connected to ${ssid}`);
                    finish();
                } else if (state === NM.ActiveConnectionState.DEACTIVATED) {
                    updateActivationStatus(`Couldn't connect to ${ssid}. Check the password or network security.`);
                    finish();
                }
            };
            try {
                signalId = activeConnection.connect('notify::state', updateActivation);
                if (!signalId)
                    throw new Error('NetworkManager did not provide an activation state signal');
                activationSignals.add(disconnect);
                updateActivation();
            } catch (error) {
                finish();
                if (!destroyed) {
                    try { logError(error, 'material-panel: could not watch Wi-Fi activation state'); } catch (ignored) {}
                    updateActivationStatus(`Could not monitor the connection to ${ssid}. Check Network settings.`);
                }
            }
        };

        const getActivationKey = (connection, accessPoint, ssid) => {
            if (connection) {
                try {
                    const uuid = connection.get_uuid?.();
                    if (typeof uuid === 'string' && uuid)
                        return `connection:${uuid}`;
                } catch (error) {}
            }
            try {
                const path = accessPoint?.get_path?.();
                if (typeof path === 'string' && path)
                    return `access-point:${path}`;
            } catch (error) {}
            return `ssid:${String(ssid || '')}`;
        };

        const activate = (connection, accessPoint = null, ssid = 'Wi-Fi network') => {
            if (!wifiDevice || destroyed)
                return;
            const activationKey = getActivationKey(connection, accessPoint, ssid);
            if (!activationGate.begin(activationKey))
                return;
            const finishActivation = () => activationGate.finish(activationKey);
            if (connection) {
                updateActivationStatus(`Connecting to ${ssid}…`);
                const cancellable = new Gio.Cancellable();
                activationCancellables.add(cancellable);
                let completed = false;
                const release = () => activationCancellables.delete(cancellable);
                try {
                    client.activate_connection_async(connection, wifiDevice, null, cancellable, (c, res) => {
                        if (completed)
                            return;
                        completed = true;
                        release();
                        if (destroyed) {
                            finishActivation();
                            return;
                        }
                        try {
                            const activeConnection = c.activate_connection_finish(res);
                            if (!activeConnection)
                                throw new Error('NetworkManager did not return an active connection');
                            watchActivation(activeConnection, ssid, finishActivation);
                        } catch (error) {
                            finishActivation();
                            logError(error, 'material-panel: failed to activate saved network connection');
                            updateActivationStatus('Connection failed. Check the saved password or open Wi-Fi settings.');
                        }
                    });
                } catch (error) {
                    if (completed)
                        return;
                    completed = true;
                    release();
                    finishActivation();
                    if (!destroyed) {
                        logError(error, 'material-panel: failed to start saved network activation');
                        updateActivationStatus('Connection failed. Check the saved password or open Wi-Fi settings.');
                    }
                }
                return;
            }

            // Let NetworkManager create a profile from the selected AP and use
            // GNOME Shell's registered secret agent for any required password.
            // The extension never reads or persists Wi-Fi credentials itself.
            updateActivationStatus(`Connecting to ${ssid}…`);
            const cancellable = new Gio.Cancellable();
            activationCancellables.add(cancellable);
            addAndActivateWifiConnection(client, wifiDevice, accessPoint, {
                cancellable,
                onStarted: activeConnection => {
                    activationCancellables.delete(cancellable);
                    watchActivation(activeConnection, ssid, finishActivation);
                },
                onError: error => {
                    activationCancellables.delete(cancellable);
                    finishActivation();
                    if (destroyed)
                        return;
                    logError(error, 'material-panel: failed to connect to new Wi-Fi network');
                    updateActivationStatus(`Couldn't connect to ${ssid}. Check the password or network security.`);
                },
            });
        };

        let hiddenNetworks = loadHiddenNetworks();
        let hiddenExpanded = false;

        const rebuildNetworkList = () => {
            // Only rebuild the card list. Removing everything from the menu
            // section would also detach the shared Wi-Fi surface.
            const activeId = client.get_primary_connection()?.get_uuid();
            const accessPoints = wifiDevice?.get_access_points?.() || [];
            const savedConnections = client.get_connections()
                .filter(c => c.get_connection_type() === NM.SETTING_WIRELESS_SETTING_NAME);
            const savedBySsid = new Map();
            for (const connection of savedConnections) {
                const ap = findBestAccessPoint(connection, accessPoints);
                if (ap) {
                    const key = ssidKey(connection.get_setting_wireless()?.get_ssid());
                    if (key)
                        savedBySsid.set(key, connection);
                }
            }

            const visibleEntries = [];
            const seen = new Set();
            for (const ap of accessPoints) {
                const info = getAccessPointInfo(ap);
                if (!info?.ssid)
                    continue;
                const raw = ssidKey(ap.get_ssid?.());
                if (!raw || seen.has(raw))
                    continue;
                seen.add(raw);
                const connection = savedBySsid.get(raw) || null;
                visibleEntries.push({ap, info, connection, ssid: info.ssid});
            }
            const sorted = sortAccessPoints(visibleEntries, {activeUuid: activeId, hidden: hiddenNetworks});

            networkCards.destroy_all_children();
            const groupTitle = text => {
                networkCards.add_child(wifiEyebrow(text));
            };

            if (sorted.length === 0 && savedConnections.length === 0) {
                networkCards.add_child(wifiUi('No Wi-Fi networks found',
                    'font-family: "Noto Sans", sans-serif; font-size: 11px; opacity: 0.6; padding: 10px;'));
            } else {
                let sectionTitle = '';
                for (const entry of sorted) {
                    const {info, connection} = entry;
                    const active = connection && connection.get_uuid() === activeId;
                    const group = active ? 'CONNECTED' : connection ? 'KNOWN NETWORKS' : 'OTHER NETWORKS';
                    if (group !== sectionTitle) {
                        sectionTitle = group;
                        groupTitle(group);
                    }
                    const bars = signalGlyph(info.strength) || '·';
                    const state = scanStatus.includes(info.ssid)
                        ? (scanStatus.includes('Connecting') ? 'Connecting…' : 'Working…')
                        : active ? 'Connected' : connection ? '' : 'Connect';
                    const row = new St.Button({
                        style_class: 'material-panel-wifi-row' + (active ? ' active' : ''),
                        reactive: true,
                        can_focus: true,
                        x_expand: true,
                    });
                    const rowBox = new St.BoxLayout({
                        x_expand: true,
                        style: 'spacing: 10px; padding: 9px 10px;',
                    });
                    const sig = wifiUi(bars, 'font-family: "Noto Sans", sans-serif; font-size: 11px; font-weight: 700; width: 44px;');
                    const name = wifiUi(info.ssid, 'font-family: "Noto Sans", sans-serif; font-size: 12px; font-weight: 600; x-expanded: true;');
                    name.x_expand = true;
                    const pct = wifiUi(`${info.strength}%`, 'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.7; width: 30px;');
                    const status = wifiUi(state, 'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.75; width: 62px;');
                    status.x_align = Clutter.ActorAlign.END;
                    rowBox.add_child(sig);
                    rowBox.add_child(name);
                    if (info.secure)
                        rowBox.add_child(wifiLockIcon());
                    rowBox.add_child(pct);
                    rowBox.add_child(status);
                    row.set_child(rowBox);
                    row.connect('clicked', () => activate(connection, entry.ap, info.ssid));
                    row.connect('button-press-event', (_actor, event) => {
                        if (event.get_button() !== 3)
                            return Clutter.EVENT_PROPAGATE;
                        hiddenNetworks = toggleHiddenNetwork(hiddenNetworks, info.ssid);
                        saveHiddenNetworks(hiddenNetworks);
                        rebuildNetworkList();
                        return Clutter.EVENT_STOP;
                    });
                    networkCards.add_child(row);
                }

                const inRange = new Set(sorted.filter(e => e.connection)
                    .map(e => e.connection.get_uuid()));
                const outOfRange = savedConnections.filter(c => !inRange.has(c.get_uuid()));
                if (outOfRange.length) {
                    groupTitle('SAVED · NOT IN RANGE');
                    for (const connection of outOfRange) {
                        networkCards.add_child(wifiUi(connection.get_id(),
                            'font-family: "Noto Sans", sans-serif; font-size: 11px; opacity: 0.7; padding: 6px 10px;'));
                    }
                }
            }

            if (hiddenNetworks.length) {
                const hiddenBtn = new St.Button({
                    label: `HIDDEN (${hiddenNetworks.length})  ${hiddenExpanded ? '▾' : '▸'}`,
                    style_class: 'material-panel-wifi-hidden-btn',
                    reactive: true,
                    x_expand: true,
                });
                hiddenBtn.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px; padding: 7px 10px; border-radius: 8px;';
                hiddenBtn.connect('clicked', () => {
                    hiddenExpanded = !hiddenExpanded;
                    rebuildNetworkList();
                });
                networkCards.add_child(hiddenBtn);
                if (hiddenExpanded) {
                    for (const ssid of hiddenNetworks) {
                        const restore = new St.Button({
                            label: `${ssid}  · Show again`,
                            style_class: 'material-panel-wifi-row',
                            reactive: true,
                            x_expand: true,
                        });
                        restore.style = 'font-family: "Noto Sans", sans-serif; font-size: 11px; padding: 7px 10px; border-radius: 8px;';
                        restore.connect('clicked', () => {
                            hiddenNetworks = toggleHiddenNetwork(hiddenNetworks, ssid);
                            saveHiddenNetworks(hiddenNetworks);
                            rebuildNetworkList();
                        });
                        networkCards.add_child(restore);
                    }
                }
            }
            if (scanStatus)
                networkCards.add_child(wifiUi(scanStatus,
                    'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.5; padding: 8px 10px 0 10px;'));
        };

        const requestWifiScan = () => {
            if (!wifiDevice || scanInFlight || destroyed)
                return;
            scanInFlight = true;
            scanStatus = 'Scanning for nearby networks…';
            rebuildNetworkList();
            scanCancellable = new Gio.Cancellable();
            try {
                wifiDevice.request_scan_async(scanCancellable, (device, result) => {
                    scanInFlight = false;
                    try {
                        device.request_scan_finish(result);
                        scanStatus = 'Scan requested; waiting for nearby network results…';
                    } catch (e) {
                        scanStatus = 'Wi-Fi scan unavailable. Check NetworkManager permissions.';
                        logError(e, 'material-panel: Wi-Fi scan failed');
                    }
                    if (!destroyed)
                        rebuildNetworkList();
                });
            } catch (e) {
                scanInFlight = false;
                scanStatus = 'Unable to request a Wi-Fi scan.';
                logError(e, 'material-panel: unable to request Wi-Fi scan');
                rebuildNetworkList();
            }
        };

        bindWifiDevice();
        rebuildNetworkList();
        menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                bindWifiDevice();
                rebuildNetworkList();
                updateDetails();
                measurePing();
                requestWifiScan();
                probePortal();
                refreshNearby();
            }
        });
        rebuildNetworkList();
        // Captive-portal banner (only shown when a sign-in wall is suspected).
        const portalItem = new St.Button({
            style_class: 'material-panel-wifi-portal',
            reactive: true, can_focus: true, x_expand: true, visible: false,
        });
        try {
            portalItem.set_child(wifiUi('⚠ Connected, but internet may need a sign-in — open browser',
                `font-family: "Noto Sans", sans-serif; color: ${getThemeColor('error', '#ffb4ab')}; font-size: 10px; padding: 8px;`));
        } catch (e) {}
        wifiSurface.add_child(portalItem);
        let portalProbeInFlight = false;
        const probePortal = async () => {
            if (portalProbeInFlight || destroyed)
                return;
            portalProbeInFlight = true;
            const code = await probeCaptivePortal();
            portalProbeInFlight = false;
            if (destroyed)
                return;
            portalItem.visible = classifyCaptivePortal(code) === 'portal';
        };
        portalItem.connect('clicked', closeAfter(menu, () => {
            try { GLib.spawn_command_line_async('xdg-open http://connectivitycheck.gstatic.com/generate_204'); } catch (e) {}
        }));

        // Nearby devices from the kernel ARP/NDP cache (read-only).
        const nearbyCard = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-wifi-detail-card',
            x_expand: true,
            style: 'spacing: 4px; padding: 10px 12px; border-radius: 12px;',
        });
        const nearbyHead = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;'});
        nearbyHead.add_child(wifiEyebrow('NEARBY DEVICES'));
        const nearbyRefresh = new St.Button({label: '↻', reactive: true});
        try { nearbyRefresh.style = 'font-family: "Noto Sans", sans-serif; font-size: 11px; padding: 2px 6px; border-radius: 999px;'; } catch (e) {}
        nearbyHead.add_child(nearbyRefresh);
        nearbyCard.add_child(nearbyHead);
        const nearbyRows = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, style: 'spacing: 2px;',
        });
        nearbyCard.add_child(nearbyRows);
        wifiSurface.add_child(nearbyCard);
        const refreshNearby = async () => {
            if (destroyed)
                return;
            const text = await getNearbyDevices();
            if (destroyed)
                return;
            nearbyRows.destroy_all_children();
            const devices = parseArpNeighbors(text);
            if (!devices.length) {
                nearbyRows.add_child(wifiUi('No devices found',
                    'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.5; padding: 4px;'));
                return;
            }
            for (const device of devices) {
                nearbyRows.add_child(wifiUi(`${device.ip}   ${device.mac}`,
                    'font-family: "Noto Sans", sans-serif; font-size: 10px; opacity: 0.7; padding: 3px 0;'));
            }
        };
        nearbyRefresh.connect('clicked', refreshNearby);

        const settingsBtn = new St.Button({
            label: 'Wi-Fi settings…',
            style_class: 'material-panel-wifi-action',
            reactive: true, can_focus: true, x_expand: true,
        });
        try { settingsBtn.style = 'font-family: "Noto Sans", sans-serif; font-size: 10px; padding: 8px; border-radius: 10px;'; } catch (e) {}
        settingsBtn.connect('clicked', closeAfter(menu, () => {
            // Unknown networks / passwords need the system UI (secret agent)
            const tryCmds = [
                'gnome-control-center wifi',
                'gnome-control-center network',
            ];
            for (const cmd of tryCmds) {
                try {
                    GLib.spawn_command_line_async(cmd);
                    break;
                } catch (e) {}
            }
        }));
        wifiSurface.add_child(settingsBtn);

        const connsChangedId = client.connect('connection-added', rebuildNetworkList);
        const connsRemovedId = client.connect('connection-removed', rebuildNetworkList);
        const activeChangedId = client.connect('notify::primary-connection', rebuildNetworkList);
        const devicesChangedIds = [
            client.connect('device-added', () => {
                bindWifiDevice();
                rebuildNetworkList();
            }),
            client.connect('device-removed', () => {
                bindWifiDevice();
                rebuildNetworkList();
            }),
        ];

        button.connect('destroy', () => {
            unsubscribePopupColors();
            client.disconnect(primaryConnId);
            client.disconnect(wirelessEnabledId);
            client.disconnect(connsChangedId);
            client.disconnect(connsRemovedId);
            client.disconnect(activeChangedId);
            for (const id of devicesChangedIds) {
                try { client.disconnect(id); } catch (e) {}
            }
            for (const id of wifiDeviceSignalIds) {
                try { wifiDevice?.disconnect(id); } catch (e) {}
            }
            wifiDeviceSignalIds = [];
            try { scanCancellable?.cancel(); } catch (e) {}
            for (const disconnect of activationSignals) {
                try { disconnect(); } catch (e) {}
            }
            activationSignals.clear();
        });
    });

    button.connect('button-press-event', () => {
        setChipPressed(true);
        return Clutter.EVENT_PROPAGATE;
    });
    button.connect('button-release-event', () => {
        setChipPressed(false);
        return Clutter.EVENT_PROPAGATE;
    });
    button.connect('leave-event', () => {
        setChipPressed(false);
        return Clutter.EVENT_PROPAGATE;
    });
    try { wireFileIconPress(button, () => [{icon, key: currentIconKey}]); } catch (e) {}
    return button;
}
