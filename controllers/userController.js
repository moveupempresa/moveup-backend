const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { sendEmailChangeCode } = require('../utils/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]{3,30}$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

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
  changeUsername,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount,
};
