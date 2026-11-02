// services/geocode.js
// Address lookup through OpenStreetMap's free Nominatim service.
// Nominatim's usage policy: identify the app (User-Agent), at most ~1 request
// per second, and cache results. This module queues requests one per second
// and caches answers for a day. Swap the two fetch URLs to move to another
// provider (Canada Post, Mapbox, Google) without touching the callers.

const { fsaOf, inCanada, normalizePostal, tidyCity, PROVINCE_CODES } = require('../utils/places');

const BASE = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.GEOCODER_USER_AGENT || 'NeighborBook-capstone/1.0 (student project)';
const MIN_GAP_MS = 1100;
const CACHE_MS = 24 * 60 * 60 * 1000;

const cache = new Map();
let lastCall = 0;
let queue = Promise.resolve();

const throttled = (fn) => {
    const run = queue.then(async () => {
        const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
        if (wait) await new Promise((r) => setTimeout(r, wait));
        lastCall = Date.now();
        return fn();
    });
    queue = run.catch(() => {});
    return run;
};

const request = (params) => {
    const url = `${BASE}/search?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', countrycodes: 'ca', limit: '6', ...params })}`;
    const hit = cache.get(url);
    if (hit && hit.at > Date.now() - CACHE_MS) return Promise.resolve(hit.value);
    return throttled(async () => {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
        const value = await res.json();
        cache.set(url, { at: Date.now(), value });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return value;
    });
};

// One Nominatim hit -> the address fields NeighborBook stores.
const toPlace = (hit) => {
    const a = hit.address || {};
    const province = String(a['ISO3166-2-lvl4'] || '').replace('CA-', '').toUpperCase();
    const city = a.city || a.town || a.village || a.municipality || a.hamlet || '';
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!PROVINCE_CODES.includes(province) || !city || !inCanada(lat, lng)) return null;
    return {
        label: hit.display_name,
        street,
        city: tidyCity(city),
        province,
        postalCode: a.postcode ? normalizePostal(a.postcode) : '',
        suburb: a.suburb || a.neighbourhood || a.quarter || null,
        lat,
        lng,
    };
};

/** Autocomplete for the address box: only results with a street, city and province. */
const searchAddresses = async (query) => {
    const hits = await request({ q: query });
    // The map data often has several entries at one address; show each address once
    const seen = new Set();
    return hits.map(toPlace).filter((p) => {
        if (!p || !p.street) return false;
        const key = `${p.street}|${p.city}|${p.postalCode}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/** Best-effort coordinates for a stored address (falls back to the postal code, then the city). */
const geocodeAddress = async ({ street, city, province, postalCode }) => {
    const attempts = [
        { street, city, state: province, postalcode: postalCode },
        { postalcode: postalCode, state: province },
        { city, state: province },
    ];
    for (const params of attempts) {
        const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
        if (Object.keys(clean).length === 0) continue;
        try {
            const place = (await request(clean)).map(toPlace).find(Boolean);
            if (place) return { lat: place.lat, lng: place.lng, suburb: place.suburb, precise: attempts.indexOf(params) === 0 };
        } catch (err) {
            console.error('geocode failed:', err.message);
            return null;
        }
    }
    return null;
};

module.exports = { searchAddresses, geocodeAddress, fsaOf };
