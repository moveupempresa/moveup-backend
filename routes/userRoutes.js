const express = require('express');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const {
  changeUsername,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount,
} = require('../controllers/userController');
const { followUser, unfollowUser, getMyFollowing } = require('../controllers/followController');
const { getMyReservations } = require('../controllers/registrationController');
const userRateLimit = require('../middleware/userRateLimit');
const passwordResetRateLimit = require('../middleware/passwordResetRateLimit');

const router = express.Router();

router.use(requireAuth);

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

router.post('/upgrade-to-pro', userRateLimit, async (req, res) => {
  const accountHolderName = (req.body?.accountHolderName || '').trim();
  const iban = (req.body?.iban || '').replace(/\s+/g, '').toUpperCase();

  if (!accountHolderName) {
    return res.status(400).json({ message: 'El nombre del titular es obligatorio' });
  }
  if (!IBAN_REGEX.test(iban)) {
    return res.status(400).json({ message: 'El IBAN no es válido' });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    {
      subscriptionPlan: 'pro',
      billingAccountHolder: accountHolderName,
      billingIban: iban,
    },
    { new: true, returnDocument: 'after' }
  );
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  return res.status(200).json({ user: user.toJSON() });
});

router.post('/downgrade-to-free', userRateLimit, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.userId,
    { subscriptionPlan: 'free' },
    { new: true, returnDocument: 'after' }
  );
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  return res.status(200).json({ user: user.toJSON() });
});

router.get('/me/reservations', getMyReservations);
router.get('/me/following', getMyFollowing);
router.patch('/me/username', userRateLimit, changeUsername);
router.post('/me/request-email-change', passwordResetRateLimit, requestEmailChange);
router.post('/me/confirm-email-change', passwordResetRateLimit, confirmEmailChange);
router.delete('/me', userRateLimit, deleteAccount);
router.post('/:userId/follow', userRateLimit, followUser);
router.delete('/:userId/follow', userRateLimit, unfollowUser);

module.exports = router;
