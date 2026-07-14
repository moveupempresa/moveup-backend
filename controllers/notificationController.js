const Notification = require('../models/Notification');

const getMyNotifications = async (req, res) => {
  const notifications = await Notification.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(100);
  return res.status(200).json({ notifications: notifications.map((n) => n.toJSON()) });
};

const markAllAsRead = async (req, res) => {
  await Notification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
  return res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
};

module.exports = { getMyNotifications, markAllAsRead };
