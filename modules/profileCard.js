import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

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

export function buildProfileCard() {
    const row = new St.BoxLayout({style_class: 'material-panel-qs-profile', x_expand: true});

    const username = GLib.get_user_name() || 'user';
    const hostname = GLib.get_host_name() || 'localhost';
    const initial = username.charAt(0).toUpperCase();

    const avatar = new St.Bin({
        style_class: 'material-panel-qs-avatar',
        child: new St.Label({text: initial, style_class: 'material-panel-qs-avatar-label'}),
    });

    const textBox = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
    const nameLabel = new St.Label({
        text: `${username}@${hostname}`,
        style_class: 'material-panel-qs-profile-name',
    });
    const uptimeLabel = new St.Label({style_class: 'material-panel-qs-profile-sub'});
    textBox.add_child(nameLabel);
    textBox.add_child(uptimeLabel);

    row.add_child(avatar);
    row.add_child(textBox);

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
