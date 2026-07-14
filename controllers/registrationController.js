const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');

const TARGET_CONFIG = {
  session: {
    Model: Session,
    paramName: 'sessionId',
    label: (target) => `la sesión "${target.name}"`,
  },
  pack: {
    Model: Pack,
    paramName: 'packId',
    label: (target) => `el pack "${target.name}"`,
  },
};

const countConfirmed = (targetType, targetId) =>
  Registration.countDocuments({ targetType, targetId, status: 'confirmed' });

const createHandlers = (targetType) => {
  const { Model, paramName, label } = TARGET_CONFIG[targetType];

  const loadTarget = async (req, res) => {
    const { eventId } = req.params;
    const targetId = req.params[paramName];

    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Evento no encontrado' });
      return null;
    }
    const target = await Model.findOne({ _id: targetId, eventId });
    if (!target) {
      res.status(404).json({ message: 'No encontrado' });
      return null;
    }
    return { event, target };
  };

  const signUp = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { target } = loaded;
    const targetId = target._id;

    if (!target.isUnlimitedCapacity) {
      const confirmedCount = await countConfirmed(targetType, targetId);
      if (confirmedCount >= target.capacity) {
        return res.status(400).json({
          message: 'Está completo. Únete a la lista de espera para que te avisemos.',
        });
      }
    }

    const existing = await Registration.findOne({ userId: req.userId, targetType, targetId });
    if (!existing || existing.status !== 'confirmed') {
      if (existing) {
        existing.status = 'confirmed';
        await existing.save();
      } else {
        await Registration.create({
          userId: req.userId,
          eventId: target.eventId,
          targetType,
          targetId,
          status: 'confirmed',
        });
      }
      await Notification.create({
        userId: req.userId,
        type: 'signed_up',
        message: `Te has inscrito a ${label(target)}`,
        relatedEventId: target.eventId,
      });
    }

    const confirmedCount = await countConfirmed(targetType, targetId);
    return res.status(200).json({ status: 'confirmed', confirmedCount });
  };

  const cancelSignUp = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { target } = loaded;
    const targetId = target._id;

    const deleted = await Registration.findOneAndDelete({
      userId: req.userId,
      targetType,
      targetId,
      status: 'confirmed',
    });

    if (deleted && !target.isUnlimitedCapacity) {
      const confirmedCount = await countConfirmed(targetType, targetId);
      if (confirmedCount < target.capacity) {
        const waitlisted = await Registration.find({ targetType, targetId, status: 'waitlisted' });
        if (waitlisted.length > 0) {
          await Notification.insertMany(
            waitlisted.map((w) => ({
              userId: w.userId,
              type: 'spot_available',
              message: `¡Hay un cupo disponible en ${label(target)}!`,
              relatedEventId: target.eventId,
            }))
          );
          await Registration.deleteMany({
            _id: { $in: waitlisted.map((w) => w._id) },
          });
        }
      }
    }

    const confirmedCount = await countConfirmed(targetType, targetId);
    return res.status(200).json({ status: null, confirmedCount });
  };

  const joinWaitlist = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { target } = loaded;
    const targetId = target._id;

    if (target.isUnlimitedCapacity) {
      return res.status(400).json({ message: 'Este aforo es ilimitado, puedes inscribirte directamente' });
    }
    const confirmedCount = await countConfirmed(targetType, targetId);
    if (confirmedCount < target.capacity) {
      return res.status(400).json({ message: 'Todavía hay cupo disponible, puedes inscribirte directamente' });
    }

    const existing = await Registration.findOne({ userId: req.userId, targetType, targetId });
    if (existing) {
      if (existing.status === 'confirmed') {
        return res.status(200).json({ status: 'confirmed', confirmedCount });
      }
    } else {
      await Registration.create({
        userId: req.userId,
        eventId: target.eventId,
        targetType,
        targetId,
        status: 'waitlisted',
      });
      await Notification.create({
        userId: req.userId,
        type: 'waitlisted',
        message: `Te avisaremos si hay un cupo disponible en ${label(target)}`,
        relatedEventId: target.eventId,
      });
    }

    return res.status(200).json({ status: 'waitlisted', confirmedCount });
  };

  const leaveWaitlist = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { target } = loaded;

    await Registration.deleteOne({
      userId: req.userId,
      targetType,
      targetId: target._id,
      status: 'waitlisted',
    });

    const confirmedCount = await countConfirmed(targetType, target._id);
    return res.status(200).json({ status: null, confirmedCount });
  };

  return { signUp, cancelSignUp, joinWaitlist, leaveWaitlist };
};

const sessionHandlers = createHandlers('session');
const packHandlers = createHandlers('pack');

const notifyRegistrantsOfUpdate = async (targetType, targetId, eventId, targetName) => {
  const registrations = await Registration.find({
    targetType,
    targetId,
    status: { $in: ['confirmed', 'waitlisted'] },
  });
  if (registrations.length === 0) return;

  const message =
    targetType === 'session'
      ? `La sesión "${targetName}" que reservaste ha sido modificada`
      : `El pack "${targetName}" que reservaste ha sido modificado`;

  await Notification.insertMany(
    registrations.map((r) => ({
      userId: r.userId,
      type: 'target_updated',
      message,
      relatedEventId: eventId,
    }))
  );
};

module.exports = {
  signUpForSession: sessionHandlers.signUp,
  cancelSessionSignUp: sessionHandlers.cancelSignUp,
  joinSessionWaitlist: sessionHandlers.joinWaitlist,
  leaveSessionWaitlist: sessionHandlers.leaveWaitlist,
  signUpForPack: packHandlers.signUp,
  cancelPackSignUp: packHandlers.cancelSignUp,
  joinPackWaitlist: packHandlers.joinWaitlist,
  leavePackWaitlist: packHandlers.leaveWaitlist,
  notifyRegistrantsOfUpdate,
};
