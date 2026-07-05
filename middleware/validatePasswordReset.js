const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const isString = (value) => typeof value === 'string';

const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;

  if (!isString(email)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }

  req.body.email = trimmedEmail;
  next();
};

const validateResetPassword = (req, res, next) => {
  const { email, code, newPassword } = req.body;

  if (!isString(email) || !isString(code) || !isString(newPassword)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ message: 'Código inválido o expirado' });
  }
  if (newPassword.length < 8 || newPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres' });
  }

  req.body.email = trimmedEmail;
  next();
};

module.exports = { validateForgotPassword, validateResetPassword };
