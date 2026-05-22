const express = require('express');

const authController = require('../controllers/authController.js');
const { loadAuthUser, requireAuth } = require('../middleware/authMiddleware.js');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', loadAuthUser, requireAuth, authController.me);

module.exports = router;
