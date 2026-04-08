// controllers/providerController.js
// Provider-specific operations: manage their own services.

const pool = require('../config/db');
const User = require('../models/User');

// ----------------------------------------------------------------
// GET /api/provider/my-services — list services the current provider offers
// ----------------------------------------------------------------
const getMyServices = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT s.service_id, s.service_name
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
        const { serviceName } = req.body;
        if (!serviceName) {
            return res.status(400).json({ message: 'serviceName is required.' });
        }

        const svc = await User.findServiceByName(serviceName);
        if (!svc) {
            return res.status(404).json({ message: `Service "${serviceName}" does not exist.` });
        }

        // Check if already linked
        const [existing] = await pool.execute(
            'SELECT provider_detail_id FROM provider_details WHERE user_id = ? AND service_id = ?',
            [req.user.id, svc.service_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'You already offer this service.' });
        }

        await User.addProviderService(req.user.id, svc.service_id);

        return res.status(201).json({
            message: `Service "${serviceName}" added successfully.`,
            service: { serviceId: svc.service_id, serviceName },
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

module.exports = { getMyServices, addService, removeService, getAvailableServices };
