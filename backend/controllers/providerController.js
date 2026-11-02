// controllers/providerController.js
// Provider-specific operations: manage their own services.

const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { checkServiceName } = require('../utils/serviceNames');
const { logAction } = require('../models/AuditLog');
const { notify } = require('../utils/notify');
const { emitToPublic } = require('../config/socket');
const { toRoleBasedProfile } = require('../mappers/userMapper');

/** Tell everyone watching the directory / services pages that a provider's listing changed. */
const announceListing = (providerId, change) => emitToPublic('directory:changed', { providerId, change });

const MAX_SERVICES = 20;

// ----------------------------------------------------------------
// GET /api/provider/my-services — list services the current provider offers
// ----------------------------------------------------------------
const getMyServices = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT s.service_id, s.service_name, pd.price
             FROM provider_details pd
             JOIN services s ON pd.service_id = s.service_id
             WHERE pd.user_id = ?
             ORDER BY s.service_name`,
            [req.user.id]
        );
        return res.json(rows);
    } catch (err) {
        console.error('getMyServices error:', err);
        return res.status(500).json({ message: 'Error fetching your services.' });
    }
};

// ----------------------------------------------------------------
// POST /api/provider/my-services — add a service to current provider
// Body: { serviceName: "Lawn Mowing" }
// ----------------------------------------------------------------
const addService = async (req, res) => {
    try {
        const { price } = req.body;
        const { name: serviceName, error } = checkServiceName(req.body.serviceName);
        if (error) {
            return res.status(400).json({ message: error });
        }

        // Providers can add any service name; a new name creates a new service tag
        const [[{ count }]] = await pool.execute(
            'SELECT COUNT(*) AS count FROM provider_details WHERE user_id = ?', [req.user.id]
        );
        if (count >= MAX_SERVICES) {
            return res.status(400).json({ message: `You can offer at most ${MAX_SERVICES} services.` });
        }
        const svc = { service_id: await User.findOrCreateService(serviceName) };

        // Check if already linked
        const [existing] = await pool.execute(
            'SELECT provider_detail_id FROM provider_details WHERE user_id = ? AND service_id = ?',
            [req.user.id, svc.service_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'You already offer this service.' });
        }

        await User.addProviderService(req.user.id, svc.service_id, price ?? null);

        logAction(req.user.id, 'SERVICE_ADDED', `service: "${serviceName}"${price != null ? ', price: $' + Number(price).toFixed(2) : ''}`, req.ip);
        notify(req.user.id, {
            type: 'SERVICE_LIVE', title: 'Your service is live',
            body: `"${serviceName}" is now listed in the directory — neighbors can find and book you.`, link: `/providers/${req.user.id}`,
        });
        announceListing(req.user.id, 'service-added');

        return res.status(201).json({
            message: `Service "${serviceName}" added successfully.`,
            service: { serviceId: svc.service_id, serviceName, price: price ?? null },
        });
    } catch (err) {
        console.error('addService error:', err);
        return res.status(500).json({ message: 'Error adding service.' });
    }
};

// ----------------------------------------------------------------
// DELETE /api/provider/my-services/:serviceId — remove a service
// ----------------------------------------------------------------
const removeService = async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM provider_details WHERE user_id = ? AND service_id = ?',
            [req.user.id, req.params.serviceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Service not found in your offerings.' });
        }

        logAction(req.user.id, 'SERVICE_REMOVED', `service id: ${req.params.serviceId}`, req.ip);
        announceListing(req.user.id, 'service-removed');
        return res.json({ message: 'Service removed successfully.' });
    } catch (err) {
        console.error('removeService error:', err);
        return res.status(500).json({ message: 'Error removing service.' });
    }
};

// ----------------------------------------------------------------
// GET /api/provider/available-services — list all services in the system
// (so providers can pick from the master list)
// ----------------------------------------------------------------
const getAvailableServices = async (_req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT service_id, service_name FROM services ORDER BY service_name'
        );
        return res.json(rows);
    } catch (err) {
        console.error('getAvailableServices error:', err);
        return res.status(500).json({ message: 'Error fetching available services.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/provider/my-services/:serviceId/price - set a service's price
// ----------------------------------------------------------------
const updatePrice = async (req, res) => {
    try {
        const { price } = req.body;
        const affected = await User.updateProviderServicePrice(req.user.id, req.params.serviceId, price);
        if (affected === 0) {
            return res.status(404).json({ message: 'Service not found in your offerings.' });
        }
        logAction(req.user.id, 'SERVICE_PRICE_CHANGED', `service id: ${req.params.serviceId}, new price: $${Number(price).toFixed(2)}`, req.ip);
        announceListing(req.user.id, 'price');
        return res.json({ message: 'Price updated.' });
    } catch (err) {
        console.error('updatePrice error:', err);
        return res.status(500).json({ message: 'Error updating price.' });
    }
};

// ----------------------------------------------------------------
// POST /api/profile/become-provider — a requester starts offering services
// Body: { services: ["Dog Walking", ...] }  (at least one)
// They keep everything they could do before (book, message, post) and gain the
// provider tools. A fresh token carries the new role.
// ----------------------------------------------------------------
const becomeProvider = async (req, res) => {
    try {
        const raw = Array.isArray(req.body.services) ? req.body.services : [];
        const names = [];
        for (const item of raw.slice(0, MAX_SERVICES)) {
            const { name, error } = checkServiceName(item);
            if (error) return res.status(400).json({ message: error });
            if (!names.includes(name)) names.push(name);
        }
        if (names.length === 0) {
            return res.status(400).json({ message: 'Add at least one service you would like to offer.' });
        }

        const [result] = await pool.execute(
            "UPDATE users SET role = 'PROVIDER' WHERE user_id = ? AND role = 'REQUESTER' AND deleted_at IS NULL", [req.user.id]);
        if (result.affectedRows === 0) {
            return res.status(400).json({ message: 'Only a regular account can become a provider.' });
        }
        for (const name of names) {
            await User.addProviderService(req.user.id, await User.findOrCreateService(name));
        }

        logAction(req.user.id, 'ROLE_CHANGED_TO_PROVIDER', `services: ${names.join(', ')}`, req.ip);
        notify(req.user.id, {
            type: 'SERVICE_LIVE', title: 'You are now a provider',
            body: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} now listed in the directory. Add a short bio so neighbors get to know you.`, link: '/profile',
        });
        announceListing(req.user.id, 'new-provider');

        const user = await User.findById(req.user.id);
        const token = jwt.sign(
            { id: user.user_id, email: user.email, role: 'PROVIDER' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );
        return res.json({
            message: 'You are now a provider.',
            token,
            user: toRoleBasedProfile(user, await User.getServicesByUserId(user.user_id)),
        });
    } catch (err) {
        console.error('becomeProvider error:', err);
        return res.status(500).json({ message: 'Error upgrading your account.' });
    }
};

module.exports = { becomeProvider, getMyServices, addService, removeService, getAvailableServices, updatePrice };
