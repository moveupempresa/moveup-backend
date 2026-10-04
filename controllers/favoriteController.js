const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Follow = require('../models/Follow');
const User = require('../models/User');
const Profile = require('../models/Profile');

const addFavorite = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  if (userId === req.userId) {
    return res.status(400).json({ message: 'No puedes marcarte a ti mismo como favorito' });
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) return res.status(404).json({ message: 'Usuario no encontrado' });

  await Favorite.updateOne(
    { userId: req.userId, favoriteUserId: userId },
    { $setOnInsert: { userId: req.userId, favoriteUserId: userId } },
    { upsert: true }
  );

  return res.status(200).json({ isFavorite: true });
};

const removeFavorite = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  await Favorite.deleteOne({ userId: req.userId, favoriteUserId: userId });

  return res.status(200).json({ isFavorite: false });
};

const getMyFavorites = async (req, res) => {
  const favorites = await Favorite.find({ userId: req.userId }).sort({ createdAt: -1 });
  if (favorites.length === 0) return res.json({ profiles: [] });

  const favoriteIds = favorites.map((f) => f.favoriteUserId);
  const [users, profiles, followerCounts, myFollowing] = await Promise.all([
    User.find({ _id: { $in: favoriteIds } }),
    Profile.find({ userId: { $in: favoriteIds } }),
    Follow.aggregate([
      { $match: { followingId: { $in: favoriteIds } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
    Follow.find({ followerId: req.userId, followingId: { $in: favoriteIds } }),
  ]);

  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();
  const countByUser = {};
  for (const c of followerCounts) countByUser[c._id.toString()] = c.count;
  const iFollowSet = new Set(myFollowing.map((f) => f.followingId.toString()));

  const profilesResult = favorites
    .map((f) => f.favoriteUserId.toString())
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
      isFavorite: true,
    }));

  return res.json({ profiles: profilesResult });
};

module.exports = { addFavorite, removeFavorite, getMyFavorites };
