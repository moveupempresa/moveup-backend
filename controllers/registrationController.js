const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Profile = require('../models/Profile');

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

  const resolveSelectedSessions = (req, target) => {
    if (targetType !== 'pack' || target.packType !== 'customizable') {
      return { selectedSessionIds: undefined };
    }
    const raw = Array.isArray(req.body?.selectedSessionIds) ? req.body.selectedSessionIds : [];
    const unique = [...new Set(raw.map(String))];
    if (unique.length === 0) {
      return { error: 'Selecciona al menos una sesión para tu pack' };
    }
    if (target.maxSelectableSessions && unique.length > target.maxSelectableSessions) {
      return { error: `Puedes seleccionar hasta ${target.maxSelectableSessions} sesiones` };
    }
    const allowed = new Set(target.sessionIds.map((id) => id.toString()));
    if (!unique.every((id) => allowed.has(id))) {
      return { error: 'Sesión no válida para este pack' };
    }
    return { selectedSessionIds: unique };
  };

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
    const { event, target } = loaded;
    const targetId = target._id;
    const requiresApproval = targetType === 'pack' && target.approvalMode === 'manual';

    if (!target.isUnlimitedCapacity) {
      const confirmedCount = await countConfirmed(targetType, targetId);
      if (confirmedCount >= target.capacity) {
        return res.status(400).json({
          message: 'Está completo. Únete a la lista de espera para que te avisemos.',
        });
      }
    }

    const existing = await Registration.findOne({ userId: req.userId, targetType, targetId });

    if (requiresApproval) {
      if (existing && (existing.status === 'confirmed' || existing.status === 'pending')) {
        const confirmedCount = await countConfirmed(targetType, targetId);
        return res.status(200).json({ status: existing.status, confirmedCount });
      }

      const { selectedSessionIds, error: selectionError } = resolveSelectedSessions(req, target);
      if (selectionError) {
        return res.status(400).json({ message: selectionError });
      }

      if (existing) {
        existing.status = 'pending';
        if (selectedSessionIds) existing.selectedSessionIds = selectedSessionIds;
        await existing.save();
      } else {
        await Registration.create({
          userId: req.userId,
          eventId: target.eventId,
          targetType,
          targetId,
          status: 'pending',
          ...(selectedSessionIds ? { selectedSessionIds } : {}),
        });
      }

      const requester = await User.findById(req.userId);
      await Notification.create({
        userId: event.ownerUserId,
        type: 'signup_request',
        message: `${requester.username} quiere unirse a ${label(target)}`,
        relatedUserId: req.userId,
        relatedEventId: target.eventId,
        relatedTargetType: targetType,
        relatedTargetId: targetId,
      });

      const confirmedCount = await countConfirmed(targetType, targetId);
      return res.status(200).json({ status: 'pending', confirmedCount });
    }

    if (!existing || existing.status !== 'confirmed') {
      const { selectedSessionIds, error: selectionError } = resolveSelectedSessions(req, target);
      if (selectionError) {
        return res.status(400).json({ message: selectionError });
      }

      if (existing) {
        existing.status = 'confirmed';
        if (selectedSessionIds) existing.selectedSessionIds = selectedSessionIds;
        await existing.save();
      } else {
        await Registration.create({
          userId: req.userId,
          eventId: target.eventId,
          targetType,
          targetId,
          status: 'confirmed',
          ...(selectedSessionIds ? { selectedSessionIds } : {}),
        });
      }
      await Notification.create({
        userId: req.userId,
        type: 'signed_up',
        message: `Te has inscrito a ${label(target)}`,
        relatedEventId: target.eventId,
      });
      if (event.ownerUserId.toString() !== req.userId) {
        const requester = await User.findById(req.userId);
        await Notification.create({
          userId: event.ownerUserId,
          type: 'new_registration',
          message: `${requester.username} se ha inscrito a ${label(target)}`,
          relatedUserId: req.userId,
          relatedEventId: target.eventId,
          relatedTargetType: targetType,
          relatedTargetId: targetId,
        });
      }
    }

    const confirmedCount = await countConfirmed(targetType, targetId);
    return res.status(200).json({ status: 'confirmed', confirmedCount });
  };

  const freeUpSpot = async (target) => {
    if (target.isUnlimitedCapacity) return;
    const confirmedCount = await countConfirmed(targetType, target._id);
    if (confirmedCount >= target.capacity) return;

    const waitlisted = await Registration.find({
      targetType,
      targetId: target._id,
      status: 'waitlisted',
    });
    if (waitlisted.length === 0) return;

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

    if (!deleted) {
      await Registration.deleteOne({ userId: req.userId, targetType, targetId, status: 'pending' });
    }

    if (deleted) await freeUpSpot(target);

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

  const getRegistrants = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { event, target } = loaded;

    if (event.ownerUserId.toString() !== req.userId) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const directRegistrations = await Registration.find({ targetType, targetId: target._id });

    // A session's attendees also include people who joined it through a pack:
    // everyone in a fixed pack that includes this session, or whoever picked
    // this session in a customizable pack.
    let packRegistrations = [];
    const packNameByRegistrationId = {};
    if (targetType === 'session') {
      const packs = await Pack.find({ eventId: event._id });
      const relevantPacks = packs.filter((p) =>
        p.sessionIds.some((id) => id.toString() === target._id.toString())
      );
      if (relevantPacks.length > 0) {
        const packById = {};
        relevantPacks.forEach((p) => {
          packById[p._id.toString()] = p;
        });
        const candidateRegs = await Registration.find({
          targetType: 'pack',
          targetId: { $in: relevantPacks.map((p) => p._id) },
        });
        packRegistrations = candidateRegs.filter((r) => {
          const pack = packById[r.targetId.toString()];
          return pack.packType === 'fixed' ||
            (r.selectedSessionIds || []).some((id) => id.toString() === target._id.toString());
        });
        packRegistrations.forEach((r) => {
          packNameByRegistrationId[r._id.toString()] = packById[r.targetId.toString()].name;
        });
      }
    }

    const allRegistrations = [...directRegistrations, ...packRegistrations].sort(
      (a, b) => a.createdAt - b.createdAt
    );

    const userIds = allRegistrations.map((r) => r.userId);
    const [users, profiles] = await Promise.all([
      User.find({ _id: { $in: userIds } }),
      Profile.find({ userId: { $in: userIds } }),
    ]);
    const usernameById = {};
    users.forEach((u) => {
      usernameById[u._id.toString()] = u.username;
    });
    const profileByUser = {};
    profiles.forEach((p) => {
      profileByUser[p.userId.toString()] = p;
    });

    const registrants = allRegistrations.map((r) => {
      const uid = r.userId.toString();
      const profile = profileByUser[uid];
      return {
        userId: uid,
        username: usernameById[uid] || '',
        displayName: profile?.displayName || '',
        profileImage: profile?.profileImage || null,
        status: r.status,
        selectedSessionIds: (r.selectedSessionIds || []).map((id) => id.toString()),
        hasPaid: r.hasPaid,
        viaPack: packNameByRegistrationId[r._id.toString()] || null,
        createdAt: r.createdAt,
      };
    });

    return res.status(200).json({ registrants });
  };

  const revokeRegistration = async (req, res) => {
    const loaded = await loadTarget(req, res);
    if (!loaded) return;
    const { event, target } = loaded;

    if (event.ownerUserId.toString() !== req.userId) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const { userId } = req.params;
    const deleted = await Registration.findOneAndDelete({
      userId,
      targetType,
      targetId: target._id,
      status: 'confirmed',
    });
    if (!deleted) return res.status(404).json({ message: 'Inscripción no encontrada' });

    await freeUpSpot(target);

    await Notification.create({
      userId,
      type: 'registration_revoked',
      message: `Tu inscripción a ${label(target)} ha sido cancelada por el organizador`,
      relatedEventId: target.eventId,
      relatedTargetType: targetType,
      relatedTargetId: target._id,
    });

    const confirmedCount = await countConfirmed(targetType, target._id);
    return res.status(200).json({ status: null, confirmedCount });
  };

  return { signUp, cancelSignUp, joinWaitlist, leaveWaitlist, getRegistrants, revokeRegistration };
};

