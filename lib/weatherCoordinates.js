/** Convert GNOME Weather's radian coordinates to validated decimal degrees. */
export function radiansToDegreesLatLon(lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return null;
    lat *= 180 / Math.PI;
    lon *= 180 / Math.PI;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return null;
    return {lat, lon};
}
