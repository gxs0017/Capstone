import re
def rd(p): return open(p,encoding='utf-8').read()
def write(p,s): open(p,'w',encoding='utf-8',newline='\n').write(s)
def sub(s,a,b):
    assert a in s, a
    return s.replace(a,b,1)
p='controllers/bookingController.js'
s=rd(p)
s=re.sub(r"<<<<<<< HEAD\n.*?=======\n(.*?)>>>>>>> my-features-snapshot\n",lambda m:"        logAction(req.user.id, 'BOOKING_' + status, 'booking: ' + req.params.id, req.ip);\n"+m.group(1),s,flags=re.S)
s=sub(s,"                b.payment_status,\n                b.payment_method,\n                b.amount,\n","                b.payment_method,\n                b.amount,\n")
s=sub(s,"logAction(req.user.id, 'BOOKING_CREATED', 'booking: ' + result.insertId, req.ip);","logAction(req.user.id, 'BOOKING_CREATED', 'booking: ' + bookingIds.join(','), req.ip);")
# pricing: provider price, else service base price
s=sub(s,"`SELECT pd.provider_detail_id, s.base_price\n","`SELECT pd.provider_detail_id, COALESCE(pd.price, s.base_price) AS base_price\n")
s=sub(s,"""        const [svc] = await pool.execute('SELECT base_price FROM services WHERE service_id = ?', [serviceId]);
        if (svc.length === 0) return res.status(404).json({ message: 'Service not found.' });
""","""        // A provider's own price for the service wins; otherwise the service's base price.
        const providerId = Number(req.query.providerId) || null;
        const [svc] = await pool.execute(
            `SELECT COALESCE(pd.price, s.base_price) AS base_price
             FROM services s
             LEFT JOIN provider_details pd ON pd.service_id = s.service_id AND pd.user_id = ?
             WHERE s.service_id = ?`,
            [providerId, serviceId]
        );
        if (svc.length === 0) return res.status(404).json({ message: 'Service not found.' });
""")
s=sub(s,"// GET /api/bookings/quote?serviceId=1&type=ONE_TIME|RECURRING&sessions=4","// GET /api/bookings/quote?serviceId=1&providerId=2&type=ONE_TIME|RECURRING&sessions=4")
write(p,s)

# paypal charges the booking's stored price (already includes provider price / discounts)
p='controllers/paypalController.js'
s=rd(p)
s=sub(s,"b.paypal_order_id, pd.price","b.paypal_order_id, COALESCE(b.price, pd.price) AS price")
write(p,s)

# validators: allow all statuses and the app's datetime format + booking type fields
p='middleware/validators.js'
s=rd(p)
s=sub(s,"body('scheduledDate').optional({ nullable: true }).isISO8601().withMessage('scheduledDate must be a valid date.'),","body('scheduledDate').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/).withMessage('scheduledDate must be in \"YYYY-MM-DD HH:mm:ss\" format.'),\n    body('bookingType').optional().isIn(['ONE_TIME', 'RECURRING']).withMessage('bookingType must be ONE_TIME or RECURRING.'),\n    body('sessions').optional({ nullable: true }).isInt({ min: 1, max: 52 }).withMessage('sessions must be a whole number.'),")
s=sub(s,"body('status').isIn(['CONFIRMED', 'CANCELLED']).withMessage('Status must be CONFIRMED or CANCELLED.'),","body('status').isIn(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED']).withMessage('Status must be CONFIRMED, DECLINED, CANCELLED, or COMPLETED.'),\n    body('reason').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('Reason must be under 255 characters.'),")
write(p,s)

# rate limit: 15 req / 15 min for the whole API would lock the app up
p='middleware/rateLimit.js'
s=rd(p)
s=sub(s,"max: 15, // max requests per IP ","max: 300, // max requests per IP per window ")
write(p,s)
