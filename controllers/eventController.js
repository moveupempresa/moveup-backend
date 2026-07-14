const mongoose = require('mongoose');
const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const User = require('../models/User');
const Profile = require('../models/Profile');
const SavedEvent = require('../models/SavedEvent');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { ALLOWED_IMAGE_TYPES } = require('../middleware/uploadCover');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notifyFollowersOfNewEvent = async (event) => {
  if (event.visibility !== 'public') return;

  const [followers, owner] = await Promise.all([
    Follow.find({ followingId: event.ownerUserId }),
    User.findById(event.ownerUserId),
  ]);
  if (!owner || followers.length === 0) return;

  await Notification.insertMany(
    followers.map((follow) => ({
      userId: follow.followerId,
      type: 'followed_user_new_event',
      message: `${owner.username} ha publicado un nuevo evento: ${event.title}`,
      relatedUserId: event.ownerUserId,
      relatedEventId: event._id,
    }))
  );
};

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

  if (event.status === 'published') await notifyFollowersOfNewEvent(event);

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
  const isNewlyPublished = status === 'published' && event.status !== 'published';
  if (status !== undefined) {
    if (isNewlyPublished) event.publishedAt = new Date();
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

  if (isNewlyPublished) await notifyFollowersOfNewEvent(event);

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

const attachSessionsAndPacks = async (events, viewerId) => {
  const eventIds = events.map((e) => e._id);
  const ownerIds = [...new Set(events.map((e) => e.ownerUserId.toString()))];

  const [sessions, packs, owners, ownerProfiles, savedEvents] = await Promise.all([
    Session.find({ eventId: { $in: eventIds } }).sort({ startDatetime: 1 }),
    Pack.find({ eventId: { $in: eventIds } }).sort({ createdAt: 1 }),
    User.find({ _id: { $in: ownerIds } }),
    Profile.find({ userId: { $in: ownerIds } }),
    viewerId
      ? SavedEvent.find({ userId: viewerId, eventId: { $in: eventIds } })
      : Promise.resolve([]),
  ]);

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

  const usernameByOwner = {};
  for (const owner of owners) usernameByOwner[owner.id] = owner.username;

  const displayNameByOwner = {};
  for (const profile of ownerProfiles) displayNameByOwner[profile.userId] = profile.displayName;

  const savedEventIds = new Set(savedEvents.map((s) => s.eventId.toString()));

  return events.map((event) => {
    const eventJson = event.toJSON();
    eventJson.sessions = sessionsByEvent[event.id] || [];
    eventJson.packs = packsByEvent[event.id] || [];
    eventJson.ownerUsername = usernameByOwner[event.ownerUserId.toString()] || '';
    eventJson.ownerDisplayName = displayNameByOwner[event.ownerUserId.toString()] || '';
    eventJson.isSaved = savedEventIds.has(event.id);
    return eventJson;
  });
};

const getMyEvents = async (req, res) => {
  const events = await Event.find({ ownerUserId: req.userId }).sort({ createdAt: -1 });
  const result = await attachSessionsAndPacks(events, req.userId);
  return res.json({ events: result });
};

const getPublicEvents = async (req, res) => {
  const { title, city, style, username, userId, dateFrom, maxPrice } = req.query;

  const filter = { visibility: 'public', status: 'published' };
  if (title) filter.title = { $regex: escapeRegex(title), $options: 'i' };
  if (city) filter.city = { $regex: escapeRegex(city), $options: 'i' };
  if (style) {
    const styleTokens = style
      .split(/[,#\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (styleTokens.length > 0) {
      filter.style = { $in: styleTokens.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')) };
    }
  }
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.json({ events: [] });
    filter.ownerUserId = userId;
  } else if (username) {
    const owner = await User.findOne({
      username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' },
    });
    if (!owner) return res.json({ events: [] });
    filter.ownerUserId = owner._id;
  }

  const events = await Event.find(filter).sort({ createdAt: -1 });
  let result = await attachSessionsAndPacks(events, req.userId);

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (!Number.isNaN(fromDate.getTime())) {
      result = result.filter((e) =>
        e.sessions.some((s) => new Date(s.startDatetime) >= fromDate)
      );
    }
  }

  if (maxPrice !== undefined) {
    const priceLimit = Number(maxPrice);
    if (!Number.isNaN(priceLimit)) {
      result = result.filter((e) => e.packs.some((p) => p.price <= priceLimit));
    }
  }

  return res.json({ events: result });
};

const saveEvent = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

  await SavedEvent.updateOne(
    { userId: req.userId, eventId },
    { $setOnInsert: { userId: req.userId, eventId } },
    { upsert: true }
  );

  return res.status(200).json({ isSaved: true });
};

const unsaveEvent = async (req, res) => {
  const { eventId } = req.params;

  await SavedEvent.deleteOne({ userId: req.userId, eventId });

  return res.status(200).json({ isSaved: false });
};

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  getMyEvents,
  getPublicEvents,
  saveEvent,
  unsaveEvent,
};
