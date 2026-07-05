const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendPasswordResetCode } = require('../utils/mailer');

const CODE_TTL_MS = 10 * 60 * 1000;

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: 'No existe una cuenta con ese correo' });
  }

  const code = generateCode();
  user.resetCodeHash = await bcrypt.hash(code, 10);
  user.resetCodeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  await user.save();

  await sendPasswordResetCode(email, code);

  return res.status(200).json({ message: 'Código de verificación enviado' });
};

const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  const user = await User.findOne({ email }).select('+resetCodeHash +resetCodeExpiresAt');
  if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  if (user.resetCodeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  const isCodeValid = await bcrypt.compare(code, user.resetCodeHash);
  if (!isCodeValid) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetCodeHash = undefined;
  user.resetCodeExpiresAt = undefined;
  await user.save();

  return res.status(200).json({ message: 'Contraseña actualizada' });
};

module.exports = { forgotPassword, resetPassword };
