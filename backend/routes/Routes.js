// routes/Routes.js
// Main API router — organizes endpoints by domain.
// All routes are mounted under /api/auth in server.js.

const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireRole, checkBlocked } = require('../middleware/roles');

// Controllers
const { registerUser, loginUser, getProfile, getProviders } = require('../controllers/Controller');
const { listUsers, getUserById, toggleBlock, deleteUser, getStats } = require('../controllers/adminController');
const { getMyServices, addService, removeService, getAvailableServices } = require('../controllers/providerController');
const { createBooking, getMyBookings, updateBookingStatus } = require('../controllers/bookingController');

// ── Public routes (no token needed) ──────────────────────────────────────────
router.post('/register', registerUser);
router.post('/login',    loginUser);

// ── Authenticated routes (any logged-in user) ───────────────────────────────
router.get('/profile',   authMiddleware, checkBlocked, getProfile);
router.get('/providers',  authMiddleware, checkBlocked, getProviders);

// ── Provider routes ─────────────────────────────────────────────────────────
router.get('/provider/my-services',              authMiddleware, checkBlocked, requireRole('PROVIDER'), getMyServices);
router.post('/provider/my-services',             authMiddleware, checkBlocked, requireRole('PROVIDER'), addService);
router.delete('/provider/my-services/:serviceId', authMiddleware, checkBlocked, requireRole('PROVIDER'), removeService);
router.get('/provider/available-services',       authMiddleware, checkBlocked, requireRole('PROVIDER'), getAvailableServices);

// ── Booking routes (REQUESTER + PROVIDER + ADMIN) ───────────────────────────
router.post('/bookings',              authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), createBooking);
router.get('/bookings/my',            authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getMyBookings);
router.patch('/bookings/:id/status',  authMiddleware, checkBlocked, requireRole('PROVIDER', 'REQUESTER', 'ADMIN'), updateBookingStatus);

// ── Admin routes ────────────────────────────────────────────────────────────
router.get('/admin/users',              authMiddleware, requireRole('ADMIN'), listUsers);
router.get('/admin/users/:id',          authMiddleware, requireRole('ADMIN'), getUserById);
router.patch('/admin/users/:id/block',  authMiddleware, requireRole('ADMIN'), toggleBlock);
router.delete('/admin/users/:id',       authMiddleware, requireRole('ADMIN'), deleteUser);
router.get('/admin/stats',             authMiddleware, requireRole('ADMIN'), getStats);

module.exports = router;
