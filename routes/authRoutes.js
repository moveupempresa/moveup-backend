const express = require('express');
const { signup, signin } = require('../controllers/authController');
const { forgotPassword, resetPassword } = require('../controllers/passwordResetController');
const { validateSignup, validateSignin } = require('../middleware/validateAuthInput');
const {
  validateForgotPassword,
  validateResetPassword,
} = require('../middleware/validatePasswordReset');
const authRateLimit = require('../middleware/authRateLimit');
const passwordResetRateLimit = require('../middleware/passwordResetRateLimit');

const router = express.Router();

router.post('/signup', authRateLimit, validateSignup, signup);
router.post('/signin', authRateLimit, validateSignin, signin);
router.post('/forgot-password', passwordResetRateLimit, validateForgotPassword, forgotPassword);
router.post('/reset-password', passwordResetRateLimit, validateResetPassword, resetPassword);

module.exports = router;
