const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadCover = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === 'coverImage' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// The cover is up to two files: an image and/or a video, uploaded as
// separate named fields so each can be validated against its own type.
const handleCoverUpload = (req, res, next) => {
  uploadCover.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'coverVideo', maxCount: 1 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ message: 'La imagen debe ser JPEG, PNG o WEBP y el video MP4, MOV o AVI' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo no puede superar los 50MB' });
    }
    return res.status(400).json({ message: 'Error al subir el archivo' });
  });
};

module.exports = handleCoverUpload;
module.exports.ALLOWED_IMAGE_TYPES = ALLOWED_IMAGE_TYPES;
module.exports.ALLOWED_VIDEO_TYPES = ALLOWED_VIDEO_TYPES;
