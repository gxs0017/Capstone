const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUsers } = require('../controllers/Controller');
const authMiddleware = require('../middleware/authMiddleWare');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/all-users', authMiddleware, getUsers);

module.exports = router;