const sessionHandlers = createHandlers('session');
const packHandlers = createHandlers('pack');

const approvePackRequest = async (req, res) => {
  const { eventId, packId, userId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const pack = await Pack.findOne({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });

  const registration = await Registration.findOne({ userId, targetType: 'pack', targetId: packId, status: 'pending' });
  if (!registration) return res.status(404).json({ message: 'Solicitud no encontrada' });

  if (!pack.isUnlimitedCapacity) {
    const confirmedCount = await countConfirmed('pack', packId);
    if (confirmedCount >= pack.capacity) {
      return res.status(400).json({ message: 'Está completo, no se pueden aprobar más solicitudes' });
    }
  }

  registration.status = 'confirmed';
  await registration.save();

  await Notification.create({
    userId,
    type: 'signup_approved',
    message: `Tu inscripción a ${TARGET_CONFIG.pack.label(pack)} ha sido aprobada`,
    relatedEventId: eventId,
    relatedTargetType: 'pack',
    relatedTargetId: packId,
  });

  const confirmedCount = await countConfirmed('pack', packId);
  return res.status(200).json({ status: 'confirmed', confirmedCount });
};

const rejectPackRequest = async (req, res) => {
  const { eventId, packId, userId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const pack = await Pack.findOne({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });

  const registration = await Registration.findOneAndDelete({
    userId,
    targetType: 'pack',
    targetId: packId,
    status: 'pending',
  });
  if (!registration) return res.status(404).json({ message: 'Solicitud no encontrada' });

  await Notification.create({
    userId,
    type: 'signup_rejected',
    message: `Tu inscripción a ${TARGET_CONFIG.pack.label(pack)} ha sido rechazada`,
    relatedEventId: eventId,
    relatedTargetType: 'pack',
    relatedTargetId: packId,
  });

  const confirmedCount = await countConfirmed('pack', packId);
  return res.status(200).json({ status: null, confirmedCount });
};

const setPackPaymentStatus = async (req, res) => {
  const { eventId, packId, userId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const pack = await Pack.findOne({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });
  if (pack.paymentType !== 'offline') {
    return res.status(400).json({
      message: 'El estado de pago de este pack solo se puede marcar manualmente si el pago es en efectivo',
    });
  }

  const registration = await Registration.findOne({ userId, targetType: 'pack', targetId: packId });
  if (!registration) return res.status(404).json({ message: 'Inscripción no encontrada' });

  registration.hasPaid = Boolean(req.body?.hasPaid);
  await registration.save();

  return res.status(200).json({ hasPaid: registration.hasPaid });
};

const payForPack = async (req, res) => {
  const { eventId, packId } = req.params;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

  const pack = await Pack.findOne({ _id: packId, eventId });
  if (!pack) return res.status(404).json({ message: 'Pack no encontrado' });

  const registration = await Registration.findOne({
    userId: req.userId,
    targetType: 'pack',
    targetId: packId,
  });
  if (!registration) return res.status(404).json({ message: 'No estás inscrito en este pack' });

  registration.hasPaid = true;
  await registration.save();

  const payer = await User.findById(req.userId);
  await Notification.create({
    userId: event.ownerUserId,
    type: 'pack_paid',
    message: `${payer.username} ha pagado ${TARGET_CONFIG.pack.label(pack)}`,
    relatedUserId: req.userId,
    relatedEventId: eventId,
    relatedTargetType: 'pack',
    relatedTargetId: packId,
  });

  return res.status(200).json({ hasPaid: true });
};

const notifyRegistrantsOfUpdate = async (targetType, targetId, eventId, targetName) => {
  const registrations = await Registration.find({
    targetType,
    targetId,
    status: { $in: ['confirmed', 'waitlisted', 'pending'] },
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
  getSessionRegistrants: sessionHandlers.getRegistrants,
  revokeSessionRegistration: sessionHandlers.revokeRegistration,
  signUpForPack: packHandlers.signUp,
  cancelPackSignUp: packHandlers.cancelSignUp,
  joinPackWaitlist: packHandlers.joinWaitlist,
  leavePackWaitlist: packHandlers.leaveWaitlist,
  getPackRegistrants: packHandlers.getRegistrants,
  revokePackRegistration: packHandlers.revokeRegistration,
  approvePackRequest,
  rejectPackRequest,
  setPackPaymentStatus,
  payForPack,
  notifyRegistrantsOfUpdate,
};
