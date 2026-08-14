const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadCv = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

const handleCvUpload = (req, res, next) => {
  uploadCv.single('cv')(req, res, (err) => {
    if (!err) return next();

    if (err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ message: 'Solo se permiten archivos PDF o imágenes (JPEG, PNG, WEBP)' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo no puede superar los 10MB' });
    }
    return res.status(400).json({ message: 'Error al subir el archivo' });
  });
};

module.exports = handleCvUpload;
