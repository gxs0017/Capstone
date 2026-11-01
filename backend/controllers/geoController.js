// controllers/geoController.js
// Address lookup for the registration / profile address box.

const { searchAddresses } = require('../services/geocode');

// ----------------------------------------------------------------
// GET /geo/search?q=123 main st brampton   (public — registration happens before login)
// Returns up to 6 real Canadian addresses with city, province, postal code
// and coordinates already filled in consistently.
// ----------------------------------------------------------------
const searchAddress = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 4) return res.json([]);
        if (q.length > 120) return res.status(400).json({ message: 'Search is too long.' });
        return res.json(await searchAddresses(q));
    } catch (err) {
        console.error('searchAddress error:', err.message);
        return res.status(502).json({ message: 'Address lookup is unavailable right now. You can enter the address manually.' });
    }
};

module.exports = { searchAddress };
