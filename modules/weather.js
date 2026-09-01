import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {iconPath} from '../lib/iconTheme.js';

// Weather via Open-Meteo (no API key). Location from config later; for now
// use IP-less world default then refine with Open-Meteo's geolocation-free
// forecast requires lat/lon — we resolve via ip-api style endpoint once.
// Primary: Open-Meteo. Fallback: wttr.in JSON via Gio (Soup3 optional).

const OPEN_METEO =
    'https://api.open-meteo.com/v1/forecast?latitude=%LAT%&longitude=%LON%' +
    '&current=temperature_2m,weather_code,is_day&timezone=auto';
// Approximate lat/lon from IP (no key). Failures fall back to a mild default.
const IP_LOC = 'https://ipapi.co/json/';
const WTTR = 'https://wttr.in/?format=j1';

function wmoToIcon(code, isDay) {
    const c = parseInt(code, 10);
    if (c === 0)
        return isDay ? 'weather-sunny' : 'weather-clear-night';
    if ([1, 2].includes(c))
        return 'weather-partly-cloudy';
    if (c === 3)
        return 'weather-cloudy';
    if ([45, 48].includes(c))
        return 'weather-fog';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(c))
        return 'weather-rain';
    if ([71, 73, 75, 77, 85, 86].includes(c))
        return 'weather-snow';
    if ([95, 96, 99].includes(c))
        return 'weather-thunder';
    return 'weather';
}

function wttrCodeToIcon(code, isDay) {
    const c = parseInt(code, 10);
    if (c === 113)
        return isDay ? 'weather-sunny' : 'weather-clear-night';
    if (c === 116)
        return 'weather-partly-cloudy';
    if ([119, 122].includes(c))
        return 'weather-cloudy';
    if ([143, 248, 260].includes(c))
        return 'weather-fog';
    if (c >= 176 && c <= 317)
        return 'weather-rain';
    if (c >= 320 && c <= 377)
        return 'weather-snow';
    if (c >= 380)
        return 'weather-thunder';
    return 'weather';
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        try {
            const file = Gio.File.new_for_uri(url);
            file.load_contents_async(null, (f, res) => {
                try {
                    const [ok, contents] = f.load_contents_finish(res);
                    if (!ok || !contents) {
                        reject(new Error(`load_contents failed for ${url}`));
                        return;
                    }
                    resolve(new TextDecoder('utf-8').decode(contents));
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

export function buildWeather(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-weather material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
        reactive: true,
    });

    let gicon;
    try {
        const p = iconPath('weather');
        gicon = Gio.File.new_for_path(p).query_exists(null)
            ? Gio.FileIcon.new(Gio.File.new_for_path(p))
            : Gio.ThemedIcon.new('weather-few-clouds-symbolic');
    } catch (e) {
        gicon = Gio.ThemedIcon.new('weather-few-clouds-symbolic');
    }

    const icon = new St.Icon({
        style_class: 'material-panel-weather-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon,
    });
    const label = new St.Label({
        style_class: 'material-panel-weather-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '…',
    });
    box.add_child(icon);
    box.add_child(label);

    let lastFetch = 0;
    let inFlight = false;
    let lat = null;
    let lon = null;

    const setIconKey = key => {
        try {
            const p = iconPath(key);
            if (Gio.File.new_for_path(p).query_exists(null))
                icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        } catch (e) {}
    };

    const apply = (tempC, condition, iconKey) => {
        label.text = `${Math.round(tempC)}°`;
        try {
            box.set_tooltip_text(condition ? `${condition}, ${Math.round(tempC)}°C` : `${Math.round(tempC)}°C`);
        } catch (e) {}
        setIconKey(iconKey);
    };

    const fetchOpenMeteo = async () => {
        if (lat == null || lon == null) {
            // Dhaka-ish default if IP lookup fails (user is often BD from context)
            lat = 23.81;
            lon = 90.41;
        }
        const url = OPEN_METEO.replace('%LAT%', lat).replace('%LON%', lon);
        const text = await httpGet(url);
        const json = JSON.parse(text);
        const cur = json.current;
        if (!cur)
            throw new Error('open-meteo: no current');
        const temp = cur.temperature_2m;
        const code = cur.weather_code;
        const isDay = cur.is_day === 1;
        apply(temp, `WMO ${code}`, wmoToIcon(code, isDay));
    };

    const fetchWttr = async () => {
        const text = await httpGet(WTTR);
        const json = JSON.parse(text);
        const current = json.current_condition?.[0];
        if (!current)
            throw new Error('wttr: no current_condition');
        const temp = parseFloat(current.temp_C);
        const code = Array.isArray(current.weatherCode)
            ? current.weatherCode[0]
            : current.weatherCode;
        const condition = current.weatherDesc?.[0]?.value ?? '';
        // Day/night from local hour if no astronomy
        let isDay = true;
        try {
            const hour = GLib.DateTime.new_now_local().get_hour();
            isDay = hour >= 6 && hour < 18;
            const astro = json.weather?.[0]?.astronomy?.[0];
            if (astro?.sunrise && astro?.sunset) {
                // best-effort; ignore parse errors
            }
        } catch (e) {}
        apply(temp, condition, wttrCodeToIcon(code, isDay));
    };

    const resolveLocation = async () => {
        try {
            const text = await httpGet(IP_LOC);
            const j = JSON.parse(text);
            if (j.latitude && j.longitude) {
                lat = Number(j.latitude);
                lon = Number(j.longitude);
                return;
            }
            if (j.lat && j.lon) {
                lat = Number(j.lat);
                lon = Number(j.lon);
            }
        } catch (e) {
            logError(e, 'material-panel: weather IP location failed (using default)');
        }
    };

    const fetchWeather = async () => {
        if (inFlight)
            return;
        inFlight = true;
        try {
            if (lat == null)
                await resolveLocation();
            try {
                await fetchOpenMeteo();
            } catch (e1) {
                logError(e1, 'material-panel: open-meteo failed, trying wttr.in');
                await fetchWttr();
            }
            lastFetch = Date.now();
        } catch (e) {
            logError(e, 'material-panel: weather all sources failed');
            if (label.text === '…' || label.text === '—')
                label.text = '—';
        } finally {
            inFlight = false;
        }
    };

    const tick = () => {
        if (Date.now() - lastFetch > 30 * 60 * 1000)
            fetchWeather();
        return GLib.SOURCE_CONTINUE;
    };

    // Visible immediately; data fills in async
    fetchWeather();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, tick);
    box.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
    });

    return box;
}
