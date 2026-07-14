const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');
const Notification = require('../models/Notification');

const followUser = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  if (userId === req.userId) {
    return res.status(400).json({ message: 'No puedes seguirte a ti mismo' });
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) return res.status(404).json({ message: 'Usuario no encontrado' });

  const result = await Follow.updateOne(
    { followerId: req.userId, followingId: userId },
    { $setOnInsert: { followerId: req.userId, followingId: userId } },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    await Notification.create({
      userId: req.userId,
      type: 'followed_user',
      message: `Has empezado a seguir a ${targetUser.username}`,
      relatedUserId: userId,
    });
  }

  const followersCount = await Follow.countDocuments({ followingId: userId });
  return res.status(200).json({ isFollowing: true, followersCount });
};

const unfollowUser = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  await Follow.deleteOne({ followerId: req.userId, followingId: userId });

  const followersCount = await Follow.countDocuments({ followingId: userId });
  return res.status(200).json({ isFollowing: false, followersCount });
};

module.exports = { followUser, unfollowUser };
