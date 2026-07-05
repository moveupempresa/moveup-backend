const rateLimit = require('express-rate-limit');

const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos, inténtalo de nuevo más tarde' },
});

module.exports = passwordResetRateLimit;
