import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireChipPress} from '../lib/pressFx.js';
import {setChipA11y} from '../lib/a11y.js';
import {isSessionLocked} from '../lib/shellCompat.js';

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

async function getAvatarFile() {
    const user = GLib.get_user_name() || '';
    const candidates = [
        GLib.build_filenamev(['/var/lib/AccountsService/icons', user]),
        GLib.build_filenamev([GLib.get_home_dir(), '.face']),
        GLib.build_filenamev([GLib.get_home_dir(), '.face.icon']),
    ];

    // AccountsService is optional. Use its non-blocking manager API and keep
    // the initial-letter avatar available while the lookup completes.
    try {
        const Act = (await import('gi://Act')).default;
        const manager = Act.UserManager.get_default();
        const account = manager?.get_user(user);
        const iconFile = account?.get_icon_file?.();
        if (iconFile)
            candidates.unshift(iconFile);
    } catch (e) {
        // Missing AccountsService/GIR is normal on some systems.
    }

    for (const path of candidates) {
        if (!path)
            continue;
        try {
            if (Gio.File.new_for_path(path).query_exists(null))
                return path;
        } catch (e) {
            // Ignore unavailable or inaccessible avatar paths.
        }
    }
    return null;
}

function buildAvatar(initial) {
    const avatar = new St.Bin({
        style_class: 'material-panel-qs-avatar',
        child: new St.Label({text: initial, style_class: 'material-panel-qs-avatar-label'}),
        clip_to_allocation: true,
    });
    avatar.set_size(36, 36);

    // Resolve AccountsService asynchronously; never block Shell startup for
    // the avatar. If no file is found, the initial-letter fallback stays.
    getAvatarFile().then(file => {
        if (!file || !avatar.get_parent())
            return;
        try {
            avatar.set_child(new St.Icon({
                gicon: Gio.FileIcon.new(Gio.File.new_for_path(file)),
                icon_size: 36,
                style_class: 'material-panel-qs-avatar-image',
            }));
        } catch (e) {
            // Preserve the fallback avatar if the image cannot be displayed.
        }
    }).catch(() => {});

    return avatar;
}

export function buildProfileCard({onPrefs = null} = {}) {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-profile', x_expand: true});

    const username = GLib.get_user_name() || 'user';
    const hostname = GLib.get_host_name() || 'localhost';
    const realName = (() => { try { const rn = GLib.get_real_name(); if (rn && rn !== username && rn.trim()) return rn; } catch (e) {} return username; })();
    const hideIdentity = globalThis._materialPanelHideProfileIdentity === true;
    const initial = hideIdentity ? 'U' : (realName || username).charAt(0).toUpperCase();

    const avatar = buildAvatar(initial);

    const textBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    const displayName = realName !== username ? realName : username;
    const nameLabel = new St.Label({
        text: hideIdentity ? 'User' : `${displayName}@${hostname}`,
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
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: prefsIcon,
        });
        setChipA11y(prefsBtn, 'Open panel preferences');
        wireChipPress(prefsBtn, {
            getIcons: () => [{icon: prefsIcon, key: 'settings'}],
            stickyUntilLeave: true,
        });
        prefsBtn.connect('clicked', () => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                try { onPrefs(); } catch (e) { logError(e, 'material-panel: profile prefs click'); }
                return GLib.SOURCE_REMOVE;
            });
        });

        row.add_child(prefsBtn);
    }

    const updateUptime = () => {
        if (isSessionLocked() || !row.is_mapped)
            return GLib.SOURCE_CONTINUE;
        const secs = readUptimeSeconds();
        uptimeLabel.text = secs !== null ? `Uptime ${formatUptime(secs)}` : 'Uptime unknown';
        return GLib.SOURCE_CONTINUE;
    };
    // Populate the initial label once; periodic /proc reads only run while
    // the profile card is actually mapped inside an open Quick Settings popup.
    const initialUptime = readUptimeSeconds();
    uptimeLabel.text = initialUptime !== null
        ? `Uptime ${formatUptime(initialUptime)}`
        : 'Uptime unknown';
    const sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, updateUptime);
    row.connect('destroy', () => GLib.source_remove(sourceId));

    return row;
}
