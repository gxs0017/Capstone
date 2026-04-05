// controllers/Controller.js
// Handles register, login, and provider search.
// Uses MySQL via models/User.js and issues real JWTs.

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

// ----------------------------------------------------------------
// Helper — build the user payload returned to the frontend
// ----------------------------------------------------------------
const buildUserPayload = (user, services = []) => ({
    id:        user.user_id,
    firstName: user.first_name,
    lastName:  user.last_name,
    email:     user.email,
    role:      user.role,
    city:      user.city,
    province:  user.province,
    services,
});

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
                id:        newUserId,
                firstName, lastName, email, role,
                services:  savedServices,
                address,
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

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Issue JWT
        const token = jwt.sign(
            { id: user.user_id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        return res.json({
            token,
            user: buildUserPayload(user),
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Server error during login.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/providers  (protected — requires valid JWT)
// Query params: ?service=Snow+Shovelling&city=Toronto&sort=first_name&order=asc
// Defaults: sort=created_at, order=DESC
// ----------------------------------------------------------------
const getProviders = async (req, res) => {
    try {
        const { service, city, sort, order } = req.query;
        const providers = await User.getProviders(
            service || null,
            city || null,
            sort || 'created_at',
            order || 'DESC'
        );
        return res.json(providers);
    } catch (error) {
        console.error('Get providers error:', error);
        return res.status(500).json({ message: 'Error fetching providers.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/all-users  (protected — for admin / testing)
// ----------------------------------------------------------------
const getUsers = async (req, res) => {
    try {
        const [rows] = await require('../config/db').execute(
            `SELECT user_id, first_name, last_name, email, role, city, province, created_at
             FROM users`
        );
        return res.json(rows);
    } catch (error) {
        console.error('Get users error:', error);
        return res.status(500).json({ message: 'Error fetching users.' });
    }
};

module.exports = { registerUser, loginUser, getProviders, getUsers };
