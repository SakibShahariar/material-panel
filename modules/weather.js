import {setChipA11y} from '../lib/a11y.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';
import {menuOpen, menuClose} from '../lib/shellCompat.js';
import {radiansToDegreesLatLon} from '../lib/weatherCoordinates.js';
import {getWeatherCache, setWeatherCache} from '../lib/weatherCache.js';

// Prefer the configured GNOME Weather location or explicit coordinates.
// Never infer a city from IP data or show an unrelated default forecast.

const OPEN_METEO =
    'https://api.open-meteo.com/v1/forecast?latitude=%LAT%&longitude=%LON%' +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&forecast_days=6&timezone=auto';

let _GWeather = undefined; // undefined = not tried, null = unavailable

async function ensureGWeather() {
    if (_GWeather !== undefined)
        return _GWeather;
    try {
        _GWeather = (await import('gi://GWeather')).default;
        return _GWeather;
    } catch (e1) {
        try {
            _GWeather = (await import('gi://GWeather?version=4.0')).default;
            return _GWeather;
        } catch (e2) {
            log('material-panel: GWeather GIR missing — Open-Meteo fallback only');
            _GWeather = null;
            return null;
        }
    }
}

function wmoToCondition(code, isDay) {
    const c = parseInt(code, 10);
    if (c === 0)
        return isDay ? 'Clear' : 'Clear night';
    if (c === 1)
        return isDay ? 'Mainly clear' : 'Mainly clear night';
    if (c === 2)
        return 'Partly cloudy';
    if (c === 3)
        return 'Overcast';
    if ([45, 48].includes(c))
        return 'Fog';
    if ([51, 53, 55, 56, 57].includes(c))
        return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c))
        return 'Rain';
    if ([71, 73, 75, 77, 85, 86].includes(c))
        return 'Snow';
    if ([95, 96, 99].includes(c))
        return 'Thunderstorm';
    return 'Weather';
}

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

function httpGet(url, cancellable = null) {
    return new Promise((resolve, reject) => {
        const requestCancellable = new Gio.Cancellable();
        let settled = false;
        let timeoutId = 0;
        let outerCancelId = 0;
        try {
            if (cancellable)
                outerCancelId = cancellable.connect(() => requestCancellable.cancel());
        } catch (e) {}
        const finish = (callback, value) => {
            if (settled)
                return;
            settled = true;
            if (timeoutId) {
                try { GLib.source_remove(timeoutId); } catch (e) {}
                timeoutId = 0;
            }
            if (outerCancelId) {
                try { cancellable.disconnect(outerCancelId); } catch (e) {}
                outerCancelId = 0;
            }
            callback(value);
        };
        timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
            requestCancellable.cancel();
            finish(reject, new Error('Weather request timed out after 20 seconds'));
            return GLib.SOURCE_REMOVE;
        });
        try {
            const file = Gio.File.new_for_uri(url);
            file.load_contents_async(requestCancellable, (f, res) => {
                try {
                    const [ok, contents] = f.load_contents_finish(res);
                    if (!ok || !contents) {
                        finish(reject, new Error(`load failed ${url}`));
                        return;
                    }
                    finish(resolve, new TextDecoder('utf-8').decode(contents));
                } catch (e) {
                    finish(reject, e);
                }
            });
        } catch (e) {
            finish(reject, e);
        }
    });
}


/**
 * Safe path: parse `gsettings get org.gnome.Weather locations` text.
 * Avoids deep GVariant walks that can native-crash the Shell.
 */
