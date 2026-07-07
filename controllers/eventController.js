const Event = require('../models/Event');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { ALLOWED_IMAGE_TYPES } = require('../middleware/uploadCover');

const createEvent = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'La portada del evento es requerida' });
  }

  const { title, description, style, city, country, address, reservationEnabled, status } = req.body;

  const coverMediaUrl = `/uploads/${req.file.filename}`;
  const coverMediaType = ALLOWED_IMAGE_TYPES.includes(req.file.mimetype) ? 'image' : 'video';

  let event;
  try {
    event = await Event.create({
      ownerUserId: req.userId,
      title,
      description,
      style,
      city,
      country,
      address: address || null,
      reservationEnabled: reservationEnabled === 'true' || reservationEnabled === true,
      coverMediaType,
      coverMediaUrl,
      status: status || 'draft',
      publishedAt: status === 'published' ? new Date() : null,
    });
  } catch (err) {
    deleteUploadedFile(coverMediaUrl);
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  return res.status(201).json({ event: event.toJSON() });
};

module.exports = { createEvent };
