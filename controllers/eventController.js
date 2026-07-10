const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { ALLOWED_IMAGE_TYPES } = require('../middleware/uploadCover');

const createEvent = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'La portada del evento es requerida' });
  }

  const { title, description, city, country, reservationEnabled, status } = req.body;
  const style = JSON.parse(req.body.style || '[]');

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

const getMyEvents = async (req, res) => {
  const events = await Event.find({ ownerUserId: req.userId }).sort({ createdAt: -1 });

  const eventIds = events.map((e) => e._id);
  const sessions = await Session.find({ eventId: { $in: eventIds } }).sort({ startDatetime: 1 });
  const packs = await Pack.find({ eventId: { $in: eventIds } }).sort({ createdAt: 1 });

  const sessionsByEvent = {};
  for (const session of sessions) {
    const key = session.eventId.toString();
    if (!sessionsByEvent[key]) sessionsByEvent[key] = [];
    sessionsByEvent[key].push(session.toJSON());
  }

  const packsByEvent = {};
  for (const pack of packs) {
    const key = pack.eventId.toString();
    if (!packsByEvent[key]) packsByEvent[key] = [];
    packsByEvent[key].push(pack.toJSON());
  }

  const result = events.map((event) => {
    const eventJson = event.toJSON();
    eventJson.sessions = sessionsByEvent[event.id] || [];
    eventJson.packs = packsByEvent[event.id] || [];
    return eventJson;
  });

  return res.json({ events: result });
};

module.exports = { createEvent, getMyEvents };
