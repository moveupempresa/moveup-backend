const Event = require('../models/Event');
const Session = require('../models/Session');

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

module.exports = { createSession, getEventSessions };
