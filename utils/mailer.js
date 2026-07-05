const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const sendPasswordResetCode = async (email, code) => {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'MoveUp - Código de recuperación de contraseña',
    text: `Tu código de verificación es: ${code}\n\nExpira en 10 minutos. Si no solicitaste este cambio, ignora este correo.`,
  });
};

const sendEmailChangeCode = async (email, code) => {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'MoveUp - Verificación de nuevo correo',
    text: `Tu código de verificación para cambiar el correo es: ${code}\n\nExpira en 10 minutos. Si no solicitaste este cambio, ignora este correo.`,
  });
};

module.exports = { sendPasswordResetCode, sendEmailChangeCode };
