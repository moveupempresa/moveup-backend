const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Follow = require('../models/Follow');
const { sendEmailChangeCode } = require('../utils/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]{3,30}$/;
const PHONE_REGEX = /^[+]?[\d\s-]{6,20}$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const SEARCH_LIMIT = 20;
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Profiles whose username or display name contains the query, independent
// of whether they've ever published an event - an Instagram-style people
// search rather than an "events by this organizer" filter.
const searchProfiles = async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (query.length < 2) return res.json({ profiles: [] });

  const regex = { $regex: escapeRegex(query), $options: 'i' };
  const [usersByUsername, profilesByDisplayName] = await Promise.all([
    User.find({ username: regex }),
    Profile.find({ displayName: regex }),
  ]);

  const matchedIds = [
    ...new Set([
      ...usersByUsername.map((u) => u.id),
      ...profilesByDisplayName.map((p) => p.userId.toString()),
    ]),
  ].slice(0, SEARCH_LIMIT);
  if (matchedIds.length === 0) return res.json({ profiles: [] });

  const objectIds = matchedIds.map((id) => new mongoose.Types.ObjectId(id));
  const [users, profiles, followerCounts, viewerFollowing] = await Promise.all([
    User.find({ _id: { $in: objectIds } }),
    Profile.find({ userId: { $in: objectIds } }),
    Follow.aggregate([
      { $match: { followingId: { $in: objectIds } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
    Follow.find({ followerId: req.userId, followingId: { $in: objectIds } }),
  ]);

  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();
  const countByUser = {};
  for (const c of followerCounts) countByUser[c._id.toString()] = c.count;
  const followingSet = new Set(viewerFollowing.map((f) => f.followingId.toString()));

  const results = matchedIds
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
      isFollowing: followingSet.has(id),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return res.json({ profiles: results });
};

const getCurrentSession = async (req, res) => {
  const [user, profile] = await Promise.all([
    User.findById(req.userId),
    Profile.findOne({ userId: req.userId }),
  ]);
  if (!user || !profile) return res.status(404).json({ message: 'Usuario no encontrado' });
  return res.status(200).json({ user: user.toJSON(), profile: profile.toJSON() });
};

const changeUsername = async (req, res) => {
  const { username } = req.body;

  if (typeof username !== 'string' || !USERNAME_REGEX.test(username.trim())) {
    return res.status(400).json({
      message: 'El nombre de usuario debe tener 3-30 caracteres (letras, números, "_", "." o "-")',
    });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { username: username.trim() },
    { new: true, returnDocument: 'after', runValidators: true }
  );
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  return res.status(200).json({ user: user.toJSON() });
};

const changePhone = async (req, res) => {
  const { phone } = req.body;

  if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    return res.status(400).json({ message: 'Ingresa un número de teléfono válido' });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { phone: phone.trim() },
    { new: true, returnDocument: 'after', runValidators: true }
  );
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  return res.status(200).json({ user: user.toJSON() });
};

const requestEmailChange = async (req, res) => {
  const { newEmail } = req.body;

  if (typeof newEmail !== 'string') {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  const trimmedEmail = newEmail.trim().toLowerCase();
  if (!trimmedEmail || trimmedEmail.length > 254 || !EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }

  const existing = await User.findOne({ email: trimmedEmail });
  if (existing) {
    return res.status(409).json({ message: 'Este correo ya está en uso' });
  }

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

  const code = generateCode();
  user.pendingEmail = trimmedEmail;
  user.emailChangeCodeHash = await bcrypt.hash(code, 10);
  user.emailChangeCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  await user.save();

  await sendEmailChangeCode(trimmedEmail, code);
  return res.status(200).json({ message: 'Código de verificación enviado al nuevo correo' });
};

const confirmEmailChange = async (req, res) => {
  const { code } = req.body;

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  const user = await User.findById(req.userId).select(
    '+pendingEmail +emailChangeCodeHash +emailChangeCodeExpiresAt'
  );
  if (!user || !user.pendingEmail || !user.emailChangeCodeHash) {
    return res.status(400).json({ message: 'No hay un cambio de correo pendiente' });
  }
  if (user.emailChangeCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  const isValid = await bcrypt.compare(code, user.emailChangeCodeHash);
  if (!isValid) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeCodeHash = undefined;
  user.emailChangeCodeExpiresAt = undefined;
  await user.save();

  return res.status(200).json({ user: user.toJSON() });
};

const deleteAccount = async (req, res) => {
  await Profile.deleteOne({ userId: req.userId });
  await User.findByIdAndDelete(req.userId);
  return res.status(204).send();
};

module.exports = {
  getCurrentSession,
  searchProfiles,
  changeUsername,
  changePhone,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount,
};
