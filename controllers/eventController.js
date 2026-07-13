const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const User = require('../models/User');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { ALLOWED_IMAGE_TYPES } = require('../middleware/uploadCover');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const updateEvent = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    if (req.file) deleteUploadedFile(`/uploads/${req.file.filename}`);
    return res.status(403).json({ message: 'No autorizado' });
  }

  const {
    title,
    description,
    city,
    country,
    eventType,
    locationType,
    visibility,
    reservationEnabled,
    status,
  } = req.body;

  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (city !== undefined) event.city = city;
  if (country !== undefined) event.country = country;
  if (eventType !== undefined) event.eventType = eventType;
  if (locationType !== undefined) event.locationType = locationType;
  if (visibility !== undefined) event.visibility = visibility;
  if (reservationEnabled !== undefined) {
    event.reservationEnabled = reservationEnabled === 'true' || reservationEnabled === true;
  }
  if (req.body.style !== undefined) event.style = JSON.parse(req.body.style || '[]');
  if (status !== undefined) {
    if (status === 'published' && event.status !== 'published') event.publishedAt = new Date();
    event.status = status;
  }

  const previousCoverMediaUrl = event.coverMediaUrl;
  if (req.file) {
    event.coverMediaUrl = `/uploads/${req.file.filename}`;
    event.coverMediaType = ALLOWED_IMAGE_TYPES.includes(req.file.mimetype) ? 'image' : 'video';
  }

  try {
    await event.save();
  } catch (err) {
    if (req.file) deleteUploadedFile(event.coverMediaUrl);
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  if (req.file && previousCoverMediaUrl) deleteUploadedFile(previousCoverMediaUrl);

  return res.status(200).json({ event: event.toJSON() });
};

const deleteEvent = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  await Session.deleteMany({ eventId });
  await Pack.deleteMany({ eventId });
  await event.deleteOne();
  deleteUploadedFile(event.coverMediaUrl);

  return res.status(200).json({ message: 'Evento eliminado' });
};

const attachSessionsAndPacks = async (events) => {
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

  return events.map((event) => {
    const eventJson = event.toJSON();
    eventJson.sessions = sessionsByEvent[event.id] || [];
    eventJson.packs = packsByEvent[event.id] || [];
    return eventJson;
  });
};

const getMyEvents = async (req, res) => {
  const events = await Event.find({ ownerUserId: req.userId }).sort({ createdAt: -1 });
  const result = await attachSessionsAndPacks(events);
  return res.json({ events: result });
};

const getPublicEvents = async (req, res) => {
  const { city, style, username, dateFrom } = req.query;

  const filter = { visibility: 'public', status: 'published' };
  if (city) filter.city = { $regex: escapeRegex(city), $options: 'i' };
  if (style) filter.style = { $regex: `^${escapeRegex(style)}$`, $options: 'i' };
  if (username) {
    const owner = await User.findOne({
      username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' },
    });
    if (!owner) return res.json({ events: [] });
    filter.ownerUserId = owner._id;
  }

  const events = await Event.find(filter).sort({ createdAt: -1 });
  let result = await attachSessionsAndPacks(events);

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (!Number.isNaN(fromDate.getTime())) {
      result = result.filter((e) =>
        e.sessions.some((s) => new Date(s.startDatetime) >= fromDate)
      );
    }
  }

  return res.json({ events: result });
};

module.exports = { createEvent, updateEvent, deleteEvent, getMyEvents, getPublicEvents };
