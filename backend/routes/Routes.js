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
const { getQuote, createBooking,getMyBookings, updateBookingStatus } = require('../controllers/bookingController');
const { submitReview, getReviewsForProvider } = require('../controllers/reviewController');
const { getProviderAvailability, getMyAvailability, addAvailability, removeAvailability } = require('../controllers/availabilityController');

// ── Public routes (no token needed) ──────────────────────────────────────────
router.post('/register', registerUser);
router.post('/login',    loginUser);

// ── Authenticated routes (any logged-in user) ───────────────────────────────
router.get('/profile',   authMiddleware, checkBlocked, getProfile);
router.get('/providers',  authMiddleware, checkBlocked, getProviders);
router.get('/providers/:providerId/availability', authMiddleware, checkBlocked, getProviderAvailability);

// ── Provider routes ─────────────────────────────────────────────────────────
router.get('/provider/my-services',              authMiddleware, checkBlocked, requireRole('PROVIDER'), getMyServices);
router.post('/provider/my-services',             authMiddleware, checkBlocked, requireRole('PROVIDER'), addService);
router.delete('/provider/my-services/:serviceId', authMiddleware, checkBlocked, requireRole('PROVIDER'), removeService);
router.get('/provider/available-services',       authMiddleware, checkBlocked, requireRole('PROVIDER'), getAvailableServices);
router.get('/provider/my-availability',              authMiddleware, checkBlocked, requireRole('PROVIDER'), getMyAvailability);
router.post('/provider/my-availability',             authMiddleware, checkBlocked, requireRole('PROVIDER'), addAvailability);
router.delete('/provider/my-availability/:id',       authMiddleware, checkBlocked, requireRole('PROVIDER'), removeAvailability);

// ── Booking routes (REQUESTER + PROVIDER + ADMIN) ───────────────────────────
router.get('/bookings/quote',         authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getQuote);
router.post('/bookings',            authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), createBooking);
router.get('/bookings/my',            authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getMyBookings);
router.patch('/bookings/:id/status',  authMiddleware, checkBlocked, requireRole('PROVIDER', 'REQUESTER', 'ADMIN'), updateBookingStatus);

// ── Review routes (REQUESTER submits, anyone logged-in can read) ───────────
router.post('/reviews',                    authMiddleware, checkBlocked, requireRole('REQUESTER'), submitReview);
router.get('/reviews/provider/:providerId', authMiddleware, checkBlocked, getReviewsForProvider);

// ── Admin routes ────────────────────────────────────────────────────────────
router.get('/admin/users',              authMiddleware, requireRole('ADMIN'), listUsers);
router.get('/admin/users/:id',          authMiddleware, requireRole('ADMIN'), getUserById);
router.patch('/admin/users/:id/block',  authMiddleware, requireRole('ADMIN'), toggleBlock);
router.delete('/admin/users/:id',       authMiddleware, requireRole('ADMIN'), deleteUser);
router.get('/admin/stats',             authMiddleware, requireRole('ADMIN'), getStats);

module.exports = router;
