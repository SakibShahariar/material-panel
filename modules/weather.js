import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';

import {iconPath} from '../lib/iconTheme.js';

// wttr.in JSON — no API key. Soup3 async (Shell 45+/50; queue_message is gone).
const WEATHER_URL = 'https://wttr.in/?format=j1';

function getWeatherIcon(weatherCode, isDaytime = true) {
    const code = parseInt(weatherCode, 10);
    if (isNaN(code))
        return 'weather';
    if (code === 113)
        return isDaytime ? 'weather-sunny' : 'weather-clear-night';
    if ([116].includes(code))
        return 'weather-partly-cloudy';
    if ([119, 122].includes(code))
        return 'weather-cloudy';
    if ([143, 248, 260].includes(code))
        return 'weather-fog';
    // Rain-ish / drizzle
    if (code >= 176 && code <= 317)
        return 'weather-rain';
    if (code >= 320 && code <= 377)
        return 'weather-snow';
    if (code >= 380 && code <= 395)
        return 'weather-thunder';
    return 'weather';
}

function parseClockToMinutes(str) {
    if (!str || typeof str !== 'string')
        return null;
    const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m)
        return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3] ? m[3].toUpperCase() : null;
    if (ap === 'PM' && h < 12)
        h += 12;
    if (ap === 'AM' && h === 12)
        h = 0;
    return h * 60 + min;
}

function isDaytimeFromPayload(json) {
    try {
        const astro = json?.weather?.[0]?.astronomy?.[0];
        if (astro) {
            const rise = parseClockToMinutes(astro.sunrise);
            const set = parseClockToMinutes(astro.sunset);
            const now = GLib.DateTime.new_now_local();
            const nowM = now.get_hour() * 60 + now.get_minute();
            if (rise != null && set != null) {
                if (rise < set)
                    return nowM >= rise && nowM < set;
                return nowM >= rise || nowM < set;
            }
        }
    } catch (e) {}
    const hour = GLib.DateTime.new_now_local().get_hour();
    return hour >= 6 && hour < 18;
}

function formatTemp(tempC) {
    return `${Math.round(tempC)}°C`;
}

function unpackCode(raw) {
    if (raw == null)
        return '';
    if (Array.isArray(raw))
        return String(raw[0] ?? '');
    return String(raw);
}

export function buildWeather(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-weather material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });

    let weatherGicon;
    try {
        const p = iconPath('weather');
        if (Gio.File.new_for_path(p).query_exists(null))
            weatherGicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        else
            weatherGicon = Gio.ThemedIcon.new('weather-clear-symbolic');
    } catch (e) {
        weatherGicon = Gio.ThemedIcon.new('weather-clear-symbolic');
    }

    const weatherIcon = new St.Icon({
        style_class: 'material-panel-weather-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: weatherGicon,
    });
    const label = new St.Label({
        style_class: 'material-panel-weather-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '…',
    });
    box.add_child(weatherIcon);
    box.add_child(label);

    let lastFetch = 0;
    let currentWeather = null;
    let session = null;
    let inFlight = false;

    const updateLabel = () => {
        if (currentWeather) {
            label.text = formatTemp(currentWeather.temp_C);
            try {
                box.set_tooltip_text(
                    `${currentWeather.condition}, ${currentWeather.temp_C}°C · ` +
                    `Feels ${currentWeather.feelslike_C}°C · ` +
                    `Humidity ${currentWeather.humidity}% · ` +
                    `Wind ${currentWeather.windspeedKmph} km/h`);
            } catch (e) {}
        } else {
            label.text = '—';
        }
    };

    const applyIcon = (iconKey) => {
        try {
            const p = iconPath(iconKey);
            if (Gio.File.new_for_path(p).query_exists(null))
                weatherIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
        } catch (e) {
            logError(e, 'material-panel: weather icon update failed');
        }
    };

    const fetchWeather = () => {
        if (inFlight)
            return;
        inFlight = true;
        try {
            if (!session)
                session = new Soup.Session();
            // wttr.in blocks empty / non-browser UAs sometimes
            try {
                session.user_agent = 'material-panel/1.0 (GNOME Shell extension)';
            } catch (e) {}

            const message = Soup.Message.new('GET', WEATHER_URL);
            if (!message) {
                inFlight = false;
                logError(new Error('material-panel: Soup.Message.new failed'));
                return;
            }

            session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (_s, res) => {
                    inFlight = false;
                    try {
                        const bytes = session.send_and_read_finish(res);
                        // HTTP status (Soup3)
                        let status = 0;
                        try {
                            status = message.get_status();
                        } catch (e) {
                            try { status = message.status_code; } catch (e2) {}
                        }
                        if (status && status >= 400) {
                            logError(new Error(`material-panel: weather HTTP ${status}`));
                            updateLabel();
                            return;
                        }
                        const data = bytes.get_data();
                        if (!data || data.length === 0) {
                            logError(new Error('material-panel: weather empty body'));
                            return;
                        }
                        const text = new TextDecoder('utf-8').decode(data);
                        const json = JSON.parse(text);
                        const current = json.current_condition?.[0];
                        if (!current) {
                            logError(new Error('material-panel: weather missing current_condition'));
                            return;
                        }
                        currentWeather = {
                            temp_C: parseFloat(current.temp_C),
                            feelslike_C: parseFloat(current.FeelsLikeC),
                            condition: current.weatherDesc?.[0]?.value ?? 'Unknown',
                            humidity: parseInt(current.humidity, 10),
                            windspeedKmph: parseInt(current.windspeedKmph, 10),
                            weatherCode: unpackCode(current.weatherCode),
                        };
                        lastFetch = Date.now();
                        const isDaytime = isDaytimeFromPayload(json);
                        applyIcon(getWeatherIcon(currentWeather.weatherCode, isDaytime));
                        updateLabel();
                    } catch (e) {
                        logError(e, 'material-panel: weather fetch/parse failed');
                        updateLabel();
                    }
                });
        } catch (e) {
            inFlight = false;
            logError(e, 'material-panel: weather request failed');
            updateLabel();
        }
    };

    const tick = () => {
        if (!currentWeather || Date.now() - lastFetch > 30 * 60 * 1000)
            fetchWeather();
        return GLib.SOURCE_CONTINUE;
    };

    fetchWeather();
    updateLabel();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, tick);
    box.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        session = null;
    });

    return box;
}
