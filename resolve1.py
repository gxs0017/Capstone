import re
def write(p,s): open(p,'w',encoding='utf-8',newline='\n').write(s)
def rd(p): return open(p,encoding='utf-8').read()

# server.js
s=rd('server.js')
s=re.sub(r"<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> my-features-snapshot\n",lambda m:m.group(1)+m.group(2),s,flags=re.S)
write('server.js',s)

# adminController.js
s=rd('controllers/adminController.js')
s=s.replace("""<<<<<<< HEAD
const { toAdminUserDTO, toAdminUserDTOList } = require('../mappers/userMapper');
const { logAction } = require('../models/AuditLog');
=======
const { toAdminUserDTO, toAdminUserDTOList, toBookingDTOList } = require('../mappers/userMapper');
""","""const { toAdminUserDTO, toAdminUserDTOList, toBookingDTOList } = require('../mappers/userMapper');
const { logAction } = require('../models/AuditLog');
""")
s=s.replace(">>>>>>> my-features-snapshot\n\n// ----------------------------------------------------------------\n// GET /api/admin/users —","\n// ----------------------------------------------------------------\n// GET /api/admin/users —",1)
s=s.replace("<<<<<<< HEAD\n// ----------------------------------------------------------------\n// GET /api/admin/audit-logs","// ----------------------------------------------------------------\n// GET /api/admin/audit-logs")
s=re.sub(r"module.exports = \{ listUsers, getUserById, toggleBlock, deleteUser, getStats, getAuditLogs \};\n=======\n.*?>>>>>>> my-features-snapshot\n","module.exports = { listUsers, getUserById, updateUser, toggleBlock, deleteUser, getStats, listBookings, getAuditLogs };\n",s,flags=re.S)
write('controllers/adminController.js',s)

# Routes.js
s=rd('routes/Routes.js')
blocks=[
"""const { listUsers, getUserById, updateUser, toggleBlock, deleteUser, getStats, listBookings, getAuditLogs } = require('../controllers/adminController');
const { getMyServices, addService, removeService, getAvailableServices, updatePrice } = require('../controllers/providerController');
const { getQuote, createBooking, getMyBookings, updateBookingStatus } = require('../controllers/bookingController');
const { createOrder: paypalCreateOrder, capture: paypalCapture, config: paypalConfig } = require('../controllers/paypalController');
const { submitReview, getReviewsForProvider } = require('../controllers/reviewController');
const { getProviderAvailability, getMyAvailability, addAvailability, removeAvailability } = require('../controllers/availabilityController');
""",
"""router.get('/providers',  getProviders);
router.get('/providers/:providerId/availability', authMiddleware, checkBlocked, getProviderAvailability);
""",
"""router.get('/bookings/quote',         authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), getQuote);
router.post('/bookings',              authMiddleware, checkBlocked, requireRole('REQUESTER', 'PROVIDER'), validateCreateBooking, createBooking);
""",
"""router.get('/admin/users',              authMiddleware, checkBlocked, requireRole('ADMIN'), listUsers);
router.get('/admin/users/:id',          authMiddleware, checkBlocked, requireRole('ADMIN'), getUserById);
router.patch('/admin/users/:id',        authMiddleware, checkBlocked, requireRole('ADMIN'), updateUser);
router.get('/admin/bookings',           authMiddleware, checkBlocked, requireRole('ADMIN'), listBookings);
router.patch('/admin/users/:id/block',  authMiddleware, checkBlocked, requireRole('ADMIN'), validateBlockUser, toggleBlock);
router.delete('/admin/users/:id',       authMiddleware, checkBlocked, requireRole('ADMIN'), deleteUser);
router.get('/admin/stats',              authMiddleware, checkBlocked, requireRole('ADMIN'), getStats);
router.get('/admin/audit-logs',         authMiddleware, checkBlocked, requireRole('ADMIN'), getAuditLogs);
"""]
it=iter(blocks)
s=re.sub(r"<<<<<<< HEAD\n.*?=======\n.*?>>>>>>> my-features-snapshot\n",lambda m:next(it),s,flags=re.S)
s=s.replace("(additive; separate from the Stripe work)","")
write('routes/Routes.js',s)