function loadGnomeWeatherLocationFromGsettingsText() {
    let text = null;
    try {
        const source = Gio.SettingsSchemaSource.get_default();
        if (source?.lookup?.('org.gnome.Weather', true)) {
            const settings = new Gio.Settings({schema_id: 'org.gnome.Weather'});
            const value = settings.get_value('locations');
            if (value && value.n_children() >= 1)
                text = value.print(true);
        }
    } catch (e) {}
    try {
        // GSettings is the non-blocking-in-spirit in-process source of truth;
        // if the schema is unavailable, report no configured location rather
        // than launching a synchronous gsettings subprocess on the Shell thread.
        if (!text)
            return null;
        if (!text || text.includes('@as []') || text.trim() === '@as []')
            return null;

        // City name: first quoted string that is not a 3–4 letter ICAO-like code
        let name = 'GNOME Weather';
        const names = [...text.matchAll(/'([^']{2,64})'/g)].map(m => m[1]);
        for (const n of names) {
            if (/^[A-Z0-9]{3,4}$/.test(n))
                continue;
            if (/^(true|false)$/i.test(n))
                continue;
            name = n;
            break;
        }

        // First coordinate pair: (0.416..., 1.577...) radians or degrees
        const pair = text.match(/\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)/);
        if (!pair)
            return null;
        const norm = radiansToDegreesLatLon(pair[1], pair[2]);
        if (!norm)
            return null;
        return {location: null, name, lat: norm.lat, lon: norm.lon};
    } catch (e) {
        logError(e, 'material-panel: gsettings weather locations');
        return null;
    }
}

/** @returns {Promise<{location, name, lat, lon}|null>} */
async function loadGnomeWeatherLocation() {
    // 1) CLI parse — safest (no GVariant / GWeather native deserialize)
    try {
        const fromText = loadGnomeWeatherLocationFromGsettingsText();
        if (fromText) {
            log(`material-panel: weather loc "${fromText.name}" ${fromText.lat.toFixed(2)},${fromText.lon.toFixed(2)} (gsettings)`);
            return fromText;
        }
    } catch (e) {
        logError(e, 'material-panel: weather gsettings path');
    }

    // 2) Optional libgweather — fully try/caught
    try {
        const GWeather = await ensureGWeather();
        if (!GWeather)
            return null;
        const schema = 'org.gnome.Weather';
        const source = Gio.SettingsSchemaSource.get_default();
        if (!source?.lookup?.(schema, true))
            return null;
        const settings = new Gio.Settings({schema_id: schema});
        const value = settings.get_value('locations');
        if (!value || value.n_children() < 1)
            return null;
        const world = GWeather.Location.get_world();
        if (!world)
            return null;
        const child = value.get_child_value(0);
        let loc = null;
        try {
            loc = world.deserialize(child);
        } catch (e) {
            return null;
        }
        if (!loc)
            return null;
        let lat = null, lon = null;
        try {
            const coords = loc.get_coords();
            lat = Array.isArray(coords) ? coords[0] : coords?.[0];
            lon = Array.isArray(coords) ? coords[1] : coords?.[1];
        } catch (e) {}
        let name = '';
        try {
            name = loc.get_city_name?.() || loc.get_name?.() || '';
        } catch (e) {}
        const norm = radiansToDegreesLatLon(lat, lon);
        if (!norm)
            return null;
        log(`material-panel: weather loc "${name}" ${norm.lat.toFixed(2)},${norm.lon.toFixed(2)} (GWeather)`);
        return {location: loc, name, lat: norm.lat, lon: norm.lon};
    } catch (e) {
        logError(e, 'material-panel: loadGnomeWeatherLocation');
        return null;
    }
}

