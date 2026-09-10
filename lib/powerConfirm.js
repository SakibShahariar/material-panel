/**
 * Confirm before power actions (logout / reboot / poweroff).
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

/**
 * @param {string} title
 * @param {string} body
 * @param {string} confirmLabel
 * @param {string} cmd
 */
export function confirmAndRun(title, body, confirmLabel, cmd) {
    try {
        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        const box = new St.BoxLayout({vertical: true, style_class: 'message-dialog-main-layout'});
        try { box.style = 'spacing: 12px; padding: 8px;'; } catch (e) {}
        const t = new St.Label({text: title, style_class: 'message-dialog-title'});
        try { t.style = 'font-weight: 700; font-size: 16px;'; } catch (e) {}
        const b = new St.Label({text: body, style_class: 'message-dialog-body'});
        try {
            b.clutter_text.line_wrap = true;
            b.style = 'opacity: 0.85;';
        } catch (e) {}
        box.add_child(t);
        box.add_child(b);
        dialog.contentLayout.add_child(box);
        dialog.setButtons([
            {
                label: 'Cancel',
                action: () => {
                    try { dialog.close(); } catch (e) {}
                },
                key: Clutter.KEY_Escape,
            },
            {
                label: confirmLabel || 'Confirm',
                action: () => {
                    try { GLib.spawn_command_line_async(cmd); } catch (e) {}
                    try { dialog.close(); } catch (e) {}
                },
                isDefault: true,
            },
        ]);
        dialog.open();
    } catch (e) {
        // Fallback: run without dialog if ModalDialog unavailable
        try { GLib.spawn_command_line_async(cmd); } catch (e2) {}
    }
}
