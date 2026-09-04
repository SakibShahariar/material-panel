import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function readUptimeSeconds() {
    try {
        const [ok, contents] = Gio.File.new_for_path('/proc/uptime').load_contents(null);
        if (!ok)
            return null;
        return parseFloat(new TextDecoder('utf-8').decode(contents).split(' ')[0]);
    } catch (e) {
        return null;
    }
}

function getAvatarFile() {
    const user = GLib.get_user_name() || '';
    const candidates = [
        GLib.build_filenamev(['/var/lib/AccountsService/icons', user]),
        GLib.build_filenamev([GLib.get_home_dir(), '.face']),
        GLib.build_filenamev([GLib.get_home_dir(), '.face.icon']),
        // AccountsService D-Bus IconFile via Act (if available) - try import lazily
    ];
    // Try Act.UserManager if GIR available
    try {
        // Dynamic import via gi://Act is optional; if not installed this throws
        const Act = imports.gi.Act;
        if (Act) {
            const mgr = Act.UserManager.get_default_sync(null);
            const u = mgr?.get_user(user);
            const f = u?.get_icon_file?.();
            if (f) candidates.unshift(f);
        }
    } catch (e) {}
    for (const p of candidates) {
        if (!p) continue;
        try {
            const f = Gio.File.new_for_path(p);
            if (f.query_exists(null)) return p;
        } catch (e) {}
    }
    return null;
}

function buildAvatar(initial) {
    const file = getAvatarFile();
    if (file) {
        // Use background-image so border-radius 999px clips to circle
        const avatar = new St.Bin({
            style_class: 'material-panel-qs-avatar',
            style: `background-image: url("file://${file}"); background-size: cover; background-position: center;`,
        });
        // Ensure size is explicit (stylesheet gives 36px via CSS, but background needs bin size)
        avatar.set_size(36, 36);
        return avatar;
    }
    return new St.Bin({
        style_class: 'material-panel-qs-avatar',
        child: new St.Label({text: initial, style_class: 'material-panel-qs-avatar-label'}),
    });
}

export function buildProfileCard({onPrefs = null} = {}) {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-profile', x_expand: true});

    const username = GLib.get_user_name() || 'user';
    const hostname = GLib.get_host_name() || 'localhost';
    const realName = (() => { try { const rn = GLib.get_real_name(); if (rn && rn !== username && rn.trim()) return rn; } catch (e) {} return username; })();
    const initial = (realName || username).charAt(0).toUpperCase();

    const avatar = buildAvatar(initial);

    const textBox = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    const displayName = realName !== username ? realName : username;
    const nameLabel = new St.Label({
        text: `${displayName}@${hostname}`,
        style_class: 'material-panel-qs-profile-name',
    });
    const uptimeLabel = new St.Label({style_class: 'material-panel-qs-profile-sub'});
    textBox.add_child(nameLabel);
    textBox.add_child(uptimeLabel);

    row.add_child(avatar);
    row.add_child(textBox);

    // Settings gear — top of QS, inside user info card
    if (onPrefs) {
        let settingsPath = iconPathPrimary('settings');
        try {
            if (!Gio.File.new_for_path(settingsPath).query_exists(null))
                settingsPath = iconPath('settings');
        } catch (e) {
            settingsPath = iconPath('settings');
        }
        const prefsIcon = new St.Icon({
            icon_size: 18,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'material-panel-qs-profile-prefs-icon',
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(settingsPath)),
        });
        const prefsBtn = new St.Button({
            style_class: 'material-panel-qs-profile-prefs',
            reactive: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: prefsIcon,
        });
        wireFileIconPress(prefsBtn, () => [{icon: prefsIcon, key: 'settings'}]);
        prefsBtn.connect('clicked', () => {
            try { onPrefs(); } catch (e) { logError(e, 'material-panel: profile prefs click'); }
        });
        row.add_child(prefsBtn);
    }

    const updateUptime = () => {
        const secs = readUptimeSeconds();
        uptimeLabel.text = secs !== null ? `Uptime ${formatUptime(secs)}` : 'Uptime unknown';
        return GLib.SOURCE_CONTINUE;
    };
    updateUptime();
    const sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, updateUptime);
    row.connect('destroy', () => GLib.source_remove(sourceId));

    return row;
}
