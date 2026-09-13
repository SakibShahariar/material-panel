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

function httpGet(url) {
    return new Promise((resolve, reject) => {
        try {
            const file = Gio.File.new_for_uri(url);
            file.load_contents_async(null, (f, res) => {
                try {
                    const [ok, contents] = f.load_contents_finish(res);
                    if (!ok || !contents) {
                        reject(new Error(`load failed ${url}`));
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

/**
 * GNOME Weather stores coords in radians in GSettings.
 * libgweather get_coords() is usually degrees — normalize either way.
 */
function normalizeLatLon(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return null;
    // Radians if within ±π (and not already a plausible degree pair for cities)
    if (Math.abs(lat) <= Math.PI + 0.01 && Math.abs(lon) <= Math.PI + 0.01) {
        // Heuristic: values like 0.42, 1.58 are radians (Dhaka); 23.8, 90.4 are degrees
        if (Math.abs(lat) < 3.2 && Math.abs(lon) < 3.2) {
            lat = lat * (180 / Math.PI);
            lon = lon * (180 / Math.PI);
        }
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return null;
    return {lat, lon};
}

/** Parse first city from org.gnome.Weather locations GVariant (no GIR needed). */
function parseGnomeWeatherLocationsVariant(value) {
    // Shape: array of (uv = (s, s, b, a(dd), a(dd))) roughly
    try {
        if (!value || value.n_children() < 1)
            return null;
        const child = value.get_child_value(0);
        // Unwrap nested tuples until we find string name + (dd) coords
        let name = '';
        let lat = null, lon = null;

        const walk = v => {
            if (!v)
                return;
            try {
                const t = v.get_type_string?.() || '';
                if (t === 's') {
                    const s = v.get_string()[0];
                    if (s && s.length > 1 && s.length < 64 && !/^[A-Z]{3,4}$/.test(s) && !name)
                        name = s;
                    return;
                }
                if (t === 'd')
                    return;
                if (t === '(dd)' || t === 'a(dd)') {
                    const n = v.n_children();
                    if (t === '(dd)' && n >= 2) {
                        const a = v.get_child_value(0).get_double();
                        const b = v.get_child_value(1).get_double();
                        if (lat == null) {
                            lat = a;
                            lon = b;
                        }
                    } else if (t === 'a(dd)' && n >= 1) {
                        const pair = v.get_child_value(0);
                        if (pair.n_children() >= 2) {
                            const a = pair.get_child_value(0).get_double();
                            const b = pair.get_child_value(1).get_double();
                            if (lat == null) {
                                lat = a;
                                lon = b;
                            }
                        }
                    }
                    return;
                }
                const n = v.n_children?.() ?? 0;
                for (let i = 0; i < n; i++)
                    walk(v.get_child_value(i));
            } catch (e) {}
        };
        walk(child);
        const coords = normalizeLatLon(lat, lon);
        if (!coords)
            return null;
        return {name: name || 'GNOME Weather', lat: coords.lat, lon: coords.lon, location: null};
    } catch (e) {
        logError(e, 'material-panel: parseGnomeWeatherLocationsVariant');
        return null;
    }
}

/** @returns {Promise<{location, name, lat, lon}|null>} */
async function loadGnomeWeatherLocation() {
    try {
        const schema = 'org.gnome.Weather';
        const source = Gio.SettingsSchemaSource.get_default();
        if (!source.lookup(schema, true)) {
            log('material-panel: org.gnome.Weather schema not found');
            return null;
        }
        const settings = new Gio.Settings({schema_id: schema});
        const value = settings.get_value('locations');
        if (!value || value.n_children() < 1) {
            log('material-panel: GNOME Weather has no saved cities');
            return null;
        }

        // 1) Prefer libgweather deserialize when available
        const GWeather = await ensureGWeather();
        if (GWeather) {
            try {
                const world = GWeather.Location.get_world();
                const child = value.get_child_value(0);
                const loc = world?.deserialize?.(child);
                if (loc) {
                    let lat = null, lon = null;
                    try {
                        const coords = loc.get_coords();
                        if (Array.isArray(coords)) {
                            lat = coords[0];
                            lon = coords[1];
                        } else if (coords) {
                            lat = coords[0] ?? coords.lat;
                            lon = coords[1] ?? coords.lon;
                        }
                    } catch (e) {}
                    let name = '';
                    try {
                        name = loc.get_city_name?.() || loc.get_name?.() || '';
                    } catch (e) {}
                    const norm = normalizeLatLon(lat, lon);
                    if (norm) {
                        log(`material-panel: GNOME Weather loc "${name}" ${norm.lat.toFixed(2)},${norm.lon.toFixed(2)}`);
                        return {location: loc, name, lat: norm.lat, lon: norm.lon};
                    }
                }
            } catch (e) {
                logError(e, 'material-panel: GWeather deserialize');
            }
        }

        // 2) Parse GVariant directly (works even without GWeather GIR)
        const parsed = parseGnomeWeatherLocationsVariant(value);
        if (parsed) {
            log(`material-panel: GNOME Weather (variant) "${parsed.name}" ${parsed.lat.toFixed(2)},${parsed.lon.toFixed(2)}`);
            return parsed;
        }
        return null;
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

    // Hourly: next 12 from now
    const hourly = [];
    try {
        const times = json.hourly?.time || [];
        const temps = json.hourly?.temperature_2m || [];
        const codes = json.hourly?.weather_code || [];
        const pops = json.hourly?.precipitation_probability || [];
        const nowIso = cur.time; // e.g. 2026-09-13T20:30
        let start = 0;
        for (let i = 0; i < times.length; i++) {
            if (times[i] >= nowIso.slice(0, 13)) { // hour precision
                start = i;
                break;
            }
        }
        for (let i = start; i < times.length && hourly.length < 12; i++) {
            const t = String(times[i]);
            const hh = t.includes('T') ? t.split('T')[1].slice(0, 5) : t;
            hourly.push({
                time: hh,
                temp: temps[i],
                code: codes[i],
                pop: pops[i],
                iconKey: wmoToIcon(codes[i], true),
            });
        }
    } catch (e) {}

    // Daily 5–6 days
    const daily = [];
    try {
        const times = json.daily?.time || [];
        const maxs = json.daily?.temperature_2m_max || [];
        const mins = json.daily?.temperature_2m_min || [];
        const codes = json.daily?.weather_code || [];
        const pops = json.daily?.precipitation_probability_max || [];
        const today = (cur.time || '').slice(0, 10);
        for (let i = 0; i < times.length && daily.length < 6; i++) {
            const date = String(times[i]).slice(0, 10);
            let label = date;
            try {
                const dt = GLib.DateTime.new_from_iso8601(`${date}T12:00:00`, null);
                if (dt)
                    label = date === today ? 'Today' : (dt.format('%a') || date);
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
    // ipapi.co often 403/rate-limits; try a few public endpoints
    const tries = [
        {
            url: 'https://ipapi.co/json/',
            parse: j => ({
                lat: Number(j.latitude ?? j.lat),
                lon: Number(j.longitude ?? j.lon),
                place: [j.city || j.town, j.region || j.country_name || j.country].filter(Boolean).join(', '),
            }),
        },
        {
            url: 'https://ipinfo.io/json',
            parse: j => {
                const parts = String(j.loc || '').split(',');
                return {
                    lat: Number(parts[0]),
                    lon: Number(parts[1]),
                    place: [j.city, j.region, j.country].filter(Boolean).join(', '),
                };
            },
        },
        {
            url: 'https://geolocation-db.com/json/',
            parse: j => ({
                lat: Number(j.latitude),
                lon: Number(j.longitude),
                place: [j.city, j.state, j.country_name].filter(Boolean).join(', '),
            }),
        },
    ];
    let lastErr = null;
    for (const t of tries) {
        try {
            const text = await httpGet(t.url);
            const j = JSON.parse(text);
            if (j.error || j.reason === 'RateLimited')
                throw new Error(j.reason || j.message || 'rate limited');
            const r = t.parse(j);
            if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon))
                throw new Error('no coords');
            return r;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('IP location failed');
}


export function buildWeather(_extensionPath, scale = 1.0) {
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
        body.style = 'spacing: 10px; padding: 12px; min-width: 320px; max-width: 380px;';
    } catch (e) {}

    const placeLbl = new St.Label({
        text: 'Weather',
        style_class: 'material-panel-weather-popup-place',
        x_expand: true,
    });
    try { placeLbl.style = 'font-size: 12px; opacity: 0.75;'; } catch (e) {}

    const hero = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-weather-popup-hero',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    try { hero.style = 'spacing: 12px;'; } catch (e) {}

    const heroIcon = new St.Icon({
        icon_size: 42,
        style_class: 'material-panel-weather-popup-hero-icon',
        gicon,
    });
    const heroText = new St.BoxLayout({vertical: true, x_expand: true});
    try { heroText.style = 'spacing: 2px;'; } catch (e) {}
    const tempLbl = new St.Label({
        text: '—°',
        style_class: 'material-panel-weather-popup-temp',
    });
    try { tempLbl.style = 'font-size: 28px; font-weight: 700;'; } catch (e) {}
    const condLbl = new St.Label({
        text: '',
        style_class: 'material-panel-weather-popup-cond',
    });
    try { condLbl.style = 'font-size: 13px; font-weight: 600;'; } catch (e) {}
    const feelsLbl = new St.Label({
        text: '',
        style_class: 'material-panel-weather-popup-feels',
    });
    try { feelsLbl.style = 'font-size: 11px; opacity: 0.75;'; } catch (e) {}
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
    try { stats.style = 'spacing: 8px;'; } catch (e) {}
    const mkStat = (title) => {
        const card = new St.BoxLayout({
            vertical: true,
            style_class: 'material-panel-weather-stat-card',
            x_expand: true,
        });
        try {
            card.style = 'padding: 8px 10px; border-radius: 12px; spacing: 2px;';
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
        if (St.PolicyType)
            hourlyScroll.set_policy(St.PolicyType.AUTOMATIC, St.PolicyType.NEVER);
        hourlyScroll.style = 'max-height: 88px;';
    } catch (e) {}
    const hourlyRow = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-weather-hourly-row',
    });
    try { hourlyRow.style = 'spacing: 6px; padding: 2px 0;'; } catch (e) {}
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
    });
    try { sourceLbl.style = 'font-size: 10px; opacity: 0.5;'; } catch (e) {}

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
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            try { name.style = 'font-size: 12px; font-weight: 600;'; } catch (e) {}
            const ic = new St.Icon({
                icon_size: 18,
                gicon: iconForKey(day.iconKey),
                y_align: Clutter.ActorAlign.CENTER,
            });
            const hi = new St.Label({
                text: day.max != null ? `${Math.round(day.max)}°` : '—',
                y_align: Clutter.ActorAlign.CENTER,
            });
            try { hi.style = 'font-size: 12px; font-weight: 700; min-width: 32px;'; } catch (e) {}
            const lo = new St.Label({
                text: day.min != null ? `${Math.round(day.min)}°` : '—',
                y_align: Clutter.ActorAlign.CENTER,
            });
            try { lo.style = 'font-size: 12px; opacity: 0.65; min-width: 32px;'; } catch (e) {}
            row.add_child(name);
            row.add_child(ic);
            row.add_child(hi);
            row.add_child(lo);
            if (day.pop != null) {
                const p = new St.Label({
                    text: `${Math.round(day.pop)}%`,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                try { p.style = 'font-size: 11px; opacity: 0.7; min-width: 36px;'; } catch (e) {}
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
            // 2) IP geolocation
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

    // Enrich GWeather path: loadGnomeWeatherLocation may not return lat/lon
    // Keep existing loadGnomeWeatherLocation behavior

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
        try { menu.destroy(); } catch (e) {}
    });

    try { wireFileIconPress(button, () => [{icon, key: detail?.iconKey || 'weather'}]); } catch (e) {}

    fetchWeather();
    const refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15 * 60, () => {
        fetchWeather();
        return GLib.SOURCE_CONTINUE;
    });
    button.connect('destroy', () => {
        try { GLib.source_remove(refreshId); } catch (e) {}
    });

    return button;
}
