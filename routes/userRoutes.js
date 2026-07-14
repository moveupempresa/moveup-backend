const express = require('express');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const {
  changeUsername,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount,
} = require('../controllers/userController');
const { followUser, unfollowUser } = require('../controllers/followController');
const userRateLimit = require('../middleware/userRateLimit');
const passwordResetRateLimit = require('../middleware/passwordResetRateLimit');

const router = express.Router();

router.use(requireAuth);

router.post('/upgrade-to-pro', userRateLimit, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.userId,
    { subscriptionPlan: 'pro' },
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

router.patch('/me/username', userRateLimit, changeUsername);
router.post('/me/request-email-change', passwordResetRateLimit, requestEmailChange);
router.post('/me/confirm-email-change', passwordResetRateLimit, confirmEmailChange);
router.delete('/me', userRateLimit, deleteAccount);
router.post('/:userId/follow', userRateLimit, followUser);
router.delete('/:userId/follow', userRateLimit, unfollowUser);

module.exports = router;
