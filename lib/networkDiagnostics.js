import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parsePingResult} from './networkDesign.js';

const CAPTIVE_URL = 'http://connectivitycheck.gstatic.com/generate_204';

function run(argv, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        const cancellable = new Gio.Cancellable();
        const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });
        proc.communicate_utf8_async(null, cancellable, (p, res) => {
            GLib.source_remove(timer);
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                if (!p.get_successful())
                    reject(new Error(String(stderr || 'command failed').trim()));
                else
                    resolve(String(stdout || ''));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** Return the HTTP status code of the captive-portal probe, or null. */
export async function probeCaptivePortal() {
    try {
        const out = await run(['curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}',
            '--max-time', '5', CAPTIVE_URL]);
        const code = Number(out.trim());
        return Number.isFinite(code) && code > 0 ? code : null;
    } catch (e) {
        return null;
    }
}

export async function getNearbyDevices() {
    try {
        return await run(['ip', 'neigh', 'show']);
    } catch (e) {
        return '';
    }
}

/** Run a privileged NM/resolved command without throwing into the popup. */
export async function runNetworkCommand(argv, timeoutMs = 6000) {
    try {
        const output = await run(argv, timeoutMs);
        return {success: true, output: String(output || '').trim()};
    } catch (e) {
        return {success: false, error: String(e?.message || e || 'command failed')};
    }
}

/** One ICMP echo probe; returns parsed latency/loss, or null on failure. */
export async function probePing(host) {
    if (!host)
        return null;
    try {
        const out = await run(['ping', '-c', '1', '-W', '1', String(host)], 2500);
        const result = parsePingResult(out);
        return Number.isFinite(result.latencyMs) ? result : null;
    } catch (e) {
        return null;
    }
}

export async function getProcessBandwidthSnapshot() {
    try {
        return await run(['ss', '-tinp']);
    } catch (e) {
        return '';
    }
}
