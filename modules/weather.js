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

// Prefer GNOME Weather location + libgweather conditions.
// Fallback: Open-Meteo at those coords → IP → default.

const OPEN_METEO =
    'https://api.open-meteo.com/v1/forecast?latitude=%LAT%&longitude=%LON%' +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&forecast_days=6&timezone=auto';
const IP_LOC = 'https://ipapi.co/json/';

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

function gweatherIconKey(info) {
    let isDay = true;
    try { isDay = info.is_daytime(); } catch (e) {}
    let name = '';
    try { name = info.get_icon_name() || ''; } catch (e) {}
    if (/clear|sunny/.test(name))
        return isDay ? 'weather-sunny' : 'weather-clear-night';
    if (/few-clouds|partly/.test(name))
        return 'weather-partly-cloudy';
    if (/overcast|clouds/.test(name))
        return 'weather-cloudy';
    if (/fog|mist/.test(name))
        return 'weather-fog';
    if (/showers|rain|drizzle/.test(name))
        return 'weather-rain';
    if (/snow|sleet/.test(name))
        return 'weather-snow';
    if (/storm|thunder|severe/.test(name))
        return 'weather-thunder';
    return 'weather';
}

function httpGet(url, cancellable = null) {
    return new Promise((resolve, reject) => {
        try {
            const file = Gio.File.new_for_uri(url);
            file.load_contents_async(cancellable, (f, res) => {
                try {
                    if (cancellable?.is_cancelled?.()) {
                        reject(new Gio.IOErrorEnum({code: Gio.IOErrorEnum.CANCELLED}));
                        return;
                    }
                    const [ok, contents] = f.load_contents_finish(res);
                    if (!ok || !contents) {
                        reject(new Error(`load failed ${url}`));
                        return;
                    }
                    resolve(new TextDecoder('utf-8').decode(contents));
                } catch (e) {
                    if (e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * GNOME Weather GSettings coords are radians; Open-Meteo wants degrees.
 */
function normalizeLatLon(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return null;
    // Treat as radians when both magnitudes look like ±π range
    if (Math.abs(lat) <= 3.2 && Math.abs(lon) <= 3.2) {
        lat = lat * (180 / Math.PI);
        lon = lon * (180 / Math.PI);
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return null;
    return {lat, lon};
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
        if (!text) {
            const [ok, stdout, _stderr, status] = GLib.spawn_command_line_sync(
                'gsettings get org.gnome.Weather locations');
            if (!ok || status !== 0)
                return null;
            text = new TextDecoder('utf-8').decode(stdout);
        }
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
        const norm = normalizeLatLon(pair[1], pair[2]);
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
        const norm = normalizeLatLon(lat, lon);
        if (!norm)
            return null;
        log(`material-panel: weather loc "${name}" ${norm.lat.toFixed(2)},${norm.lon.toFixed(2)} (GWeather)`);
        return {location: loc, name, lat: norm.lat, lon: norm.lon};
    } catch (e) {
        logError(e, 'material-panel: loadGnomeWeatherLocation');
        return null;
    }
}

function fetchViaGWeatherInfo(GWeather, gwLoc, placeName) {
    return new Promise((resolve, reject) => {
        try {
            const info = new GWeather.Info({
                application_id: 'material-panel@SakibShahariar',
            });
            info.set_location(gwLoc);
            try {
                if (GWeather.Provider)
                    info.set_enabled_providers(GWeather.Provider.ALL);
            } catch (e) {}

            let settled = false;
            const finish = fn => {
                if (settled) return;
                settled = true;
                fn();
            };

            const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 25, () => {
                finish(() => reject(new Error('GWeather.Info timeout')));
                return GLib.SOURCE_REMOVE;
            });

            const updatedId = info.connect('updated', () => {
                try { GLib.source_remove(timeoutId); } catch (e) {}
                try { info.disconnect(updatedId); } catch (e) {}

                let temp = null;
                try {
                    const ret = info.get_value_temp(GWeather.TemperatureUnit.CENTIGRADE);
                    if (Array.isArray(ret) && ret[0])
                        temp = ret[1];
                    else if (typeof ret === 'number')
                        temp = ret;
                } catch (e) {
                    try {
                        const m = String(info.get_temp()).match(/-?\d+(\.\d+)?/);
                        if (m) temp = parseFloat(m[0]);
                    } catch (e2) {}
                }

                let condition = '';
                try {
                    condition = info.get_conditions() || info.get_sky() || '';
                } catch (e) {}

                let extra = '';
                let humidity = null;
                let wind = null;
                try {
                    const parts = [];
                    try {
                        const h = info.get_humidity();
                        if (h) {
                            parts.push(h);
                            const m = String(h).match(/(\d+)/);
                            if (m) humidity = parseFloat(m[1]);
                        }
                    } catch (e) {}
                    try {
                        // Prefer numeric wind if available
                        if (info.get_value_wind) {
                            const wr = info.get_value_wind(GWeather.SpeedUnit.KPH);
                            if (Array.isArray(wr) && wr[0])
                                wind = wr[1];
                            else if (typeof wr === 'number')
                                wind = wr;
                        }
                    } catch (e) {}
                    try {
                        const w = info.get_wind();
                        if (w) {
                            parts.push(w);
                            if (wind == null) {
                                const m = String(w).match(/([\d.]+)/);
                                if (m) wind = parseFloat(m[1]);
                            }
                        }
                    } catch (e) {}
                    extra = parts.join(' · ');
                } catch (e) {}

                if (temp == null) {
                    finish(() => reject(new Error('GWeather.Info no temperature')));
                    return;
                }

                finish(() => resolve({
                    temp,
                    condition: condition || 'Weather',
                    iconKey: gweatherIconKey(info),
                    extra,
                    humidity,
                    wind,
                    place: placeName || 'GNOME Weather',
                    source: 'GNOME Weather (libgweather)',
                }));
            });

            info.update();
        } catch (e) {
            reject(e);
        }
    });
}

async function fetchOpenMeteo(lat, lon, place, sourceTag) {
    const url = OPEN_METEO.replace('%LAT%', lat).replace('%LON%', lon);
    const text = await httpGet(url);
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
        const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

async function resolveIpLocation() {
    // Privacy: do not send the user's IP to third-party geolocation APIs.
    // Use GNOME Weather locations or the fixed fallback coordinates instead.
    throw new Error('IP geolocation disabled (privacy)');
}


export function buildWeather(_extensionPath, scale = 1.0) {
    const cancellable = new Gio.Cancellable();

    const box = new St.BoxLayout({
        style_class: 'material-panel-weather',
        y_align: Clutter.ActorAlign.CENTER,
        vertical: false,
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

    const setChipIcon = key => {
        try {
            let pth = iconPathPrimary(key);
            if (!Gio.File.new_for_path(pth).query_exists(null))
                pth = iconPath(key);
            if (Gio.File.new_for_path(pth).query_exists(null))
                icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
    };

    const apply = data => {
        detail = data;
        if (data?.temp != null)
            label.text = `${Math.round(data.temp)}°`;
        else
            label.text = '—°';
        if (data?.iconKey)
            setChipIcon(data.iconKey);
        try { fillPopup(); } catch (e) {}
    };

    // ── Popup (Omarchy-inspired) ──
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-weather-popup');
    attachPopupDismiss(menu, button);

    const body = new St.BoxLayout({
        vertical: true,
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
        vertical: false,
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
        vertical: true,
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
        vertical: false,
        style_class: 'material-panel-weather-popup-stats',
        x_expand: true,
    });
    try { stats.style = 'spacing: 8px; padding: 2px 0;'; } catch (e) {}
    const mkStat = (title) => {
        const card = new St.BoxLayout({
            vertical: true,
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
        vertical: false,
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
        vertical: true,
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
        sourceLbl.text = d.source || '';

        // Hourly
        hourlyRow.destroy_all_children();
        for (const h of d.hourly || []) {
            const cell = new St.BoxLayout({
                vertical: true,
                style_class: 'material-panel-weather-hour-cell',
                x_align: Clutter.ActorAlign.CENTER,
            });
            try {
                cell.style =
                    'padding: 6px 8px; border-radius: 12px; spacing: 2px; min-width: 44px;';
            } catch (e) {}
            const t = new St.Label({
                text: h.time || '',
                x_align: Clutter.ActorAlign.CENTER,
            });
            try { t.style = 'font-size: 10px; opacity: 0.7;'; } catch (e) {}
            const ic = new St.Icon({
                icon_size: 18,
                gicon: iconForKey(h.iconKey),
                x_align: Clutter.ActorAlign.CENTER,
            });
            const tv = new St.Label({
                text: h.temp != null ? `${Math.round(h.temp)}°` : '—',
                x_align: Clutter.ActorAlign.CENTER,
            });
            try { tv.style = 'font-size: 12px; font-weight: 700;'; } catch (e) {}
            cell.add_child(t);
            cell.add_child(ic);
            cell.add_child(tv);
            if (h.pop != null && h.pop > 0) {
                const p = new St.Label({
                    text: `${Math.round(h.pop)}%`,
                    x_align: Clutter.ActorAlign.CENTER,
                });
                try { p.style = 'font-size: 9px; opacity: 0.65;'; } catch (e) {}
                cell.add_child(p);
            }
            hourlyRow.add_child(cell);
        }

        // Daily
        dailyCol.destroy_all_children();
        for (const day of d.daily || []) {
            const row = new St.BoxLayout({
                vertical: false,
                style_class: 'material-panel-weather-day-row',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                row.style =
                    'spacing: 8px; padding: 6px 8px; border-radius: 12px;';
            } catch (e) {}
            const name = new St.Label({
                text: day.label || day.date,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                name.style = 'font-size: 12px; font-weight: 600; width: 52px; min-width: 52px;';
            } catch (e) {}
            const ic = new St.Icon({
                icon_size: 18,
                gicon: iconForKey(day.iconKey),
                y_align: Clutter.ActorAlign.CENTER,
            });
            const spacer = new St.Widget({x_expand: true});
            const hi = new St.Label({
                text: day.max != null ? `${Math.round(day.max)}°` : '—',
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                hi.style = 'font-size: 12px; font-weight: 700; width: 36px; text-align: right;';
            } catch (e) {}
            const lo = new St.Label({
                text: day.min != null ? `${Math.round(day.min)}°` : '—',
                y_align: Clutter.ActorAlign.CENTER,
            });
            try {
                lo.style = 'font-size: 12px; opacity: 0.6; width: 36px;';
            } catch (e) {}
            row.add_child(name);
            row.add_child(ic);
            row.add_child(spacer);
            row.add_child(hi);
            row.add_child(lo);
            if (day.pop != null) {
                const p = new St.Label({
                    text: `${Math.round(day.pop)}%`,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                try {
                    p.style = 'font-size: 11px; opacity: 0.65; width: 40px;';
                } catch (e) {}
                row.add_child(p);
            }
            dailyCol.add_child(row);
        }
    };

    const fetchWeather = async () => {
        try {
            // 1) GNOME Weather city → Open-Meteo (full current + hourly + daily)
            const gw = await loadGnomeWeatherLocation();
            if (gw?.lat != null && gw?.lon != null) {
                apply(await fetchOpenMeteo(
                    gw.lat, gw.lon, gw.name || 'Local', 'Open-Meteo · GNOME Weather'));
                return;
            }
            // 2) IP geolocation disabled — privacy (see resolveIpLocation)
            try {
                const ip = await resolveIpLocation();
                apply(await fetchOpenMeteo(ip.lat, ip.lon, ip.place, 'Open-Meteo · IP'));
                return;
            } catch (e) {
                logError(e, 'material-panel: IP weather failed');
            }
            // 3) Default (Dhaka)
            apply(await fetchOpenMeteo(23.81, 90.41, 'Dhaka', 'Open-Meteo · default'));
        } catch (e) {
            logError(e, 'material-panel: weather fetch');
            label.text = '—°';
            detail = {condition: 'Unavailable', place: 'Weather', source: 'Error'};
            fillPopup();
        }
    };


    button.connect('clicked', () => {
        if (menu.isOpen)
            menuClose(menu);
        else {
            if (!detail)
                fetchWeather();
            else
                fillPopup();
            menuOpen(menu);
        }
    });
    button.connect('destroy', () => {
        try { cancellable.cancel(); } catch (e) {}
        try { menu.destroy(); } catch (e) {}
    });

    try { wireFileIconPress(button, () => [{icon, key: detail?.iconKey || 'weather'}]); } catch (e) {}

    // Defer first fetch — never block/crash enable() on network or GIR
    GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 400, () => {
        try { fetchWeather(); } catch (e) {
            logError(e, 'material-panel: deferred weather fetch');
        }
        return GLib.SOURCE_REMOVE;
    });
    const refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15 * 60, () => {
        try { fetchWeather(); } catch (e) {}
        return GLib.SOURCE_CONTINUE;
    });
    button.connect('destroy', () => {
        try { cancellable.cancel(); } catch (e) {}
        try { GLib.source_remove(refreshId); } catch (e) {}
    });

    try { setChipA11y(button, 'Weather'); } catch (e) {}
    return button;
}
