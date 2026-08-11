const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Notification = require('../models/Notification');

const followUser = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  if (userId === req.userId) {
    return res.status(400).json({ message: 'No puedes seguirte a ti mismo' });
  }

  const [targetUser, follower] = await Promise.all([
    User.findById(userId),
    User.findById(req.userId),
  ]);
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
    if (follower) {
      await Notification.create({
        userId: userId,
        type: 'new_follower',
        message: `${follower.username} ha empezado a seguirte`,
        relatedUserId: req.userId,
      });
    }
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

const getMyFollowing = async (req, res) => {
  const follows = await Follow.find({ followerId: req.userId }).sort({ createdAt: -1 });
  if (follows.length === 0) return res.json({ profiles: [] });

  const followingIds = follows.map((f) => f.followingId);
  const [users, profiles, followerCounts] = await Promise.all([
    User.find({ _id: { $in: followingIds } }),
    Profile.find({ userId: { $in: followingIds } }),
    Follow.aggregate([
      { $match: { followingId: { $in: followingIds } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
  ]);

  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();
  const countByUser = {};
  for (const c of followerCounts) countByUser[c._id.toString()] = c.count;

  const profilesResult = follows
    .map((f) => f.followingId.toString())
    .filter((id) => profileByUser[id])
    .map((id) => ({
      userId: id,
      username: usernameByUser[id] || '',
      displayName: profileByUser[id].displayName,
      artisticName: profileByUser[id].artisticName,
      bio: profileByUser[id].bio,
      profileImage: profileByUser[id].profileImage,
      city: profileByUser[id].city,
      country: profileByUser[id].country,
      experience: profileByUser[id].experience,
      followersCount: countByUser[id] || 0,
      isFollowing: true,
    }));

  return res.json({ profiles: profilesResult });
};

const getMyFollowers = async (req, res) => {
  const follows = await Follow.find({ followingId: req.userId }).sort({ createdAt: -1 });
  if (follows.length === 0) return res.json({ profiles: [] });

  const followerIds = follows.map((f) => f.followerId);
  const [users, profiles, followerCounts, myFollowing] = await Promise.all([
    User.find({ _id: { $in: followerIds } }),
    Profile.find({ userId: { $in: followerIds } }),
    Follow.aggregate([
      { $match: { followingId: { $in: followerIds } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
    Follow.find({ followerId: req.userId, followingId: { $in: followerIds } }),
  ]);

  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();
  const countByUser = {};
  for (const c of followerCounts) countByUser[c._id.toString()] = c.count;
  const iFollowSet = new Set(myFollowing.map((f) => f.followingId.toString()));

  const profilesResult = follows
    .map((f) => f.followerId.toString())
    .filter((id) => profileByUser[id])
    .map((id) => ({
      userId: id,
      username: usernameByUser[id] || '',
      displayName: profileByUser[id].displayName,
      artisticName: profileByUser[id].artisticName,
      bio: profileByUser[id].bio,
      profileImage: profileByUser[id].profileImage,
      city: profileByUser[id].city,
      country: profileByUser[id].country,
      experience: profileByUser[id].experience,
      followersCount: countByUser[id] || 0,
      isFollowing: iFollowSet.has(id),
    }));

  return res.json({ profiles: profilesResult });
};

module.exports = { followUser, unfollowUser, getMyFollowing, getMyFollowers };
