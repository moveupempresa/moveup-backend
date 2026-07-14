const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const Registration = require('../models/Registration');
const { notifyRegistrantsOfUpdate } = require('./registrationController');

const createSession = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const { name, startDatetime, endDatetime, address, accessUrl, capacity, isUnlimitedCapacity } = req.body;

  const session = await Session.create({
    eventId,
    name,
    startDatetime,
    endDatetime,
    address: address || null,
    accessUrl: accessUrl || null,
    capacity: capacity != null ? Number(capacity) : null,
    isUnlimitedCapacity: isUnlimitedCapacity === 'true' || isUnlimitedCapacity === true,
  });

  return res.status(201).json({ session: session.toJSON() });
};

const getEventSessions = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

  const sessions = await Session.find({ eventId }).sort({ startDatetime: 1 });
  return res.status(200).json({ sessions: sessions.map((s) => s.toJSON()) });
};

const updateSession = async (req, res) => {
  const { eventId, sessionId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const session = await Session.findOne({ _id: sessionId, eventId });
  if (!session) return res.status(404).json({ message: 'Sesión no encontrada' });

  const { name, startDatetime, endDatetime, address, accessUrl, capacity, isUnlimitedCapacity } = req.body;

  if (name !== undefined) session.name = name;
  if (startDatetime !== undefined) session.startDatetime = startDatetime;
  if (endDatetime !== undefined) session.endDatetime = endDatetime;
  if (address !== undefined) session.address = address || null;
  if (accessUrl !== undefined) session.accessUrl = accessUrl || null;
  if (isUnlimitedCapacity !== undefined) {
    session.isUnlimitedCapacity = isUnlimitedCapacity === 'true' || isUnlimitedCapacity === true;
  }
  if (capacity !== undefined) session.capacity = capacity != null ? Number(capacity) : null;
  if (session.isUnlimitedCapacity) session.capacity = null;

  try {
    await session.save();
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  await notifyRegistrantsOfUpdate('session', session._id, eventId, session.name);

  return res.status(200).json({ session: session.toJSON() });
};

const deleteSession = async (req, res) => {
  const { eventId, sessionId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const session = await Session.findOneAndDelete({ _id: sessionId, eventId });
  if (!session) return res.status(404).json({ message: 'Sesión no encontrada' });

  await Pack.updateMany({ eventId }, { $pull: { sessionIds: sessionId } });
  await Registration.deleteMany({ targetType: 'session', targetId: sessionId });

  return res.status(200).json({ message: 'Sesión eliminada' });
};

module.exports = { createSession, getEventSessions, updateSession, deleteSession };
