const express       = require('express');
const router        = express.Router();
const authMiddleware = require('../middleware/auth');
const { registerUser, loginUser, getProviders, getUsers } = require('../controllers/Controller');

// Public routes — no token needed
router.post('/register', registerUser);
router.post('/login',    loginUser);

// Protected routes — valid JWT required
router.get('/providers', authMiddleware, getProviders);
router.get('/all-users', authMiddleware, getUsers);

module.exports = router;
