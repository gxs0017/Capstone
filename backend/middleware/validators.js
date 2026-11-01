// middleware/validators.js
// Declarative input validation for sensitive endpoints (express-validator).
const { body, param, validationResult } = require('express-validator');
const { POST_TYPES } = require('../utils/postTypes');
const { addressProblem } = require('../utils/places');
const { checkServiceName } = require('../utils/serviceNames');

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
    // City, province and postal code must agree (a postal code's first letter fixes the province)
    body('address').custom((address) => {
        const problem = addressProblem(address || {});
        if (problem) throw new Error(problem);
        return true;
    }),
    body('address.lat').optional({ nullable: true }).isFloat({ min: 41, max: 84 }).withMessage('Invalid location.'),
    body('address.lng').optional({ nullable: true }).isFloat({ min: -142, max: -52 }).withMessage('Invalid location.'),
    body('services').optional({ nullable: true }).isArray({ max: 15 }).withMessage('Choose up to 15 services.'),
    body('services.*').optional().custom((name) => {
        const { error } = checkServiceName(name);
        if (error) throw new Error(error);
        return true;
    }),
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
    body('scheduledDate').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/).withMessage('scheduledDate must be in "YYYY-MM-DD HH:mm:ss" format.'),
    body('bookingType').optional().isIn(['ONE_TIME', 'RECURRING']).withMessage('bookingType must be ONE_TIME or RECURRING.'),
    body('sessions').optional({ nullable: true }).isInt({ min: 1, max: 52 }).withMessage('sessions must be a whole number.'),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('Notes must be under 500 characters.'),
    handleValidation,
];

const validateCreatePaymentIntent = [
    body('bookingId').isInt({ min: 1 }).withMessage('bookingId must be a positive integer.'),
    handleValidation,
];


const validateBookingStatus = [
    param('id').isInt({ min: 1 }).withMessage('Invalid booking id.'),
    body('status').isIn(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED']).withMessage('Status must be CONFIRMED, DECLINED, CANCELLED, or COMPLETED.'),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('Reason must be under 255 characters.'),
    handleValidation,
];

const validateAddService = [
    body('serviceName').trim().notEmpty().withMessage('serviceName is required.').isLength({ max: 100 })
        .custom((name) => {
            const { error } = checkServiceName(name);
            if (error) throw new Error(error);
            return true;
        }),
    body('price').optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).withMessage('Price must be a positive number.'),
    handleValidation,
];

const validateSetPrice = [
    param('serviceId').isInt({ min: 1 }).withMessage('Invalid service id.'),
    body('price').isFloat({ min: 0, max: 100000 }).withMessage('Price must be a positive number.'),
    handleValidation,
];

const validateBlockUser = [
    param('id').isInt({ min: 1 }).withMessage('Invalid user id.'),
    body('blocked').isBoolean().withMessage('"blocked" (boolean) is required.'),
    handleValidation,
];

const MAX_MESSAGE_LENGTH = 1000;

const validateStartConversation = [
    body('otherUserId').isInt({ min: 1 }).withMessage('otherUserId must be a positive integer.'),
    body('bookingId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('bookingId must be a positive integer.'),
    handleValidation,
];

const validateSendMessage = [
    param('conversationId').isInt({ min: 1 }).withMessage('Invalid conversation id.'),
    body('content').trim().notEmpty().withMessage('Message content cannot be empty.')
        .isLength({ max: MAX_MESSAGE_LENGTH }).withMessage(`Message must be under ${MAX_MESSAGE_LENGTH} characters.`),
    handleValidation,
];

const validatePinBooking = [
    param('conversationId').isInt({ min: 1 }).withMessage('Invalid conversation id.'),
    body('bookingId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('bookingId must be a positive integer.'),
    handleValidation,
];

const validateReviewMessage = [
    param('messageId').isInt({ min: 1 }).withMessage('Invalid message id.'),
    body('approve').isBoolean().withMessage('"approve" (boolean) is required.'),
    handleValidation,
];

const validateCreateComment = [
    param('id').isInt({ min: 1 }).withMessage('Invalid post id.'),
    body('content').trim().notEmpty().withMessage('A comment cannot be empty.')
        .isLength({ max: 1000 }).withMessage('Comments must be under 1000 characters.'),
    body('parentId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid parent comment.'),
    handleValidation,
];

const validateContactPrefs = [
    body('showEmail').optional().isBoolean().withMessage('"showEmail" must be true or false.'),
    body('showPhone').optional().isBoolean().withMessage('"showPhone" must be true or false.'),
    handleValidation,
];

const validateDirectoryProfile = [
    body('bio').optional({ nullable: true }).isString().isLength({ max: 300 }).withMessage('Bio must be 300 characters or fewer.'),
    handleValidation,
];

const validateCreatePost = [
    body('type').isIn(POST_TYPES).withMessage('Choose a valid post category.'),
    body('title').trim().notEmpty().withMessage('A title is required.').isLength({ max: 150 }),
    body('description').trim().notEmpty().withMessage('A description is required.').isLength({ max: 2000 }),
    body('price').optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).withMessage('Price must be a positive number.'),
    body('city').optional({ nullable: true }).isString().isLength({ max: 50 }),
    handleValidation,
];

module.exports = {
    validateRegister, validateLogin, validateCreateBooking, validateCreatePaymentIntent,
    validateBookingStatus, validateAddService, validateBlockUser, validateSetPrice,
    validateStartConversation, validateSendMessage, validatePinBooking, validateReviewMessage,
    validateCreatePost, validateCreateComment, validateDirectoryProfile, validateContactPrefs,
};
