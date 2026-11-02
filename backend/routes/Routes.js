// routes/Routes.js
// Main API router — organizes endpoints by domain.
// All routes are mounted under /api/auth in server.js.

const express        = require('express');
const router         = express.Router();
const { auditTrail } = require('../middleware/audit');
router.use(auditTrail); // every change anyone makes is recorded for the admins' Logs tab
const authMiddleware = require('../middleware/auth');
const { requireRole, checkBlocked } = require('../middleware/roles');
const { authLimiter, messageLimiter, commentLimiter, postLimiter, geoLimiter } = require('../middleware/rateLimit');
const { validateRegister, validateLogin, validateCreateBooking, validateCreatePaymentIntent, validateBookingStatus, validateAddService, validateBlockUser, validateSetPrice,
        validateStartConversation, validateSendMessage, validatePinBooking, validateReviewMessage,
        validateCreatePost, validateCreateComment, validateDirectoryProfile, validateContactPrefs } = require('../middleware/validators');

// Controllers
const { registerUser, loginUser, getProfile, getProviders, getProviderProfile, updateDirectoryProfile, listServices, updateContactPrefs } = require('../controllers/Controller');
const { listUsers, getUserById, updateUser, toggleBlock, deleteUser, getStats, listBookings, getAuditLogs,
        listFlaggedMessages, reviewFlaggedMessage } = require('../controllers/adminController');
const { getMyServices, addService, removeService, getAvailableServices, updatePrice, becomeProvider } = require('../controllers/providerController');
const { getQuote, createBooking, getMyBookings, updateBookingStatus, getBookingById, reportIssue, reportProblem, resolveIssue } = require('../controllers/bookingController');
const { getMethods, getSummary, createPaymentIntent, confirmPayment, getMyPayments, getAdminOverview, settleNow, withdraw, markPayoutPaid, demoPay } = require('../controllers/paymentController');
const { createOrder: paypalCreateOrder, capture: paypalCapture, config: paypalConfig } = require('../controllers/paypalController');
const { submitReview, getReviewsForProvider } = require('../controllers/reviewController');
const { getProviderAvailability, getProviderSlots, getMyAvailability, addAvailability, removeAvailability } = require('../controllers/availabilityController');
const { getConversations, getUnreadCount, startConversation, getBookingOptions, pinBooking,
        getMessages, markRead, sendMessage } = require('../controllers/chatController');
const { getPosts, getMyPosts, getPost, createPost, closePost, deletePostAdmin, listPostsAdmin, moderatePost,
        getComments, addComment, deleteComment, toggleLike } = require('../controllers/postController');
const { getNotifications, markRead: markNotificationRead, markAllRead: markAllNotificationsRead } = require('../controllers/notificationController');
const { getDirectory, getRecommendations } = require('../controllers/directoryController');
const { searchAddress } = require('../controllers/geoController');

// ── Public routes (no token needed) ──────────────────────────────────────────
router.post('/register', authLimiter, validateRegister, registerUser);
router.post('/login',    authLimiter, validateLogin, loginUser);


// ── Authenticated routes (any logged-in user) ───────────────────────────────
router.get('/profile',   authMiddleware, checkBlocked, getProfile);
router.patch('/profile/directory', authMiddleware, checkBlocked, requireRole('PROVIDER'), validateDirectoryProfile, updateDirectoryProfile);
router.patch('/profile/contact',   authMiddleware, checkBlocked, requireRole('PROVIDER'), validateContactPrefs, updateContactPrefs);
router.get('/geo/search', geoLimiter, searchAddress);
router.get('/services',   listServices);
router.get('/providers',  getProviders);
router.get('/providers/:id/profile', getProviderProfile);
router.get('/providers/:providerId/availability', authMiddleware, checkBlocked, getProviderAvailability);
router.get('/providers/:providerId/slots',        authMiddleware, checkBlocked, getProviderSlots);

// ── Neighbourhood directory ("yellow pages") and recommendations — service providers only, public ──
router.get('/directory', authMiddleware.optional, getDirectory);
router.get('/recommendations', authMiddleware.optional, getRecommendations);

// ── Provider routes ─────────────────────────────────────────────────────────
router.post('/profile/become-provider', authMiddleware, checkBlocked, requireRole('REQUESTER'), becomeProvider);
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
router.post('/bookings/:id/issue',    authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), reportIssue);
router.post('/bookings/:id/report-problem', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), reportProblem);
router.patch('/bookings/:id/status',  authMiddleware, checkBlocked, requireRole('PROVIDER', 'REQUESTER', 'ADMIN'), validateBookingStatus, updateBookingStatus);

// ── Payments (the amount is always computed server-side from the stored booking price) ──
router.get('/payments/methods',               authMiddleware, getMethods);
router.get('/payments/summary/:bookingId',    authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getSummary);
router.get('/payments/mine',                  authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getMyPayments);
router.post('/payments/create-intent',        authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreatePaymentIntent, createPaymentIntent);
router.post('/payments/demo-pay',              authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreatePaymentIntent, demoPay);
router.post('/payments/withdraw',              authMiddleware, checkBlocked, requireRole('PROVIDER'), withdraw);
router.post('/payments/confirm',              authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), confirmPayment);

