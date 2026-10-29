/**
 * Confirm before power actions (logout / reboot / poweroff).
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {runPowerAction} from './powerAction.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

/**
 * @param {string} title
 * @param {string} body
 * @param {string} confirmLabel
 * @param {string[]} argv
 */
export function confirmAndRun(title, body, confirmLabel, argv) {
    try {
        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'message-dialog-main-layout'});
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
                    runPowerAction(title, argv);
                    try { dialog.close(); } catch (e) {}
                },
                isDefault: false,
            },
        ]);
        dialog.open();
    } catch (e) {
        logError(e, 'material-panel: power confirm dialog failed to open');
        // Fail closed — never run destructive action without confirmation
    }
}