async function fetchOpenMeteo(lat, lon, place, sourceTag, cancellable = null) {
    const url = OPEN_METEO.replace('%LAT%', lat).replace('%LON%', lon);
    const text = await httpGet(url, cancellable);
    const json = JSON.parse(text);
    const cur = json.current;
    if (!cur)
        throw new Error('open-meteo: no current');
    const isDay = cur.is_day === 1;

    // Hourly: next 12 hours from current local hour
    const hourly = [];
    try {
        const times = json.hourly?.time || [];
        const temps = json.hourly?.temperature_2m || [];
        const codes = json.hourly?.weather_code || [];
        const pops = json.hourly?.precipitation_probability || [];
        const nowLocal = GLib.DateTime.new_now_local();
        const nowKey = nowLocal.format('%Y-%m-%dT%H') || '';
        let start = 0;
        for (let i = 0; i < times.length; i++) {
            const key = String(times[i]).slice(0, 13); // YYYY-MM-DDTHH
            if (key >= nowKey) {
                start = i;
                break;
            }
            start = i; // keep last past hour if all past
        }
        for (let i = start; i < times.length && hourly.length < 12; i++) {
            const ts = String(times[i]);
            let hh = ts.includes('T') ? ts.split('T')[1].slice(0, 5) : ts;
            // Prefer "9 PM" style short label
            let hourNum = 0;
            try {
                hourNum = parseInt(hh.slice(0, 2), 10);
                const ampm = hourNum >= 12 ? 'PM' : 'AM';
                const h12 = hourNum % 12 || 12;
                hh = `${h12} ${ampm}`;
            } catch (e) {}
            const dayPart = hourNum >= 6 && hourNum < 18; // 0–5, 18–23 night
            hourly.push({
                time: hh,
                temp: temps[i],
                code: codes[i],
                pop: pops[i],
                iconKey: wmoToIcon(codes[i], dayPart),
            });
        }
    } catch (e) {
        logError(e, 'material-panel: weather hourly parse');
    }

    // Daily labels: Today / weekday
    const daily = [];
    try {
        const times = json.daily?.time || [];
        const maxs = json.daily?.temperature_2m_max || [];
        const mins = json.daily?.temperature_2m_min || [];
        const codes = json.daily?.weather_code || [];
        const pops = json.daily?.precipitation_probability_max || [];
        const today = GLib.DateTime.new_now_local().format('%Y-%m-%d');
        for (let i = 0; i < times.length && daily.length < 6; i++) {
            const date = String(times[i]).slice(0, 10);
            let label = date.slice(5); // MM-DD fallback
            try {
                if (date === today) {
                    label = 'Today';
                } else {
                    const [y, m, d] = date.split('-').map(Number);
                    const dt = GLib.DateTime.new_local(y, m, d, 12, 0, 0);
                    const dow = dt?.get_day_of_week?.() || 0; // 1=Mon … 7=Sun
                    label = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow - 1]
                        || date.slice(5);
                }
            } catch (e) {
                label = date === today ? 'Today' : date.slice(5);
            }
            daily.push({
                date,
                label,
                max: maxs[i],
                min: mins[i],
                code: codes[i],
                pop: pops[i],
                iconKey: wmoToIcon(codes[i], true),
                condition: wmoToCondition(codes[i], true),
            });
        }
    } catch (e) {}

    return {
        temp: cur.temperature_2m,
        feelsLike: cur.apparent_temperature != null ? Number(cur.apparent_temperature) : null,
        condition: wmoToCondition(cur.weather_code, isDay),
        iconKey: wmoToIcon(cur.weather_code, isDay),
        humidity: cur.relative_humidity_2m != null ? Number(cur.relative_humidity_2m) : null,
        wind: cur.wind_speed_10m != null ? Number(cur.wind_speed_10m) : null,
        place: place || `${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)}`,
        source: sourceTag || 'Open-Meteo',
        hourly,
        daily,
        isDay,
    };
}

