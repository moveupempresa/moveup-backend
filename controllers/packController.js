const Event = require('../models/Event');
const Pack = require('../models/Pack');

const createPack = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const {
    name,
    description,
    price,
    paymentType,
    packType,
    approvalMode,
    maxSelectableSessions,
    isUnlimitedCapacity,
    capacity,
  } = req.body;

  let pack;
  try {
    pack = await Pack.create({
      eventId,
      name,
      description: description || null,
      price,
      paymentType,
      packType,
      approvalMode,
      maxSelectableSessions: maxSelectableSessions != null ? Number(maxSelectableSessions) : null,
      isUnlimitedCapacity: isUnlimitedCapacity === 'true' || isUnlimitedCapacity === true,
      capacity: capacity != null ? Number(capacity) : null,
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  return res.status(201).json({ pack: pack.toJSON() });
};

const getEventPacks = async (req, res) => {
  const { eventId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

  const packs = await Pack.find({ eventId }).sort({ createdAt: 1 });
  return res.status(200).json({ packs: packs.map((p) => p.toJSON()) });
};

module.exports = { createPack, getEventPacks };
