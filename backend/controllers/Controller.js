// controllers/Controller.js
// Handles register, login, provider search, and user profile.
// Uses DTOs and mappers to control what data is exposed.

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { toProviderDTO, toRoleBasedProfile } = require('../mappers/userMapper');

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

        // Insert user
        const newUserId = await User.createUser({
            firstName, lastName,
            phoneNumber,
            dateOfBirth,
            email,
            hashedPassword,
            street:     address.street,
            city:       address.city,
            province:   address.province,
            postalCode: address.postalCode,
            role,
        });

        // If provider, link their services
        const savedServices = [];
        if (role === 'PROVIDER' && Array.isArray(services) && services.length > 0) {
            for (const name of services) {
                const svc = await User.findServiceByName(name);
                if (svc) {
                    await User.addProviderService(newUserId, svc.service_id);
                    savedServices.push(name);
                }
            }
        }

        // Issue JWT
        const token = jwt.sign(
            { id: newUserId, email, role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.status(201).json({
            message: 'User registered successfully!',
            token,
            user: {
                id: newUserId,
                firstName, lastName, email, role,
                city: address.city,
                province: address.province,
                services: savedServices,
            },
        });

    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ message: 'Server error during registration.', error: error.message });
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
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Blocked check
        if (user.is_blocked) {
            return res.status(403).json({ message: 'Your account is restricted. Please contact support for assistance.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
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
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

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
            sort    || 'created_at',
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

module.exports = { registerUser, loginUser, getProfile, getProviders };