export function buildWeather(_extensionPath, scale = 1.0) {
    const cancellable = new Gio.Cancellable();

    const box = new St.BoxLayout({
        style_class: 'material-panel-weather',
        y_align: Clutter.ActorAlign.CENTER,
        orientation: Clutter.Orientation.HORIZONTAL,
    });

    let gicon;
    try {
        let pth = iconPathPrimary('weather');
        if (!Gio.File.new_for_path(pth).query_exists(null))
            pth = iconPath('weather');
        gicon = Gio.File.new_for_path(pth).query_exists(null)
            ? Gio.FileIcon.new(Gio.File.new_for_path(pth))
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
        text: '—°',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(icon);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'material-panel-weather-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        can_focus: true,
        child: box,
    });

    let detail = null;
    let lastSuccessAt = 0;
    let destroyed = false;
    let initialFetchId = 0;
    let fetchInFlight = false;
    let retryId = 0;
    let retryDelaySeconds = 60;

    const setChipIcon = key => {
        try {
            let pth = iconPathPrimary(key);
            if (!Gio.File.new_for_path(pth).query_exists(null))
                pth = iconPath(key);
            if (Gio.File.new_for_path(pth).query_exists(null))
                icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
    };

    const apply = (data, savedAt = 0) => {
        if (destroyed)
            return;
        detail = data;
        if (data?.temp != null)
            lastSuccessAt = savedAt || GLib.get_monotonic_time();
        if (data?.temp != null)
            label.text = `${Math.round(data.temp)}°`;
        else
            label.text = '—°';
        // Make fallback location explicit even when the popup is closed.
        try {
            const fallback = data?.source === 'Open-Meteo · default location';
            button.set_tooltip_text(fallback
                ? `Weather: ${data.place} — default fallback, not your detected location`
                : `Weather: ${data?.place || 'Location unavailable'}`);
        } catch (e) {}
        if (data?.iconKey)
            setChipIcon(data.iconKey);
        try { fillPopup(); } catch (e) {}
    };

    // ── Popup (Omarchy-inspired) ──
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-weather-popup');
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-weather-popup-body',
        x_expand: true,
    });
    try {
        body.style = 'spacing: 12px; padding: 14px 16px 12px 16px; min-width: 300px; max-width: 360px;';
    } catch (e) {}

    const placeLbl = new St.Label({
        text: 'Weather',
        style_class: 'material-panel-weather-popup-place',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    try { placeLbl.style = 'font-size: 12px; font-weight: 600; opacity: 0.7; text-align: center;'; } catch (e) {}

    // Hero: [ big icon ] [ temp + condition + feels ] — single column text, no float
    const hero = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-weather-popup-hero',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try {
        hero.style = 'spacing: 16px; padding: 6px 8px 8px 8px;';
    } catch (e) {}

    const heroIcon = new St.Icon({
        icon_size: 48,
        style_class: 'material-panel-weather-popup-hero-icon',
        gicon,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const heroText = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: false,
    });
    try { heroText.style = 'spacing: 2px;'; } catch (e) {}
    const tempLbl = new St.Label({
        text: '—°',
        style_class: 'material-panel-weather-popup-temp',
    });
    try { tempLbl.style = 'font-size: 34px; font-weight: 700;'; } catch (e) {}
    const condLbl = new St.Label({
        text: '',
        style_class: 'material-panel-weather-popup-cond',
    });
    try { condLbl.style = 'font-size: 13px; font-weight: 600;'; } catch (e) {}
    const feelsLbl = new St.Label({
        text: '',
        style_class: 'material-panel-weather-popup-feels',
    });
    try { feelsLbl.style = 'font-size: 11px; opacity: 0.7; padding-top: 2px;'; } catch (e) {}
    heroText.add_child(tempLbl);
    heroText.add_child(condLbl);
    heroText.add_child(feelsLbl);
    hero.add_child(heroIcon);
    hero.add_child(heroText);

    // Stats row
    const stats = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-weather-popup-stats',
        x_expand: true,
    });
    try { stats.style = 'spacing: 8px; padding: 2px 0;'; } catch (e) {}
    const mkStat = (title) => {
        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-weather-stat-card',
            x_expand: true,
        });
        try {
            card.style = 'padding: 10px 8px; border-radius: 14px; spacing: 4px;';
        } catch (e) {}
        const t = new St.Label({text: title, style_class: 'material-panel-weather-stat-label'});
        try { t.style = 'font-size: 10px; opacity: 0.65;'; } catch (e) {}
        const v = new St.Label({text: '—', style_class: 'material-panel-weather-stat-value'});
        try { v.style = 'font-size: 13px; font-weight: 700;'; } catch (e) {}
        card.add_child(t);
        card.add_child(v);
        return {card, value: v};
    };
    const humidityStat = mkStat('Humidity');
    const windStat = mkStat('Wind');
    const rainStat = mkStat('Rain today');
    stats.add_child(humidityStat.card);
    stats.add_child(windStat.card);
    stats.add_child(rainStat.card);

    // Hourly section
    const hourlyTitle = new St.Label({
        text: 'Hourly',
        style_class: 'material-panel-weather-section-title',
    });
    try { hourlyTitle.style = 'font-size: 11px; font-weight: 700; opacity: 0.7;'; } catch (e) {}

    const hourlyScroll = new St.ScrollView({
        style_class: 'material-panel-weather-hourly-scroll',
        overlay_scrollbars: true,
        x_expand: true,
    });
    try {
        hourlyScroll.overlay_scrollbars = true;
        if (St.PolicyType)
            hourlyScroll.set_policy(St.PolicyType.AUTOMATIC, St.PolicyType.NEVER);
        hourlyScroll.style = 'max-height: 100px;';
    } catch (e) {}
    const hourlyRow = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        style_class: 'material-panel-weather-hourly-row',
    });
    try { hourlyRow.style = 'spacing: 6px; padding: 4px 2px;'; } catch (e) {}
    try {
        hourlyScroll.add_child(hourlyRow);
    } catch (e) {
        try { hourlyScroll.add_actor(hourlyRow); } catch (e2) {}
    }

    // Daily section
    const dailyTitle = new St.Label({
        text: 'Next days',
        style_class: 'material-panel-weather-section-title',
    });
    try { dailyTitle.style = 'font-size: 11px; font-weight: 700; opacity: 0.7;'; } catch (e) {}
    const dailyCol = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'material-panel-weather-daily-col',
        x_expand: true,
    });
    try { dailyCol.style = 'spacing: 4px;'; } catch (e) {}

    const sourceLbl = new St.Label({
        text: '',
        style_class: 'material-panel-weather-popup-source',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    try { sourceLbl.style = 'font-size: 10px; opacity: 0.35; padding-top: 6px;'; } catch (e) {}

    body.add_child(placeLbl);
    body.add_child(hero);
    body.add_child(stats);
    body.add_child(hourlyTitle);
    body.add_child(hourlyScroll);
    body.add_child(dailyTitle);
    body.add_child(dailyCol);
    body.add_child(sourceLbl);

    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
    item.add_child(body);
    menu.addMenuItem(item);

    const changeLocationItem = new PopupMenu.PopupMenuItem('Change location…');
    changeLocationItem.connect('activate', () => {
        menu.close();
        try {
            Main.extensionManager.openExtensionPrefs('material-panel@SakibShahariar', '', {});
        } catch (e) {
            logError(e, 'material-panel: open weather location preferences');
        }
    });
    menu.addMenuItem(changeLocationItem);

    const iconForKey = key => {
        try {
            let pth = iconPathPrimary(key);
            if (!Gio.File.new_for_path(pth).query_exists(null))
                pth = iconPath(key);
            if (Gio.File.new_for_path(pth).query_exists(null))
                return Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
        return Gio.ThemedIcon.new('weather-few-clouds-symbolic');
    };

    const hourlyCells = new Map();
    const dailyRows = new Map();

    const reconcileWeatherRows = (container, cache, items, keyFor, createRow, updateRow) => {
        const retained = new Set();
        items.forEach((item, index) => {
            const key = String(keyFor(item, index));
            retained.add(key);
            let actor = cache.get(key);
            if (!actor) {
                actor = createRow();
                cache.set(key, actor);
            }
            updateRow(actor, item);
            const parent = actor.get_parent();
            if (parent)
                parent.remove_child(actor);
            container.add_child(actor);
        });
        for (const [key, actor] of cache) {
            if (retained.has(key))
                continue;
            try { actor.destroy(); } catch (e) {}
            cache.delete(key);
        }
    };

    const createHourlyCell = () => {
        const cell = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'material-panel-weather-hour-cell',
            x_align: Clutter.ActorAlign.CENTER,
        });
        try { cell.style = 'padding: 6px 8px; border-radius: 12px; spacing: 2px; min-width: 44px;'; } catch (e) {}
        const time = new St.Label({text: '', x_align: Clutter.ActorAlign.CENTER});
        try { time.style = 'font-size: 10px; opacity: 0.7;'; } catch (e) {}
        const iconActor = new St.Icon({icon_size: 18, x_align: Clutter.ActorAlign.CENTER});
        const temperature = new St.Label({text: '—', x_align: Clutter.ActorAlign.CENTER});
        try { temperature.style = 'font-size: 12px; font-weight: 700;'; } catch (e) {}
        const precipitation = new St.Label({text: '', x_align: Clutter.ActorAlign.CENTER});
        try { precipitation.style = 'font-size: 9px; opacity: 0.65;'; } catch (e) {}
        cell.add_child(time);
        cell.add_child(iconActor);
        cell.add_child(temperature);
        cell.add_child(precipitation);
        cell._mpWeatherActors = {time, iconActor, temperature, precipitation};
        return cell;
    };

    const updateHourlyCell = (cell, hour) => {
        const actors = cell._mpWeatherActors;
        actors.time.text = hour.time || '';
        actors.iconActor.gicon = iconForKey(hour.iconKey);
        actors.temperature.text = hour.temp != null ? `${Math.round(hour.temp)}°` : '—';
        actors.precipitation.text = hour.pop != null && hour.pop > 0 ? `${Math.round(hour.pop)}%` : '';
        actors.precipitation.visible = hour.pop != null && hour.pop > 0;
    };

    const createDailyRow = () => {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'material-panel-weather-day-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        try { row.style = 'spacing: 8px; padding: 6px 8px; border-radius: 12px;'; } catch (e) {}
        const name = new St.Label({text: '', y_align: Clutter.ActorAlign.CENTER});
        try { name.style = 'font-size: 12px; font-weight: 600; width: 52px; min-width: 52px;'; } catch (e) {}
        const iconActor = new St.Icon({icon_size: 18, y_align: Clutter.ActorAlign.CENTER});
        const spacer = new St.Widget({x_expand: true});
        const high = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        try { high.style = 'font-size: 12px; font-weight: 700; width: 36px; text-align: right;'; } catch (e) {}
        const low = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        try { low.style = 'font-size: 12px; opacity: 0.6; width: 36px;'; } catch (e) {}
        const precipitation = new St.Label({text: '', y_align: Clutter.ActorAlign.CENTER});
        try { precipitation.style = 'font-size: 11px; opacity: 0.65; width: 40px;'; } catch (e) {}
        row.add_child(name);
        row.add_child(iconActor);
        row.add_child(spacer);
        row.add_child(high);
        row.add_child(low);
        row.add_child(precipitation);
        row._mpWeatherActors = {name, iconActor, high, low, precipitation};
        return row;
    };

    const updateDailyRow = (row, day) => {
        const actors = row._mpWeatherActors;
        actors.name.text = day.label || day.date || '';
        actors.iconActor.gicon = iconForKey(day.iconKey);
        actors.high.text = day.max != null ? `${Math.round(day.max)}°` : '—';
        actors.low.text = day.min != null ? `${Math.round(day.min)}°` : '—';
        actors.precipitation.text = day.pop != null ? `${Math.round(day.pop)}%` : '';
        actors.precipitation.visible = day.pop != null;
    };

    const fillPopup = () => {
        const d = detail;
        if (!d) {
            tempLbl.text = '—°';
            condLbl.text = 'Loading…';
            return;
        }
        placeLbl.text = d.place || 'Weather';
        tempLbl.text = d.temp != null ? `${Math.round(d.temp)}°` : '—°';
        condLbl.text = d.condition || '';
        feelsLbl.text = d.feelsLike != null
            ? `Feels like ${Math.round(d.feelsLike)}°`
            : '';
        try { heroIcon.gicon = iconForKey(d.iconKey || 'weather'); } catch (e) {}

        humidityStat.value.text = d.humidity != null ? `${Math.round(d.humidity)}%` : '—';
        windStat.value.text = d.wind != null ? `${Math.round(d.wind)} km/h` : '—';
        const todayPop = d.daily?.[0]?.pop;
        rainStat.value.text = todayPop != null ? `${Math.round(todayPop)}%` : '—';
        let ageLabel = '';
        if (lastSuccessAt > 0) {
            const ageMinutes = Math.max(0, Math.floor((GLib.get_monotonic_time() - lastSuccessAt) / 60000000));
            ageLabel = ageMinutes < 1 ? 'Updated just now' : `Updated ${ageMinutes} min ago`;
        }
        sourceLbl.text = [d.source, ageLabel].filter(Boolean).join(' · ');

        // Reconcile forecast rows by stable timestamps/dates. Existing Clutter
        // actors are updated and reordered instead of destroyed on each refresh.
        reconcileWeatherRows(
            hourlyRow, hourlyCells, d.hourly || [],
            (hour, index) => hour.time || String(index),
            createHourlyCell, updateHourlyCell);
        reconcileWeatherRows(
            dailyCol, dailyRows, d.daily || [],
            (day, index) => day.date || day.label || String(index),
            createDailyRow, updateDailyRow);
    };

    const fetchWeather = async () => {
        if (destroyed || fetchInFlight)
            return;
        fetchInFlight = true;
        try {
            // 1) An explicit manual location takes precedence over GNOME Weather.
            const manual = globalThis._materialPanelWeatherLocation ?? {};
            // Old saved configurations with coordinates should keep using them;
            // otherwise default to GNOME Weather. IP geolocation is never used.
            const mode = String(manual.mode ??
                (String(manual.latitude ?? '').trim() || String(manual.longitude ?? '').trim()
                    ? 'manual' : 'gnome'));
            if (mode === 'disabled') {
                throw new Error('Weather location lookup is disabled in Preferences');
            }
            const manualLatText = String(manual.latitude ?? '').trim();
            const manualLonText = String(manual.longitude ?? '').trim();
            if (mode === 'manual' || (manualLatText && manualLonText && manual.mode == null)) {
                const lat = Number(manualLatText);
                const lon = Number(manualLonText);
                if (!manualLatText || !manualLonText ||
                    !Number.isFinite(lat) || !Number.isFinite(lon) ||
                    lat < -90 || lat > 90 || lon < -180 || lon > 180)
                    throw new Error('Manual weather coordinates are invalid; check Preferences');
                const place = String(manual.name ?? '').trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                const cacheKey = JSON.stringify(['manual', lat, lon, place, 'metric']);
                const cached = getWeatherCache(cacheKey, GLib.get_monotonic_time());
                if (cached) {
                    apply(cached.data, cached.savedAt);
                    if (GLib.get_monotonic_time() - cached.savedAt < 15 * 60 * 1000000) {
                        retryDelaySeconds = 60;
                        if (retryId) { try { GLib.source_remove(retryId); } catch (e) {} retryId = 0; }
                        return;
                    }
                }
                const data = await fetchOpenMeteo(lat, lon, place, 'Open-Meteo · manual location', cancellable);
                setWeatherCache(cacheKey, data, GLib.get_monotonic_time());
                apply(data);
                retryDelaySeconds = 60;
                if (retryId) { try { GLib.source_remove(retryId); } catch (e) {} retryId = 0; }
                return;
            }
            // GNOME Weather city → Open-Meteo (full current + hourly + daily).
            if (mode === 'manual')
                throw new Error('Manual weather location needs valid coordinates; set them in Preferences');
            const gw = await loadGnomeWeatherLocation();
            if (gw?.lat != null && gw?.lon != null) {
                const place = gw.name || 'Local';
                const cacheKey = JSON.stringify(['gnome', gw.lat, gw.lon, place, 'metric']);
                const cached = getWeatherCache(cacheKey, GLib.get_monotonic_time());
                if (cached) {
                    apply(cached.data, cached.savedAt);
                    if (GLib.get_monotonic_time() - cached.savedAt < 15 * 60 * 1000000) {
                        retryDelaySeconds = 60;
                        if (retryId) { try { GLib.source_remove(retryId); } catch (e) {} retryId = 0; }
                        return;
                    }
                }
                const data = await fetchOpenMeteo(
                    gw.lat, gw.lon, place, 'Open-Meteo · GNOME Weather', cancellable);
                setWeatherCache(cacheKey, data, GLib.get_monotonic_time());
                apply(data);
                retryDelaySeconds = 60;
                if (retryId) { try { GLib.source_remove(retryId); } catch (e) {} retryId = 0; }
                return;
            }
            // IP geolocation is intentionally not used, regardless of mode.
            // No location was configured or detected. Never show a plausible
            // forecast for an unrelated city as if it were local weather.
            throw new Error('No weather location configured; set a city in GNOME Weather');
        } catch (e) {
            if (destroyed)
                return;
            logError(e, 'material-panel: weather fetch');
            // Preserve the last successful forecast when a refresh fails.
            // Only show the unavailable state when we have no good data yet.
            if (!detail || detail.source === 'Error') {
                label.text = '—°';
                detail = {
                    condition: 'Unavailable',
                    place: 'Location unavailable',
                    source: 'Error',
                };
                try {
                    button.set_tooltip_text('Weather unavailable — configure coordinates in Preferences or set a location in GNOME Weather');
                } catch (e2) {}
            }
            fillPopup();
            // Retry failed startup/offline requests sooner than the 15-minute
            // normal refresh, with a capped exponential backoff.
            if (!destroyed && !retryId) {
                const delay = retryDelaySeconds;
                retryDelaySeconds = Math.min(retryDelaySeconds * 2, 15 * 60);
                retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
                    retryId = 0;
                    if (!destroyed && (button.mapped || menu.isOpen))
                        fetchWeather();
                    return GLib.SOURCE_REMOVE;
                });
            }
        } finally {
            fetchInFlight = false;
        }
    };


    const refreshIfStale = () => {
        if (destroyed || (!button.mapped && !menu.isOpen))
            return;
        const stale = !detail || detail.source === 'Error' || lastSuccessAt === 0 ||
            GLib.get_monotonic_time() - lastSuccessAt >= 15 * 60 * 1000000;
        if (stale)
            fetchWeather();
    };

    // Resume with a fresh forecast when the chip becomes visible or its popup opens.
    button.connect('notify::mapped', refreshIfStale);
    menu.connect('open-state-changed', (_menu, open) => {
        if (open)
            refreshIfStale();
    });

    const networkMonitor = Gio.NetworkMonitor.get_default();
    let networkChangedId = 0;
    try {
        networkChangedId = networkMonitor.connect('network-changed', (_monitor, available) => {
            if (available && !destroyed && (button.mapped || menu.isOpen))
                refreshIfStale();
        });
    } catch (e) {}

    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            // An initial failure should be retryable on the next click;
            // successful data remains visible while a background refresh runs.
            if (!detail || detail.source === 'Error')
                fetchWeather();
            else
                fillPopup();
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        destroyed = true;
        if (networkChangedId) {
            try { networkMonitor.disconnect(networkChangedId); } catch (e) {}
            networkChangedId = 0;
        }
        if (initialFetchId) {
            try { GLib.source_remove(initialFetchId); } catch (e) {}
            initialFetchId = 0;
        }
        if (retryId) {
            try { GLib.source_remove(retryId); } catch (e) {}
            retryId = 0;
        }
        try { cancellable.cancel(); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    try { wireFileIconPress(button, () => [{icon, key: detail?.iconKey || 'weather'}]); } catch (e) {}

    // Defer first fetch — never block/crash enable() on network or GIR
    initialFetchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 400, () => {
        initialFetchId = 0;
        if (destroyed)
            return GLib.SOURCE_REMOVE;
        try { fetchWeather(); } catch (e) {
            if (!destroyed)
                logError(e, 'material-panel: deferred weather fetch');
        }
        return GLib.SOURCE_REMOVE;
    });
    const refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15 * 60, () => {
        // Do not poll Open-Meteo while both the chip and popup are hidden.
        try { refreshIfStale(); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    });
    button.connect('destroy', () => {
        try { cancellable.cancel(); } catch (e) {}
        try { GLib.source_remove(refreshId); } catch (e) {}
    });

    try { setChipA11y(button, 'Weather'); } catch (e) {}
    return button;
}
