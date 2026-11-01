// utils/serviceNames.js
// Providers can add any service as a tag. Names are tidied so "lawn  mowing"
// and "Lawn Mowing" are one tag, and obviously abusive names are refused.

const MAX_LEN = 40;
const ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 &'\/+.,()-]*$/;
// Deliberately short: a safety net, not a full profanity filter.
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'porn', 'escort', 'nigg', 'slut', 'whore', 'cocaine', 'heroin', 'weed dealer'];

/** "  lawn   MOWING " -> "Lawn Mowing" (small joining words stay lower-case). */
const tidyServiceName = (value) =>
    String(value || '').trim().replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/(^|[\s(\/-])([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase())
        .replace(/\b(And|Of|For|The|To|In|On|At)\b(?!$)/g, (w, _w, offset) => (offset === 0 ? w : w.toLowerCase()));

/** Returns { name } for a valid service name, or { error } explaining why not. */
const checkServiceName = (value) => {
    const name = tidyServiceName(value);
    if (name.length < 2) return { error: 'A service name needs at least 2 characters.' };
    if (name.length > MAX_LEN) return { error: `A service name can be at most ${MAX_LEN} characters.` };
    if (!ALLOWED.test(name)) return { error: 'Service names can only use letters, numbers and basic punctuation.' };
    const lowered = name.toLowerCase();
    if (BLOCKED.some((w) => lowered.includes(w))) return { error: 'That service name is not allowed.' };
    return { name };
};

module.exports = { tidyServiceName, checkServiceName, MAX_LEN };
