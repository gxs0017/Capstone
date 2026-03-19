const express = require('express');
const router = express.Router();
const { registerUser, getUsers } = require('../controllers/Controller');

router.post('/register', registerUser); 
router.get('/all-users', getUsers);     

module.exports = router;