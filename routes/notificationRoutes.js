const express = require('express');
const { getMyNotifications, markAllAsRead } = require('../controllers/notificationController');
const requireAuth = require('../middleware/requireAuth');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth, userRateLimit);

router.get('/', getMyNotifications);
router.post('/mark-read', markAllAsRead);

module.exports = router;
