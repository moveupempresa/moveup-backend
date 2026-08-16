const mongoose = require('mongoose');
const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const User = require('../models/User');
const Profile = require('../models/Profile');
const SavedEvent = require('../models/SavedEvent');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const Registration = require('../models/Registration');
const CancelledReservation = require('../models/CancelledReservation');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { geocodeLocation } = require('../utils/geocode');

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

// Notifies everyone with an active registration that the event was
// cancelled/deleted, including a snapshot of the organizer's phone number
// (as of right now) so the attendee can reach out - relevant even if the
// event is about to be deleted or the organizer later changes their number.
const notifyEventCancelled = async (event, userIds, { linkEvent = false } = {}) => {
  if (userIds.length === 0) return;
  const owner = await User.findById(event.ownerUserId);
  await Notification.insertMany(
    userIds.map((userId) => ({
      userId,
      type: 'event_cancelled',
      message: `El evento "${event.title}" ha sido cancelado`,
      relatedEventId: linkEvent ? event._id : null,
      organizerPhone: owner?.phone || null,
    }))
  );
};

const createEvent = async (req, res) => {
  const coverImageFile = req.files?.coverImage?.[0];
  const coverVideoFile = req.files?.coverVideo?.[0];

  const { title, description, city, country, reservationEnabled, status, eventType, customEventType } =
    req.body;
  const style = JSON.parse(req.body.style || '[]');
  // A draft only needs a title - everything else can be filled in later.
  const isDraft = (status || 'draft') === 'draft';

  if (!isDraft && !coverImageFile && !coverVideoFile) {
    return res.status(400).json({ message: 'La portada del evento es requerida' });
  }

  if (!isDraft && eventType === 'other' && !(customEventType || '').trim()) {
    if (coverImageFile) deleteUploadedFile(`/uploads/${coverImageFile.filename}`);
    if (coverVideoFile) deleteUploadedFile(`/uploads/${coverVideoFile.filename}`);
    return res.status(400).json({ message: 'Indica de qué tipo de evento se trata' });
  }

  const coverImageUrl = coverImageFile ? `/uploads/${coverImageFile.filename}` : null;
  const coverVideoUrl = coverVideoFile ? `/uploads/${coverVideoFile.filename}` : null;

  const location = await geocodeLocation(city, country);

  let event;
  try {
    event = await Event.create({
      ownerUserId: req.userId,
      title,
      description: description || '',
      style,
      eventType: eventType || undefined,
      customEventType: eventType === 'other' ? (customEventType || '').trim() : null,
      city: city || '',
      country: country || '',
      location,
      reservationEnabled: reservationEnabled === 'true' || reservationEnabled === true,
      coverImageUrl,
      coverVideoUrl,
      status: status || 'draft',
      publishedAt: status === 'published' ? new Date() : null,
    });
  } catch (err) {
    if (coverImageUrl) deleteUploadedFile(coverImageUrl);
    if (coverVideoUrl) deleteUploadedFile(coverVideoUrl);
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
  const coverImageFile = req.files?.coverImage?.[0];
  const coverVideoFile = req.files?.coverVideo?.[0];

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    if (coverImageFile) deleteUploadedFile(`/uploads/${coverImageFile.filename}`);
    if (coverVideoFile) deleteUploadedFile(`/uploads/${coverVideoFile.filename}`);
    return res.status(403).json({ message: 'No autorizado' });
  }

  const {
    title,
    description,
    city,
    country,
    eventType,
    customEventType,
    locationType,
    visibility,
    reservationEnabled,
    status,
    removeCoverImage,
    removeCoverVideo,
  } = req.body;

  // A draft only needs a title - everything else can be filled in later.
  const isDraft = (status !== undefined ? status : event.status) === 'draft';

  if (!isDraft && eventType === 'other' && !(customEventType || event.customEventType || '').trim()) {
    if (coverImageFile) deleteUploadedFile(`/uploads/${coverImageFile.filename}`);
    if (coverVideoFile) deleteUploadedFile(`/uploads/${coverVideoFile.filename}`);
    return res.status(400).json({ message: 'Indica de qué tipo de evento se trata' });
  }

  const locationChanged =
    (city !== undefined && city !== event.city) || (country !== undefined && country !== event.country);

  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (city !== undefined) event.city = city;
  if (country !== undefined) event.country = country;
  if (locationChanged) event.location = await geocodeLocation(event.city, event.country);
  if (eventType !== undefined) {
    event.eventType = eventType;
    event.customEventType = eventType === 'other' ? (customEventType || event.customEventType) : null;
  } else if (customEventType !== undefined && event.eventType === 'other') {
    event.customEventType = customEventType;
  }
  if (locationType !== undefined) event.locationType = locationType;
  if (visibility !== undefined) event.visibility = visibility;
  if (reservationEnabled !== undefined) {
    event.reservationEnabled = reservationEnabled === 'true' || reservationEnabled === true;
  }
  if (req.body.style !== undefined) event.style = JSON.parse(req.body.style || '[]');
  const isNewlyPublished = status === 'published' && event.status !== 'published';
  const isNewlyCancelled = status === 'cancelled' && event.status !== 'cancelled';
  if (status !== undefined) {
    if (isNewlyPublished) event.publishedAt = new Date();
    event.status = status;
  }

  const previousCoverImageUrl = event.coverImageUrl;
  const previousCoverVideoUrl = event.coverVideoUrl;
  if (coverImageFile) {
    event.coverImageUrl = `/uploads/${coverImageFile.filename}`;
  } else if (removeCoverImage === 'true' || removeCoverImage === true) {
    event.coverImageUrl = null;
  }
  if (coverVideoFile) {
    event.coverVideoUrl = `/uploads/${coverVideoFile.filename}`;
  } else if (removeCoverVideo === 'true' || removeCoverVideo === true) {
    event.coverVideoUrl = null;
  }

  try {
    await event.save();
  } catch (err) {
    if (coverImageFile) deleteUploadedFile(`/uploads/${coverImageFile.filename}`);
    if (coverVideoFile) deleteUploadedFile(`/uploads/${coverVideoFile.filename}`);
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  if (coverImageFile && previousCoverImageUrl) deleteUploadedFile(previousCoverImageUrl);
  if (coverVideoFile && previousCoverVideoUrl) deleteUploadedFile(previousCoverVideoUrl);
  if (removeCoverImage === 'true' && previousCoverImageUrl) deleteUploadedFile(previousCoverImageUrl);
  if (removeCoverVideo === 'true' && previousCoverVideoUrl) deleteUploadedFile(previousCoverVideoUrl);

  if (isNewlyPublished) await notifyFollowersOfNewEvent(event);
  if (isNewlyCancelled) {
    const affectedRegistrations = await Registration.find({
      eventId: event._id,
      status: { $in: ['confirmed', 'pending', 'awaiting_payment', 'waitlisted'] },
    });
    const affectedUserIds = [...new Set(affectedRegistrations.map((r) => r.userId.toString()))];
    await notifyEventCancelled(event, affectedUserIds, { linkEvent: true });
  }

  return res.status(200).json({ event: event.toJSON() });
};

const deleteEvent = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const affectedRegistrations = await Registration.find({
    eventId,
    status: { $in: ['confirmed', 'pending', 'awaiting_payment', 'waitlisted'] },
  });
  const affectedUserIds = [...new Set(affectedRegistrations.map((r) => r.userId.toString()))];

  const [sessions, packs] = await Promise.all([
    Session.find({ eventId }),
    Pack.find({ eventId }),
  ]);
  const sessionById = {};
  for (const s of sessions) sessionById[s.id] = s;
  const packById = {};
  for (const p of packs) packById[p.id] = p;

  // A pack has no date of its own - use the earliest of the sessions it covers.
  const packDate = (pack) => {
    const dates = pack.sessionIds
      .map((id) => sessionById[id.toString()]?.startDatetime)
      .filter(Boolean);
    return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  };

  const cancelledLogs = affectedRegistrations
    .map((r) => {
      const targetId = r.targetId.toString();
      const isSession = r.targetType === 'session';
      const target = isSession ? sessionById[targetId] : packById[targetId];
      if (!target) return null;
      return {
        userId: r.userId,
        eventId: event._id,
        eventTitle: event.title,
        eventCoverMediaUrl: event.coverImageUrl || event.coverVideoUrl,
        targetType: r.targetType,
        targetName: target.name,
        sessionDate: isSession ? target.startDatetime : packDate(target),
        cancelledBy: 'event_deleted',
      };
    })
    .filter(Boolean);

  await Session.deleteMany({ eventId });
  await Pack.deleteMany({ eventId });
  await Registration.deleteMany({ eventId });
  await event.deleteOne();
  deleteUploadedFile(event.coverImageUrl);
  deleteUploadedFile(event.coverVideoUrl);

  if (cancelledLogs.length > 0) await CancelledReservation.insertMany(cancelledLogs);

  await notifyEventCancelled(event, affectedUserIds);

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

  const sessionIds = sessions.map((s) => s._id);
  const packIds = packs.map((p) => p._id);
  const registrations = await Registration.find({
    targetId: { $in: [...sessionIds, ...packIds] },
  });

  const packById = {};
  for (const pack of packs) packById[pack._id.toString()] = pack;

  const confirmedCountByTarget = {};
  const pendingCountByTarget = {};
  const viewerStatusByTarget = {};
  const viewerSelectedSessionsByTarget = {};
  const viewerHasPaidByTarget = {};
  for (const reg of registrations) {
    const key = reg.targetId.toString();
    // Only packs ever reach 'pending' (manual-approval sessions don't
    // exist), so this is effectively a pack-only count - lets the organizer
    // spot packs with requests awaiting their review.
    if (reg.status === 'pending') {
      pendingCountByTarget[key] = (pendingCountByTarget[key] || 0) + 1;
    }
    if (reg.status === 'confirmed') {
      confirmedCountByTarget[key] = (confirmedCountByTarget[key] || 0) + 1;
      // A confirmed pack registration also occupies a spot in whichever
      // sessions it covers (all of them for a fixed pack, the chosen ones
      // for a customizable pack), so those sessions' counts must reflect it.
      if (reg.targetType === 'pack') {
        const pack = packById[key];
        if (pack) {
          const coveredSessionIds = pack.packType === 'fixed'
            ? pack.sessionIds.map((id) => id.toString())
            : (reg.selectedSessionIds || []).map((id) => id.toString());
          for (const sid of coveredSessionIds) {
            confirmedCountByTarget[sid] = (confirmedCountByTarget[sid] || 0) + 1;
          }
        }
      }
    }
    if (viewerId && reg.userId.toString() === viewerId) {
      viewerStatusByTarget[key] = reg.status;
      viewerSelectedSessionsByTarget[key] = (reg.selectedSessionIds || []).map((id) => id.toString());
      viewerHasPaidByTarget[key] = reg.hasPaid;
    }
  }

  const attachRegistrationInfo = (json) => {
    json.confirmedCount = confirmedCountByTarget[json.id] || 0;
    json.pendingRequestsCount = pendingCountByTarget[json.id] || 0;
    json.isSignedUp = viewerStatusByTarget[json.id] === 'confirmed';
    json.isWaitlisted = viewerStatusByTarget[json.id] === 'waitlisted';
    json.isPending = viewerStatusByTarget[json.id] === 'pending';
    json.isAwaitingPayment = viewerStatusByTarget[json.id] === 'awaiting_payment';
    json.mySelectedSessionIds = viewerSelectedSessionsByTarget[json.id] || [];
    json.myHasPaid = viewerHasPaidByTarget[json.id] || false;
    return json;
  };

  const sessionsByEvent = {};
  for (const session of sessions) {
    const key = session.eventId.toString();
    if (!sessionsByEvent[key]) sessionsByEvent[key] = [];
    sessionsByEvent[key].push(attachRegistrationInfo(session.toJSON()));
  }

  const packsByEvent = {};
  for (const pack of packs) {
    const key = pack.eventId.toString();
    if (!packsByEvent[key]) packsByEvent[key] = [];
    packsByEvent[key].push(attachRegistrationInfo(pack.toJSON()));
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
  const { title, city, style, username, userId, dateFrom, dateTo, maxPrice, eventType, savedOnly } =
    req.query;

  const filter = { visibility: 'public', status: 'published' };
  if (savedOnly === 'true') {
    const saved = await SavedEvent.find({ userId: req.userId });
    if (saved.length === 0) return res.json({ events: [] });
    filter._id = { $in: saved.map((s) => s.eventId) };
  }
  if (title) filter.title = { $regex: escapeRegex(title), $options: 'i' };
  if (city) filter.city = { $regex: escapeRegex(city), $options: 'i' };
  if (eventType) filter.eventType = eventType;
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
    const owners = await User.find({
      username: { $regex: escapeRegex(username), $options: 'i' },
    });
    if (owners.length === 0) return res.json({ events: [] });
    filter.ownerUserId = { $in: owners.map((o) => o._id) };
  }

  const events = await Event.find(filter).sort({ createdAt: -1 });
  let result = await attachSessionsAndPacks(events, req.userId);

  if (dateFrom || dateTo) {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;
    result = result.filter((e) =>
      e.sessions.some((s) => {
        const start = new Date(s.startDatetime);
        if (fromDate && !Number.isNaN(fromDate.getTime()) && start < fromDate) return false;
        if (toDate && !Number.isNaN(toDate.getTime()) && start > toDate) return false;
        return true;
      })
    );
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
  attachSessionsAndPacks,
};
