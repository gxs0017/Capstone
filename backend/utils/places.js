// utils/places.js
// Canadian address helpers shared by registration, the address lookup and the
// neighbourhood assignment. The key rule: a postal code's first letter fixes
// the province, so a city/province/postal combination that disagrees is bad data.

const PROVINCE_CODES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

// First letter of a Canadian postal code -> the province(s) it belongs to.
const POSTAL_LETTER_PROVINCES = {
    A: ['NL'], B: ['NS'], C: ['PE'], E: ['NB'],
    G: ['QC'], H: ['QC'], J: ['QC'],
    K: ['ON'], L: ['ON'], M: ['ON'], N: ['ON'], P: ['ON'],
    R: ['MB'], S: ['SK'], T: ['AB'], V: ['BC'],
    X: ['NT', 'NU'], Y: ['YT'],
};

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

// "l6t1b4" / "L6T-1B4" -> "L6T 1B4"
const normalizePostal = (value) => {
    const compact = String(value || '').replace(/[\s-]+/g, '').toUpperCase();
    return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
};

const fsaOf = (postal) => String(postal || '').replace(/[\s-]+/g, '').toUpperCase().slice(0, 3);

const tidyCity = (value) =>
    String(value || '').trim().replace(/\s+/g, ' ')
        .replace(/\b([a-z])([a-z']*)/gi, (_, a, b) => a.toUpperCase() + b.toLowerCase());

/** Returns an error message when the address is internally inconsistent, else null. */
const addressProblem = ({ city, province, postalCode }) => {
    if (!PROVINCE_CODES.includes(String(province || '').toUpperCase())) return 'Choose a valid province.';
    if (!POSTAL_RE.test(String(postalCode || ''))) return 'Enter a valid Canadian postal code (e.g. A1B 2C3).';
    const allowed = POSTAL_LETTER_PROVINCES[String(postalCode).trim().charAt(0).toUpperCase()] || [];
    if (!allowed.includes(String(province).toUpperCase())) {
        return `Postal code ${normalizePostal(postalCode)} is not in ${String(province).toUpperCase()}. Check the city, province and postal code match.`;
    }
    if (!/[A-Za-z]{2,}/.test(String(city || ''))) return 'Enter a valid city.';
    return null;
};

// Rough bounding box of Canada — rejects coordinates that are clearly wrong.
const inCanada = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= 41.6 && lat <= 84 && lng >= -141.1 && lng <= -52;

const haversineKm = (lat1, lng1, lat2, lng2) => {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
};

module.exports = { PROVINCE_CODES, POSTAL_LETTER_PROVINCES, POSTAL_RE, normalizePostal, fsaOf, tidyCity, addressProblem, inCanada, haversineKm };
