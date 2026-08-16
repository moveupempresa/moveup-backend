const Event = require('../models/Event');
const Pack = require('../models/Pack');
const Session = require('../models/Session');
const Registration = require('../models/Registration');
const { notifyRegistrantsOfUpdate } = require('./registrationController');

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
    paymentDetails,
    packType,
    approvalMode,
    maxSelectableSessions,
    sessionIds,
  } = req.body;

  const requestedSessionIds = Array.isArray(sessionIds) ? sessionIds : [];
  if (requestedSessionIds.length > 0) {
    const matchingCount = await Session.countDocuments({
      _id: { $in: requestedSessionIds },
      eventId,
    });
    if (matchingCount !== requestedSessionIds.length) {
      return res.status(400).json({ message: 'Alguna sesión no pertenece a este evento' });
    }
  }

  if (['bizum', 'paypal'].includes(paymentType) && !(paymentDetails || '').trim()) {
    return res.status(400).json({ message: 'Indica dónde deben enviar el pago' });
  }

  let pack;
  try {
    pack = await Pack.create({
      eventId,
      name,
      description: description || null,
      price,
      paymentType,
      paymentDetails: paymentDetails || null,
      packType,
      approvalMode,
      maxSelectableSessions: maxSelectableSessions != null ? Number(maxSelectableSessions) : null,
      sessionIds: requestedSessionIds,
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

const updatePack = async (req, res) => {
  const { eventId, packId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const pack = await Pack.findOne({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });

  const {
    name,
    description,
    price,
    paymentType,
    paymentDetails,
    packType,
    approvalMode,
    maxSelectableSessions,
    sessionIds,
  } = req.body;

  if (Array.isArray(sessionIds)) {
    if (sessionIds.length > 0) {
      const matchingCount = await Session.countDocuments({
        _id: { $in: sessionIds },
        eventId,
      });
      if (matchingCount !== sessionIds.length) {
        return res.status(400).json({ message: 'Alguna sesión no pertenece a este evento' });
      }
    }
    pack.sessionIds = sessionIds;
  }

  if (name !== undefined) pack.name = name;
  if (description !== undefined) pack.description = description || null;
  if (price !== undefined) pack.price = price;
  if (paymentType !== undefined) pack.paymentType = paymentType;
  if (paymentDetails !== undefined) pack.paymentDetails = paymentDetails || null;
  if (packType !== undefined) pack.packType = packType;
  if (approvalMode !== undefined) pack.approvalMode = approvalMode;
  if (maxSelectableSessions !== undefined) {
    pack.maxSelectableSessions = maxSelectableSessions != null ? Number(maxSelectableSessions) : null;
  }

  if (['bizum', 'paypal'].includes(pack.paymentType) && !(pack.paymentDetails || '').trim()) {
    return res.status(400).json({ message: 'Indica dónde deben enviar el pago' });
  }

  try {
    await pack.save();
  } catch (err) {
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map((e) => e.message).join(', ');
      return res.status(400).json({ message });
    }
    throw err;
  }

  await notifyRegistrantsOfUpdate('pack', pack._id, eventId, pack.name);

  return res.status(200).json({ pack: pack.toJSON() });
};

const deletePack = async (req, res) => {
  const { eventId, packId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const pack = await Pack.findOneAndDelete({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });

  await Registration.deleteMany({ targetType: 'pack', targetId: packId });

  return res.status(200).json({ message: 'Pack eliminado' });
};

module.exports = { createPack, getEventPacks, updatePack, deletePack };
