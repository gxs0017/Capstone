// routes/Routes.js
// Main API router — organizes endpoints by domain.
// All routes are mounted under /api/auth in server.js.

const express        = require('express');
const router         = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireRole, checkBlocked } = require('../middleware/roles');
const { authLimiter, messageLimiter } = require('../middleware/rateLimit');
const { validateRegister, validateLogin, validateCreateBooking, validateCreatePaymentIntent, validateBookingStatus, validateAddService, validateBlockUser, validateSetPrice,
        validateStartConversation, validateSendMessage, validatePinBooking, validateReviewMessage } = require('../middleware/validators');

// Controllers
const { registerUser, loginUser, getProfile, getProviders } = require('../controllers/Controller');
const { listUsers, getUserById, updateUser, toggleBlock, deleteUser, getStats, listBookings, getAuditLogs,
        listFlaggedMessages, reviewFlaggedMessage } = require('../controllers/adminController');
const { getMyServices, addService, removeService, getAvailableServices, updatePrice } = require('../controllers/providerController');
const { getQuote, createBooking, getMyBookings, updateBookingStatus, getBookingById } = require('../controllers/bookingController');
const { createPaymentIntent, confirmPayment } = require('../controllers/paymentController');
const { createOrder: paypalCreateOrder, capture: paypalCapture, config: paypalConfig } = require('../controllers/paypalController');
const { submitReview, getReviewsForProvider } = require('../controllers/reviewController');
const { getProviderAvailability, getMyAvailability, addAvailability, removeAvailability } = require('../controllers/availabilityController');
const { getConversations, getUnreadCount, startConversation, getBookingOptions, pinBooking,
        getMessages, markRead, sendMessage } = require('../controllers/chatController');

// ── Public routes (no token needed) ──────────────────────────────────────────
router.post('/register', authLimiter, validateRegister, registerUser);
router.post('/login',    authLimiter, validateLogin, loginUser);


// ── Authenticated routes (any logged-in user) ───────────────────────────────
router.get('/profile',   authMiddleware, checkBlocked, getProfile);
router.get('/providers',  getProviders);
router.get('/providers/:providerId/availability', authMiddleware, checkBlocked, getProviderAvailability);

// ── Provider routes ─────────────────────────────────────────────────────────
router.get('/provider/my-services',              authMiddleware, checkBlocked, requireRole('PROVIDER'), getMyServices);
router.post('/provider/my-services',             authMiddleware, checkBlocked, requireRole('PROVIDER'), validateAddService, addService);
router.patch('/provider/my-services/:serviceId/price', authMiddleware, checkBlocked, requireRole('PROVIDER'), validateSetPrice, updatePrice);
router.delete('/provider/my-services/:serviceId', authMiddleware, checkBlocked, requireRole('PROVIDER'), removeService);
router.get('/provider/available-services',       authMiddleware, checkBlocked, requireRole('PROVIDER'), getAvailableServices);
router.get('/provider/my-availability',              authMiddleware, checkBlocked, requireRole('PROVIDER'), getMyAvailability);
router.post('/provider/my-availability',             authMiddleware, checkBlocked, requireRole('PROVIDER'), addAvailability);
router.delete('/provider/my-availability/:id',       authMiddleware, checkBlocked, requireRole('PROVIDER'), removeAvailability);

// ── Booking routes (REQUESTER + PROVIDER + ADMIN) ───────────────────────────
router.get('/bookings/quote',         authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getQuote);
router.post('/bookings',              authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreateBooking, createBooking);
router.get('/bookings/my',            authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getMyBookings);
router.get('/bookings/:id',           authMiddleware, checkBlocked, getBookingById);
router.patch('/bookings/:id/status',  authMiddleware, checkBlocked, requireRole('PROVIDER', 'REQUESTER', 'ADMIN'), validateBookingStatus, updateBookingStatus);
router.post( '/payments/create-intent', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreatePaymentIntent, createPaymentIntent);
router.post('/payments/confirm', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), confirmPayment);

// -- PayPal payment routes  --
router.get('/payments/paypal/config', authMiddleware, paypalConfig);
router.post('/payments/paypal/create-order', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), paypalCreateOrder);
router.post('/payments/paypal/capture', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), paypalCapture);

// ── Chat routes (any logged-in user can message any other) ─────────────────
router.get('/chat/conversations',                             authMiddleware, checkBlocked, getConversations);
router.get('/chat/unread-count',                               authMiddleware, checkBlocked, getUnreadCount);
router.post('/chat/conversations',                             authMiddleware, checkBlocked, validateStartConversation, startConversation);
router.get('/chat/conversations/:conversationId/booking-options', authMiddleware, checkBlocked, getBookingOptions);
router.patch('/chat/conversations/:conversationId/pin',        authMiddleware, checkBlocked, validatePinBooking, pinBooking);
router.get('/chat/conversations/:conversationId/messages',     authMiddleware, checkBlocked, getMessages);
router.patch('/chat/conversations/:conversationId/read',       authMiddleware, checkBlocked, markRead);
router.post('/chat/conversations/:conversationId/messages',    authMiddleware, checkBlocked, messageLimiter, validateSendMessage, sendMessage);

// ── Review routes (REQUESTER submits, anyone logged-in can read) ───────────
router.post('/reviews',                    authMiddleware, checkBlocked, requireRole('REQUESTER'), submitReview);
router.get('/reviews/provider/:providerId', authMiddleware, checkBlocked, getReviewsForProvider);

// ── Admin routes ────────────────────────────────────────────────────────────
router.get('/admin/users',              authMiddleware, checkBlocked, requireRole('ADMIN'), listUsers);
router.get('/admin/users/:id',          authMiddleware, checkBlocked, requireRole('ADMIN'), getUserById);
router.patch('/admin/users/:id',        authMiddleware, checkBlocked, requireRole('ADMIN'), updateUser);
router.get('/admin/bookings',           authMiddleware, checkBlocked, requireRole('ADMIN'), listBookings);
router.patch('/admin/users/:id/block',  authMiddleware, checkBlocked, requireRole('ADMIN'), validateBlockUser, toggleBlock);
router.delete('/admin/users/:id',       authMiddleware, checkBlocked, requireRole('ADMIN'), deleteUser);
router.get('/admin/stats',              authMiddleware, checkBlocked, requireRole('ADMIN'), getStats);
router.get('/admin/audit-logs',         authMiddleware, checkBlocked, requireRole('ADMIN'), getAuditLogs);
router.get('/admin/chat/flagged',           authMiddleware, checkBlocked, requireRole('ADMIN'), listFlaggedMessages);
router.patch('/admin/chat/flagged/:messageId', authMiddleware, checkBlocked, requireRole('ADMIN'), validateReviewMessage, reviewFlaggedMessage);

module.exports = router;
