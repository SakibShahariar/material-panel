import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {iconPath, iconPathPrimary} from '../lib/iconTheme.js';
import {wireFileIconPress} from '../lib/pressFx.js';
import {attachPopupDismiss} from '../lib/popupDismiss.js';

// Prefer GNOME Weather location + libgweather conditions.
// Fallback: Open-Meteo at those coords → IP → default.

const OPEN_METEO =
    'https://api.open-meteo.com/v1/forecast?latitude=%LAT%&longitude=%LON%' +
    '&current=temperature_2m,weather_code,is_day&timezone=auto';
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

/** @returns {Promise<{location, name, lat, lon}|null>} */
async function loadGnomeWeatherLocation() {
    const GWeather = await ensureGWeather();
    if (!GWeather)
        return null;
    try {
        const schema = 'org.gnome.Weather';
        const source = Gio.SettingsSchemaSource.get_default();
        if (!source.lookup(schema, true)) {
            log('material-panel: org.gnome.Weather schema not found (install gnome-weather?)');
            return null;
        }
        const settings = new Gio.Settings({schema_id: schema});
        const value = settings.get_value('locations');
        if (!value || value.n_children() < 1) {
            log('material-panel: GNOME Weather has no saved cities — add one in Weather app');
            return null;
        }

        const world = GWeather.Location.get_world();
        if (!world)
            return null;

        const child = value.get_child_value(0);
        const loc = world.deserialize(child);
        if (!loc)
            return null;

        let lat = null, lon = null;
        try {
            if (typeof loc.has_coords === 'function' && loc.has_coords()) {
                const coords = loc.get_coords();
                if (Array.isArray(coords)) {
                    lat = coords[0];
                    lon = coords[1];
                } else if (coords && typeof coords === 'object') {
                    lat = coords[0] ?? coords.lat;
                    lon = coords[1] ?? coords.lon;
                }
            } else {
                const coords = loc.get_coords();
                lat = coords[0];
                lon = coords[1];
            }
        } catch (e) {
            logError(e, 'material-panel: GWeather location coords');
        }

        let name = '';
        try {
            name = (loc.get_city_name && loc.get_city_name()) || loc.get_name() || '';
        } catch (e) {
            try { name = loc.get_name() || ''; } catch (e2) {}
        }

        if (lat == null || lon == null || !Number.isFinite(Number(lat)))
            return null;

        return {location: loc, name, lat: Number(lat), lon: Number(lon)};
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
                try {
                    const parts = [];
                    try { if (info.get_humidity()) parts.push(info.get_humidity()); } catch (e) {}
                    try { if (info.get_wind()) parts.push(info.get_wind()); } catch (e) {}
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
    const parts = [];
    if (cur.relative_humidity_2m != null)
        parts.push(`${Math.round(cur.relative_humidity_2m)}% humidity`);
    if (cur.wind_speed_10m != null)
        parts.push(`${Math.round(cur.wind_speed_10m)} km/h wind`);
    parts.push(isDay ? 'Daytime' : 'Night');
    return {
        temp: cur.temperature_2m,
        condition: `Code ${cur.weather_code}`,
        iconKey: wmoToIcon(cur.weather_code, isDay),
        extra: parts.join(' · '),
        humidity: cur.relative_humidity_2m,
        wind: cur.wind_speed_10m,
        place: place || `${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)}`,
        source: sourceTag || 'Open-Meteo',
    };
}

async function resolveIpLocation() {
    const text = await httpGet(IP_LOC);
    const j = JSON.parse(text);
    const lat = Number(j.latitude ?? j.lat);
    const lon = Number(j.longitude ?? j.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        throw new Error('ipapi: no coords');
    const place = [j.city || j.town, j.region || j.country_name || j.country]
        .filter(Boolean).join(', ');
    return {lat, lon, place};
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
        y_align: Clutter.ActorAlign.CENTER,
        text: '…',
    });
    box.add_child(icon);
    box.add_child(label);

    let lastFetch = 0;
    let inFlight = false;
    let detail = {temp: null, condition: '', extra: '', place: '', source: ''};

    let currentIconKey = 'weather';
    let press = null;
    const setIconKey = key => {
        currentIconKey = key || 'weather';
        if (press?.applyIcons) {
            try { press.applyIcons(); return; } catch (e) {}
        }
        try {
            let pth = iconPathPrimary(currentIconKey);
            if (!Gio.File.new_for_path(pth).query_exists(null))
                pth = iconPath(currentIconKey);
            if (Gio.File.new_for_path(pth).query_exists(null))
                icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(pth));
        } catch (e) {}
    };

    const apply = result => {
        detail = {
            temp: result.temp,
            condition: result.condition || '',
            extra: result.extra || '',
            place: result.place || '',
            source: result.source || '',
        };
        label.text = `${Math.round(result.temp)}°`;
        setIconKey(result.iconKey || 'weather');
        try {
            box.set_tooltip_text(
                [result.condition, result.place, `${Math.round(result.temp)}°C`]
                    .filter(Boolean).join(' · '));
        } catch (e) {}
        try { refreshPopup(); } catch (e) {}
    };

    const fetchWeather = async () => {
        if (inFlight)
            return;
        inFlight = true;
        try {
            const GWeather = await ensureGWeather();
            const gw = await loadGnomeWeatherLocation();

            if (gw && GWeather) {
                try {
                    apply(await fetchViaGWeatherInfo(GWeather, gw.location, gw.name));
                    lastFetch = Date.now();
                    return;
                } catch (e) {
                    logError(e, 'material-panel: GWeather.Info failed');
                    try {
                        apply(await fetchOpenMeteo(
                            gw.lat, gw.lon, gw.name,
                            'Open-Meteo · GNOME Weather location'));
                        lastFetch = Date.now();
                        return;
                    } catch (e2) {
                        logError(e2, 'material-panel: Open-Meteo @ GW location failed');
                    }
                }
            }

            try {
                const ip = await resolveIpLocation();
                apply(await fetchOpenMeteo(ip.lat, ip.lon, ip.place, 'Open-Meteo · IP'));
                lastFetch = Date.now();
                return;
            } catch (e) {
                logError(e, 'material-panel: IP weather failed');
            }

            apply(await fetchOpenMeteo(23.81, 90.41, 'Default', 'Open-Meteo · default'));
            lastFetch = Date.now();
        } catch (e) {
            logError(e, 'material-panel: weather failed');
            if (label.text === '…' || label.text === '—')
                label.text = '—°';
        } finally {
            inFlight = false;
        }
    };

    const tick = () => {
        if (Date.now() - lastFetch > 30 * 60 * 1000)
            fetchWeather();
        return GLib.SOURCE_CONTINUE;
    };

    const popupTemp = new St.Label({text: '—', style_class: 'material-panel-weather-popup-temp'});
    const popupCond = new St.Label({text: '', style_class: 'material-panel-weather-popup-cond'});
    const popupExtra = new St.Label({text: '', style_class: 'material-panel-weather-popup-extra'});
    const popupPlace = new St.Label({text: '', style_class: 'material-panel-weather-popup-place'});
    const popupSource = new St.Label({text: '', style_class: 'material-panel-weather-popup-source'});
    const popupHumidity = new St.Label({text: '—', style_class: 'material-panel-popup-stat-value'});
    const popupWind = new St.Label({text: '—', style_class: 'material-panel-popup-stat-value'});

    const refreshPopup = () => {
        if (detail.temp != null)
            popupTemp.text = `${Math.round(detail.temp)}°C`;
        else
            popupTemp.text = '—';
        popupCond.text = detail.condition || 'Weather';
        popupExtra.text = detail.extra || '';
        popupPlace.text = detail.place || '';
        popupSource.text = detail.source || '';
        if (detail.humidity != null)
            popupHumidity.text = `${Math.round(detail.humidity)}%`;
        else
            popupHumidity.text = '—';
        if (detail.wind != null)
            popupWind.text = `${Math.round(detail.wind)} km/h`;
        else
            popupWind.text = '—';
    };

    const button = new St.Button({
        style_class: 'material-panel-weather-btn material-panel-chip',
        reactive: true,
        track_hover: true,
        child: box,
    });
    press = wireFileIconPress(button, () => [{icon, key: currentIconKey}]);
    const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
    menu.actor.add_style_class_name('material-panel-popup material-panel-weather-popup');
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    attachPopupDismiss(menu, button);

    const section = new PopupMenu.PopupMenuSection();
    const body = new St.BoxLayout({vertical: true, style_class: 'material-panel-weather-popup-body'});

    const hero = new St.BoxLayout({
        vertical: true,
        style_class: 'material-panel-popup-card material-panel-weather-popup-hero',
    });
    hero.add_child(popupTemp);
    hero.add_child(popupCond);
    hero.add_child(popupPlace);
    body.add_child(hero);

    const stats = new St.BoxLayout({
        vertical: false,
        style_class: 'material-panel-popup-card material-panel-popup-stats',
        x_expand: true,
    });
    const mk = (title, val) => {
        const c = new St.BoxLayout({vertical: true, style_class: 'material-panel-popup-stat', x_expand: true});
        c.add_child(new St.Label({text: title, style_class: 'material-panel-popup-stat-label'}));
        c.add_child(val);
        return c;
    };
    stats.add_child(mk('Humidity', popupHumidity));
    stats.add_child(mk('Wind', popupWind));
    body.add_child(stats);

    const foot = new St.BoxLayout({vertical: true, style_class: 'material-panel-popup-card'});
    foot.add_child(popupExtra);
    foot.add_child(popupSource);
    body.add_child(foot);

    section.actor.add_child(body);
    menu.addMenuItem(section);

    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            refreshPopup();
            fetchWeather();
        }
    });
    button.connect('clicked', () => {
        if (menu.isOpen) menu.close();
        else menu.open();
    });

    fetchWeather();
    const id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 120, tick);
    button.connect('destroy', () => {
        try { GLib.source_remove(id); } catch (e) {}
        menu.destroy();
    });

    return button;
}