// -- PayPal payment routes  --
router.get('/payments/paypal/config',         authMiddleware, paypalConfig);
router.post('/payments/paypal/create-order',  authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreatePaymentIntent, paypalCreateOrder);
router.post('/payments/paypal/capture',       authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreatePaymentIntent, paypalCapture);

// ── Notifications (every signed-in user) ─────────────────────────────────────
router.get('/notifications',               authMiddleware, getNotifications);
router.patch('/notifications/read-all',    authMiddleware, markAllNotificationsRead);
router.patch('/notifications/:id/read',    authMiddleware, markNotificationRead);

// ── Chat routes (any logged-in user can message any other) ─────────────────
router.get('/chat/conversations',                             authMiddleware, checkBlocked, getConversations);
router.get('/chat/unread-count',                               authMiddleware, checkBlocked, getUnreadCount);
router.post('/chat/conversations',                             authMiddleware, checkBlocked, validateStartConversation, startConversation);
router.get('/chat/conversations/:conversationId/booking-options', authMiddleware, checkBlocked, getBookingOptions);
router.patch('/chat/conversations/:conversationId/pin',        authMiddleware, checkBlocked, validatePinBooking, pinBooking);
router.get('/chat/conversations/:conversationId/messages',     authMiddleware, checkBlocked, getMessages);
router.patch('/chat/conversations/:conversationId/read',       authMiddleware, checkBlocked, markRead);
router.post('/chat/conversations/:conversationId/messages',    authMiddleware, checkBlocked, messageLimiter, validateSendMessage, sendMessage);

// ── Review routes (REQUESTER submits; reading is public, same as the provider profile page) ─
router.post('/reviews',                    authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), submitReview);
router.get('/reviews/provider/:providerId', getReviewsForProvider);

// ── Community Board: browsing + reading comments is public; posting, commenting and liking need a sign-in ──
router.get('/posts',                         authMiddleware.optional, getPosts);
router.get('/posts/mine',                    authMiddleware, checkBlocked, getMyPosts);
router.post('/posts',                        authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), postLimiter, validateCreatePost, createPost);
router.get('/posts/:id',                     authMiddleware.optional, getPost);
router.patch('/posts/:id/close',             authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), closePost);
router.post('/posts/:id/like',               authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), toggleLike);
router.get('/posts/:id/comments',            getComments);
router.post('/posts/:id/comments',           authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), commentLimiter, validateCreateComment, addComment);
router.delete('/posts/:id/comments/:commentId', authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER', 'ADMIN'), deleteComment);
router.get('/admin/posts',                   authMiddleware, checkBlocked, requireRole('ADMIN'), listPostsAdmin);
router.patch('/admin/posts/:id/moderate',    authMiddleware, checkBlocked, requireRole('ADMIN'), moderatePost);
router.delete('/admin/posts/:id',            authMiddleware, checkBlocked, requireRole('ADMIN'), deletePostAdmin);

// ── Admin routes ────────────────────────────────────────────────────────────
router.get('/admin/users',              authMiddleware, checkBlocked, requireRole('ADMIN'), listUsers);
router.get('/admin/users/:id',          authMiddleware, checkBlocked, requireRole('ADMIN'), getUserById);
router.patch('/admin/users/:id',        authMiddleware, checkBlocked, requireRole('ADMIN'), updateUser);
router.get('/admin/bookings',           authMiddleware, checkBlocked, requireRole('ADMIN'), listBookings);
router.patch('/admin/users/:id/block',  authMiddleware, checkBlocked, requireRole('ADMIN'), validateBlockUser, toggleBlock);
router.delete('/admin/users/:id',       authMiddleware, checkBlocked, requireRole('ADMIN'), deleteUser);
router.get('/admin/stats',              authMiddleware, checkBlocked, requireRole('ADMIN'), getStats);
router.get('/admin/audit-logs',         authMiddleware, checkBlocked, requireRole('ADMIN'), getAuditLogs);
router.get('/admin/payments',           authMiddleware, checkBlocked, requireRole('ADMIN'), getAdminOverview);
router.patch('/admin/payouts/:id/paid', authMiddleware, checkBlocked, requireRole('ADMIN'), markPayoutPaid);
router.post('/admin/bookings/:id/resolve-issue', authMiddleware, checkBlocked, requireRole('ADMIN'), resolveIssue);
router.post('/admin/payments/settle',   authMiddleware, checkBlocked, requireRole('ADMIN'), settleNow);
router.get('/admin/chat/flagged',           authMiddleware, checkBlocked, requireRole('ADMIN'), listFlaggedMessages);
router.patch('/admin/chat/flagged/:messageId', authMiddleware, checkBlocked, requireRole('ADMIN'), validateReviewMessage, reviewFlaggedMessage);

module.exports = router;
