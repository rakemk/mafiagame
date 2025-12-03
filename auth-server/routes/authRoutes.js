const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/resend-verification', authController.resendVerification);
router.get('/me', authMiddleware, authController.me);
router.get('/verify-email', authController.verifyEmail);

router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

module.exports = router;
