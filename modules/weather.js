import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';

// Weather widget for middle panel
// Fetches weather from wttr.in (no API key needed)
const WEATHER_URL = 'https://wttr.in/?format=j1';

function getWeatherIcon(weatherCode, isDaytime = true) {
    // wttr.in weather codes: https://www.weatherapi.com/docs/weather_conditions.json
    // Map to our available icons
    const code = parseInt(weatherCode, 10);
    if (isNaN(code)) return 'weather';
    // Clear/sunny
    if (code === 113) return isDaytime ? 'weather-sunny' : 'weather-clear-night';
    // Partly cloudy
    if ([116, 119, 122].includes(code)) return 'weather-partly-cloudy';
    // Cloudy
    if ([143, 176, 179, 182, 185].includes(code)) return 'weather-cloudy';
    // Rain
    if ([200, 203, 206, 209, 212, 215, 218, 221, 224, 227, 230, 233, 236, 239, 242, 245, 248, 251, 254, 257, 260, 263, 266, 269, 272, 275, 278, 281, 284, 287, 290, 293, 296, 299, 302, 305, 308, 311, 314, 317].includes(code)) return 'weather-rain';
    // Snow
    if ([320, 323, 326, 329, 332, 335, 338, 341, 344, 347, 350, 353, 356, 359, 362, 365, 368, 371, 374, 377].includes(code)) return 'weather-snow';
    // Thunder
    if ([380, 383, 386, 389, 392, 395].includes(code)) return 'weather-thunder';
    // Fog/mist
    if ([119, 122, 143, 248, 251, 254, 257, 260, 263, 266].includes(code)) return 'weather-fog';
    return 'weather';
}


/** Parse wttr "06:30 AM" / "18:45" style times to minutes since midnight. */
function parseClockToMinutes(str) {
    if (!str || typeof str !== 'string')
        return null;
    const s = str.trim();
    let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m)
        return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3] ? m[3].toUpperCase() : null;
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
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
                // Normal day: rise < set
                if (rise < set)
                    return nowM >= rise && nowM < set;
                // Polar edge case
                return nowM >= rise || nowM < set;
            }
        }
    } catch (e) {}
    // Fallback: local civil day roughly 06:00–18:00
    const hour = GLib.DateTime.new_now_local().get_hour();
    return hour >= 6 && hour < 18;
}

function formatTemp(tempC) {
    return `${Math.round(tempC)}°C`;
}

function formatCondition(text) {
    // Shorten condition text for display
    return text.length > 20 ? text.substring(0, 18) + '…' : text;
}

export function buildWeather(_extensionPath, scale = 1.0) {
    const box = new St.BoxLayout({
        style_class: 'material-panel-weather material-panel-chip',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
    });

    // Weather icon
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
    let weatherIcon = new St.Icon({
        style_class: 'material-panel-weather-icon',
        icon_size: Math.round(17 * (scale || 1.0)),
        y_align: Clutter.ActorAlign.CENTER,
        gicon: weatherGicon,
    });

    const label = new St.Label({
        style_class: 'material-panel-weather-label',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(weatherIcon);
    box.add_child(label);

    let lastFetch = 0;
    let currentWeather = null;

    const updateLabel = () => {
        if (currentWeather) {
            const temp = formatTemp(currentWeather.temp_C);
            const condition = formatCondition(currentWeather.condition);
            label.text = `${temp} ${condition}`;
            try {
                box.set_tooltip_text(`${currentWeather.condition}, ${currentWeather.temp_C}°C, Feels like ${currentWeather.feelslike_C}°C, Humidity ${currentWeather.humidity}%, Wind ${currentWeather.windspeedKmph} km/h`);
            } catch (e) {}
        } else {
            label.text = '—';
        }
    };

    const fetchWeather = () => {
        try {
            const session = new Soup.SessionAsync();
            const message = Soup.Message.new('GET', WEATHER_URL);
            message.connect('finished', (_s, msg) => {
                if (msg.status_code !== 200) {
                    logError(new Error(`material-panel: weather fetch failed: ${msg.status_code}`));
                    return;
                }
                try {
                    const json = JSON.parse(msg.response_body.data);
                    const current = json.current_condition?.[0];
                    if (current) {
                        currentWeather = {
                            temp_C: parseFloat(current.temp_C),
                            feelslike_C: parseFloat(current.FeelsLikeC),
                            condition: current.weatherDesc?.[0]?.value ?? 'Unknown',
                            humidity: parseInt(current.humidity, 10),
                            windspeedKmph: parseInt(current.windspeedKmph, 10),
                            weatherCode: current.weatherCode,
                        };
                        lastFetch = Date.now();
                        const isDaytime = isDaytimeFromPayload(json);
                        const iconKey = getWeatherIcon(currentWeather.weatherCode, isDaytime);
                        try {
                            const p = iconPath(iconKey);
                            if (Gio.File.new_for_path(p).query_exists(null)) {
                                weatherIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(p));
                            }
                        } catch (e) {
                            logError(e, 'material-panel: failed to update weather icon');
                        }
                        updateLabel();
                    }
                } catch (e) {
                    logError(e, 'material-panel: weather parse failed');
                }
            });
            session.queue_message(message);
        } catch (e) {
            logError(e, 'material-panel: weather request failed');
        }
    };

    // Fetch weather every 30 minutes
    const update = () => {
        if (!currentWeather || Date.now() - lastFetch > 30 * 60 * 1000) {
            fetchWeather();
        }
        return GLib.SOURCE_CONTINUE;
    };

    // Initial fetch
    fetchWeather();
    updateLabel();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, update);
    box.connect('destroy', () => { try { GLib.source_remove(id); } catch (e) {} });

    return box;
}