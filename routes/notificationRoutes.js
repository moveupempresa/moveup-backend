const express = require('express');
const {
  getMyNotifications,
  markAllAsRead,
  markAsRead,
} = require('../controllers/notificationController');
const requireAuth = require('../middleware/requireAuth');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth);

// Fetching notifications happens frequently (badge polling) - only the
// mutating action is rate limited.
router.get('/', getMyNotifications);
router.post('/mark-read', userRateLimit, markAllAsRead);
router.patch('/:id/read', userRateLimit, markAsRead);

module.exports = router;
