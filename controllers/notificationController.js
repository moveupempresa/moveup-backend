const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Registration = require('../models/Registration');

const getMyNotifications = async (req, res) => {
  const notifications = await Notification.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(100);

  const requests = notifications.filter((n) => n.type === 'signup_request');
  const pendingKeys = new Set();
  if (requests.length > 0) {
    const pending = await Registration.find({
      status: 'pending',
      $or: requests.map((n) => ({
        userId: n.relatedUserId,
        targetType: n.relatedTargetType,
        targetId: n.relatedTargetId,
      })),
    });
    for (const reg of pending) {
      pendingKeys.add(`${reg.userId}:${reg.targetType}:${reg.targetId}`);
    }
  }

  const json = notifications.map((n) => {
    const obj = n.toJSON();
    if (obj.type === 'signup_request') {
      obj.isPending = pendingKeys.has(`${n.relatedUserId}:${n.relatedTargetType}:${n.relatedTargetId}`);
    }
    return obj;
  });
  return res.status(200).json({ notifications: json });
};

const markAllAsRead = async (req, res) => {
  await Notification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
  return res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
};

const markAsRead = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Notificación no encontrada' });
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId: req.userId },
    { $set: { read: true } },
    { new: true }
  );
  if (!notification) {
    return res.status(404).json({ message: 'Notificación no encontrada' });
  }

  return res.status(200).json({ notification: notification.toJSON() });
};

module.exports = { getMyNotifications, markAllAsRead, markAsRead };
