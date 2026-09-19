// middleware/validators.js
// Declarative input validation for sensitive endpoints (express-validator).
const { body, param, validationResult } = require('express-validator');

// Returns 400 with the first error message if validation failed.
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const list = errors.array();
        return res.status(400).json({ message: list[0].msg, errors: list });
    }
    next();
};

const validateRegister = [
    body('firstName').trim().notEmpty().withMessage('First name is required.').isLength({ max: 50 }),
    body('lastName').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 50 }),
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('phoneNumber').trim().matches(/^\d{10}$/).withMessage('Phone number must be 10 digits.'),
    body('dateOfBirth').isISO8601().withMessage('A valid date of birth is required.'),
    body('role').isIn(['PROVIDER', 'REQUESTER']).withMessage('Role must be PROVIDER or REQUESTER.'),
    body('address.street').trim().notEmpty().withMessage('Street is required.'),
    body('address.city').trim().notEmpty().withMessage('City is required.'),
    body('address.province').trim().notEmpty().withMessage('Province is required.'),
    body('address.postalCode').trim().notEmpty().withMessage('Postal code is required.'),
    handleValidation,
];

const validateLogin = [
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
    handleValidation,
];

const validateCreateBooking = [
    body('providerId').isInt({ min: 1 }).withMessage('providerId must be a positive integer.'),
    body('serviceId').isInt({ min: 1 }).withMessage('serviceId must be a positive integer.'),
    body('scheduledDate').optional({ nullable: true }).isISO8601().withMessage('scheduledDate must be a valid date.'),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('Notes must be under 500 characters.'),
    handleValidation,
];

const validateBookingStatus = [
    param('id').isInt({ min: 1 }).withMessage('Invalid booking id.'),
    body('status').isIn(['CONFIRMED', 'CANCELLED']).withMessage('Status must be CONFIRMED or CANCELLED.'),
    handleValidation,
];

const validateAddService = [
    body('serviceName').trim().notEmpty().withMessage('serviceName is required.').isLength({ max: 100 }),
    handleValidation,
];

const validateBlockUser = [
    param('id').isInt({ min: 1 }).withMessage('Invalid user id.'),
    body('blocked').isBoolean().withMessage('"blocked" (boolean) is required.'),
    handleValidation,
];

module.exports = {
    validateRegister, validateLogin, validateCreateBooking,
    validateBookingStatus, validateAddService, validateBlockUser,
};
