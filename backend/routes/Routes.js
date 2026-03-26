const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUsers } = require('../controllers/Controller');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/all-users', getUsers);

module.exports = router;