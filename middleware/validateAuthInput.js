const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]{3,30}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const isString = (value) => typeof value === 'string';

const validateSignup = (req, res, next) => {
  const { email, username, password } = req.body;

  if (!isString(email) || !isString(username) || !isString(password)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedUsername = username.trim();

  if (!trimmedEmail || trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ message: 'Ingresa un correo válido' });
  }
  if (!USERNAME_REGEX.test(trimmedUsername)) {
    return res.status(400).json({
      message: 'El nombre de usuario debe tener 3-30 caracteres (letras, números, "_", "." o "-")',
    });
  }
  if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres' });
  }

  req.body.email = trimmedEmail;
  req.body.username = trimmedUsername;
  next();
};

const validateSignin = (req, res, next) => {
  const { email, password } = req.body;

  if (!isString(email) || !isString(password)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

module.exports = { validateSignup, validateSignin };
