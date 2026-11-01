// controllers/Controller.js
// Handles register, login, provider search, and user profile.
// Uses DTOs and mappers to control what data is exposed.

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { toProviderDTO, toRoleBasedProfile } = require('../mappers/userMapper');
const { logAction } = require('../models/AuditLog');
const { normalizePostal, tidyCity, inCanada } = require('../utils/places');
const { checkServiceName } = require('../utils/serviceNames');
const { refreshUserInBackground } = require('../utils/neighbourhoods');

// ----------------------------------------------------------------
// POST /api/auth/register
// ----------------------------------------------------------------
const registerUser = async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, dateOfBirth,
                email, password, address, role, services } = req.body;

        // Basic field validation
        if (!firstName || !lastName || !email || !password || !address || !role) {
            return res.status(400).json({ message: 'All required fields must be provided.' });
        }

        // Only allow PROVIDER and REQUESTER self-registration (ADMIN created by other admins)
        if (!['PROVIDER', 'REQUESTER'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role. Must be PROVIDER or REQUESTER.' });
        }

        // Check for duplicate email
        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(400).json({ message: 'An account with this email already exists.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Tidy the address (the validator already checked city/province/postal agree)
        const city       = tidyCity(address.city);
        const province   = String(address.province).toUpperCase();
        const postalCode = normalizePostal(address.postalCode);
        const lat = Number(address.lat);
        const lng = Number(address.lng);
        const hasCoords = address.lat != null && address.lng != null && inCanada(lat, lng);

        // Insert user
        const newUserId = await User.createUser({
            firstName, lastName,
            phoneNumber,
            dateOfBirth,
            email,
            hashedPassword,
            street:     String(address.street).trim(),
            city,
            province,
            postalCode,
            role,
            lat: hasCoords ? lat : null,
            lng: hasCoords ? lng : null,
        });

        // If provider, link their services (any name is allowed; new names become new services)
        const savedServices = [];
        if (role === 'PROVIDER' && Array.isArray(services) && services.length > 0) {
            for (const raw of services) {
                const { name } = checkServiceName(raw);
                if (!name || savedServices.includes(name)) continue;
                const serviceId = await User.findOrCreateService(name);
                await User.addProviderService(newUserId, serviceId);
                savedServices.push(name);
            }
        }

        // Work out their neighbourhood from the address (no form field needed)
        refreshUserInBackground(newUserId);

        // Issue JWT
        const token = jwt.sign(
            { id: newUserId, email, role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        logAction(newUserId, 'REGISTER', 'role: ' + role, req.ip);

        return res.status(201).json({
            message: 'User registered successfully!',
            token,
            user: {
                id: newUserId,
                firstName, lastName, email, role,
                city,
                province,
                services: savedServices,
            },
        });

    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ message: 'Server error during registration.' });
    }
};

// ----------------------------------------------------------------
// POST /api/auth/login
// ----------------------------------------------------------------
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        if (user.deleted_at) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Blocked check
        if (user.is_blocked) {
            return res.status(403).json({ message: 'Your account is restricted. Please contact support for assistance.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Fetch services if provider
        let services = [];
        if (user.role === 'PROVIDER') {
            services = await User.getServicesByUserId(user.user_id);
        }

        // Issue JWT
        const token = jwt.sign(
            { id: user.user_id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        logAction(user.user_id, 'LOGIN', null, req.ip);

        // Keep their neighbourhood current (picks up newly added neighbourhoods) without slowing login
        refreshUserInBackground(user.user_id);

        return res.json({
            token,
            user: toRoleBasedProfile(user, services),
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Server error during login.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/profile  (protected — current user's own profile)
// ----------------------------------------------------------------
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        let services = [];
        if (user.role === 'PROVIDER') {
            services = await User.getServicesByUserId(user.user_id);
        }

        return res.json(toRoleBasedProfile(user, services));
    } catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ message: 'Error fetching profile.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/providers  (protected — search providers)
// ----------------------------------------------------------------
const getProviders = async (req, res) => {
    try {
        const { service, city, sort, order, page, limit } = req.query;
        const result = await User.getProviders(
            service || null,
            city    || null,
            sort    || 'avgRating',
            order   || 'DESC',
            page    || 1,
            limit   || 6
        );
        return res.json(result);
    } catch (error) {
        console.error('Get providers error:', error);
        return res.status(500).json({ message: 'Error fetching providers.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/providers/:id/profile — public storefront page
// (no auth required — same visibility as the public provider search)
// ----------------------------------------------------------------
const getProviderProfile = async (req, res) => {
    try {
        const profile = await User.getProviderProfile(req.params.id);
        if (!profile) {
            return res.status(404).json({ message: 'Provider not found.' });
        }
        return res.json(profile);
    } catch (error) {
        console.error('Get provider profile error:', error);
        return res.status(500).json({ message: 'Error fetching provider profile.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/services  (public) — every service type with its id
// ----------------------------------------------------------------
const listServices = async (_req, res) => {
    try {
        return res.json(await User.listServices());
    } catch (error) {
        console.error('List services error:', error);
        return res.status(500).json({ message: 'Error fetching services.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/auth/profile/directory  (protected)
// Body: { bio?: string | null }
// Providers edit the short bio shown on their directory card and storefront.
// ----------------------------------------------------------------
const updateDirectoryProfile = async (req, res) => {
    try {
        if (req.user.role !== 'PROVIDER') {
            return res.status(403).json({ message: 'Only service providers have a public listing.' });
        }
        const changed = await User.updateDirectoryProfile(req.user.id, { bio: req.body.bio });
        if (!changed) {
            return res.status(400).json({ message: 'Nothing to update.' });
        }

        const user = await User.findById(req.user.id);
        const services = user.role === 'PROVIDER' ? await User.getServicesByUserId(user.user_id) : [];
        return res.json(toRoleBasedProfile(user, services));
    } catch (error) {
        console.error('Update directory profile error:', error);
        return res.status(500).json({ message: 'Error updating your directory profile.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/auth/profile/contact  (PROVIDER)
// Body: { showEmail?: boolean, showPhone?: boolean }
// Whether other people can see this provider's email / phone number.
// ----------------------------------------------------------------
const updateContactPrefs = async (req, res) => {
    try {
        const changed = await User.updateContactPrefs(req.user.id, {
            showEmail: req.body.showEmail,
            showPhone: req.body.showPhone,
        });
        if (!changed) {
            return res.status(400).json({ message: 'Nothing to update.' });
        }
        const user = await User.findById(req.user.id);
        const services = await User.getServicesByUserId(user.user_id);
        return res.json(toRoleBasedProfile(user, services));
    } catch (error) {
        console.error('Update contact prefs error:', error);
        return res.status(500).json({ message: 'Error updating your contact settings.' });
    }
};

module.exports = { registerUser, loginUser, getProfile, getProviders, getProviderProfile, updateDirectoryProfile, listServices, updateContactPrefs };
