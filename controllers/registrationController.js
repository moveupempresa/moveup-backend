const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Profile = require('../models/Profile');
const SavedEvent = require('../models/SavedEvent');
const CancelledReservation = require('../models/CancelledReservation');
const { attachSessionsAndPacks } = require('./eventController');

// online/bizum/paypal all require the attendee to actively "pay" (confirm
// via the app's payment flow) before their spot is confirmed. Efectivo is
// the only method the organizer confirms manually, since it's the only one
// paid in person rather than through some app/transfer the attendee acts on.
const SELF_PAY_TYPES = ['online', 'bizum', 'paypal'];

// Notifies everyone who bookmarked this event (Descubrimiento > Eventos
// guardados), excluding anyone already notified through another channel.
const notifySavedEventWatchers = async (eventId, type, message, excludeUserIds = []) => {
  const excluded = new Set(excludeUserIds.map(String));
  const saves = await SavedEvent.find({ eventId });
  const recipients = saves.filter((s) => !excluded.has(s.userId.toString()));
  if (recipients.length === 0) return;

  await Notification.insertMany(
    recipients.map((s) => ({
      userId: s.userId,
      type,
      message,
      relatedEventId: eventId,
    }))
  );
};

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

// A session's attendees also include people who joined it through a pack:
// everyone in a fixed pack that includes this session, or whoever picked
// this session in a customizable pack.
const findPackRegistrationsForSession = async (eventId, sessionId) => {
  const packs = await Pack.find({ eventId });
  const relevantPacks = packs.filter((p) =>
    p.sessionIds.some((id) => id.toString() === sessionId.toString())
  );
  if (relevantPacks.length === 0) return { registrations: [], nameByRegistrationId: {} };

  const packById = {};
  relevantPacks.forEach((p) => {
    packById[p._id.toString()] = p;
  });
  const candidateRegs = await Registration.find({
    targetType: 'pack',
    targetId: { $in: relevantPacks.map((p) => p._id) },
  });
  const registrations = candidateRegs.filter((r) => {
    const pack = packById[r.targetId.toString()];
    return pack.packType === 'fixed' ||
      (r.selectedSessionIds || []).some((id) => id.toString() === sessionId.toString());
  });
  const nameByRegistrationId = {};
  registrations.forEach((r) => {
    nameByRegistrationId[r._id.toString()] = packById[r.targetId.toString()].name;
  });
  return { registrations, nameByRegistrationId };
};

const createHandlers = (targetType) => {
  const { Model, paramName, label } = TARGET_CONFIG[targetType];

  // Packs have no capacity of their own - only the sessions they cover do.
  const isUnlimited = (target) => targetType === 'pack' || target.isUnlimitedCapacity;

  // A pack has no date of its own - use the earliest of the sessions it covers.
  const resolveDisplayDate = async (target) => {
    if (targetType === 'session') return target.startDatetime;
    const firstSession = await Session.findOne({ _id: { $in: target.sessionIds } }).sort({
      startDatetime: 1,
    });
    return firstSession ? firstSession.startDatetime : null;
  };

  const logCancellation = async ({ userId, event, target, cancelledBy }) => {
    await CancelledReservation.create({
      userId,
      eventId: event._id,
      eventTitle: event.title,
      eventCoverMediaUrl: event.coverImageUrl || event.coverVideoUrl,
      targetType,
      targetName: target.name,
      sessionDate: await resolveDisplayDate(target),
      cancelledBy,
    });
  };

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
    const requiresPayment = targetType === 'pack' && SELF_PAY_TYPES.includes(target.paymentType);

    if (!isUnlimited(target)) {
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

    if (requiresPayment) {
      if (existing && (existing.status === 'confirmed' || existing.status === 'awaiting_payment')) {
        const confirmedCount = await countConfirmed(targetType, targetId);
        return res.status(200).json({ status: existing.status, confirmedCount });
      }

      const { selectedSessionIds, error: selectionError } = resolveSelectedSessions(req, target);
      if (selectionError) {
        return res.status(400).json({ message: selectionError });
      }

      if (existing) {
        existing.status = 'awaiting_payment';
        if (selectedSessionIds) existing.selectedSessionIds = selectedSessionIds;
        await existing.save();
      } else {
        await Registration.create({
          userId: req.userId,
          eventId: target.eventId,
          targetType,
          targetId,
          status: 'awaiting_payment',
          ...(selectedSessionIds ? { selectedSessionIds } : {}),
        });
      }
      await Notification.create({
        userId: req.userId,
        type: 'payment_required',
        message: `Completa el pago para reservar tu plaza en ${label(target)}`,
        relatedEventId: target.eventId,
        relatedTargetType: targetType,
        relatedTargetId: targetId,
      });

      const confirmedCount = await countConfirmed(targetType, targetId);
      return res.status(200).json({ status: 'awaiting_payment', confirmedCount });
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

      if (!isUnlimited(target)) {
        const updatedCount = await countConfirmed(targetType, targetId);
        const remaining = target.capacity - updatedCount;
        if (remaining === 0) {
          await Notification.create({
            userId: event.ownerUserId,
            type: 'capacity_full',
            message: `El aforo de ${label(target)} está completo`,
            relatedEventId: target.eventId,
            relatedTargetType: targetType,
            relatedTargetId: targetId,
          });
          await notifySavedEventWatchers(
            target.eventId,
            'saved_event_capacity_full',
            `El aforo de ${label(target)} está completo`
          );
        } else if (remaining === 5) {
          await notifySavedEventWatchers(
            target.eventId,
            'saved_event_capacity_low',
            `Quedan 5 plazas en ${label(target)}`
          );
        }
      }
    }

    const confirmedCount = await countConfirmed(targetType, targetId);
    return res.status(200).json({ status: 'confirmed', confirmedCount });
  };

  const freeUpSpot = async (target, ownerUserId) => {
    if (isUnlimited(target)) return;
    const confirmedCount = await countConfirmed(targetType, target._id);
    if (confirmedCount >= target.capacity) return;

    if (confirmedCount === target.capacity - 1) {
      await Notification.create({
        userId: ownerUserId,
        type: 'spot_freed',
        message: `Se ha liberado una plaza en ${label(target)}`,
        relatedEventId: target.eventId,
        relatedTargetType: targetType,
        relatedTargetId: target._id,
      });
      await notifySavedEventWatchers(
        target.eventId,
        'saved_event_spot_freed',
        `Se ha liberado una plaza en ${label(target)}`
      );
    }

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
    const { event, target } = loaded;
    const targetId = target._id;

    const deleted = await Registration.findOneAndDelete({
      userId: req.userId,
      targetType,
      targetId,
      status: 'confirmed',
    });

    if (!deleted) {
      await Registration.deleteOne({
        userId: req.userId,
        targetType,
        targetId,
        status: { $in: ['pending', 'awaiting_payment'] },
      });
    }

    if (deleted) {
      await freeUpSpot(target, event.ownerUserId);
      await logCancellation({ userId: req.userId, event, target, cancelledBy: 'self' });

      await Notification.create({
        userId: req.userId,
        type: 'self_cancel_confirmed',
        message: `Has cancelado tu reserva en ${label(target)}`,
        relatedEventId: target.eventId,
      });
      if (event.ownerUserId.toString() !== req.userId) {
        const canceller = await User.findById(req.userId);
        await Notification.create({
          userId: event.ownerUserId,
          type: 'registrant_cancelled',
          message: `${canceller.username} ha cancelado su reserva en ${label(target)}`,
          relatedUserId: req.userId,
          relatedEventId: target.eventId,
          relatedTargetType: targetType,
          relatedTargetId: targetId,
        });
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

    if (isUnlimited(target)) {
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

    let packRegistrations = [];
    let packNameByRegistrationId = {};
    if (targetType === 'session') {
      ({ registrations: packRegistrations, nameByRegistrationId: packNameByRegistrationId } =
        await findPackRegistrationsForSession(event._id, target._id));
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
        attended: targetType === 'session' &&
          (r.attendedSessionIds || []).some((id) => id.toString() === target._id.toString()),
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

    await freeUpSpot(target, event.ownerUserId);
    await logCancellation({ userId, event, target, cancelledBy: 'organizer' });

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

  const requiresPayment = SELF_PAY_TYPES.includes(pack.paymentType);
  registration.status = requiresPayment ? 'awaiting_payment' : 'confirmed';
  await registration.save();

  await Notification.create({
    userId,
    type: requiresPayment ? 'payment_required' : 'signup_approved',
    message: requiresPayment
      ? `Tu solicitud para ${TARGET_CONFIG.pack.label(pack)} fue aprobada. Completa el pago para reservar tu plaza`
      : `Tu inscripción a ${TARGET_CONFIG.pack.label(pack)} ha sido aprobada`,
    relatedEventId: eventId,
    relatedTargetType: 'pack',
    relatedTargetId: packId,
  });

  const confirmedCount = await countConfirmed('pack', packId);
  return res.status(200).json({ status: registration.status, confirmedCount });
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
  if (registration.status !== 'awaiting_payment') {
    return res.status(400).json({ message: 'No tienes un pago pendiente para este pack' });
  }

  registration.status = 'confirmed';
  registration.hasPaid = true;
  await registration.save();

  const payer = await User.findById(req.userId);
  await Notification.create({
    userId: req.userId,
    type: 'signed_up',
    message: `Te has inscrito a ${TARGET_CONFIG.pack.label(pack)}`,
    relatedEventId: eventId,
  });
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

const markSessionAttendance = async (req, res) => {
  const { eventId, sessionId, userId } = req.params;
  const attended = Boolean(req.body?.attended);

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
  if (event.ownerUserId.toString() !== req.userId) {
    return res.status(403).json({ message: 'No autorizado' });
  }

  const session = await Session.findOne({ _id: sessionId, eventId });
  if (!session) return res.status(404).json({ message: 'Sesión no encontrada' });

  let registration = await Registration.findOne({ userId, targetType: 'session', targetId: sessionId });
  if (!registration) {
    const { registrations } = await findPackRegistrationsForSession(eventId, sessionId);
    registration = registrations.find((r) => r.userId.toString() === userId) || null;
  }
  if (!registration) return res.status(404).json({ message: 'Inscripción no encontrada' });

  const alreadyAttended = registration.attendedSessionIds
    .map((id) => id.toString())
    .includes(sessionId.toString());

  if (attended && !alreadyAttended) {
    registration.attendedSessionIds.push(sessionId);
    await registration.save();
  } else if (!attended && alreadyAttended) {
    registration.attendedSessionIds = registration.attendedSessionIds.filter(
      (id) => id.toString() !== sessionId.toString()
    );
    await registration.save();
  }

  return res.status(200).json({ attended });
};

const notifyRegistrantsOfUpdate = async (targetType, targetId, eventId, targetName) => {
  const registrations = await Registration.find({
    targetType,
    targetId,
    status: { $in: ['confirmed', 'waitlisted', 'pending', 'awaiting_payment'] },
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

// Every session/pack the user has ever signed up for (any status), each
// paired with the full enriched event it belongs to so the frontend can
// navigate straight into EventDetailScreen without a second fetch.
// Every pending pack signup request across every event the user owns, so a
// Pro organizer can review them in one place instead of pack-by-pack.
const getMyPendingRequests = async (req, res) => {
  const myEvents = await Event.find({ ownerUserId: req.userId });
  const eventIds = myEvents.map((e) => e._id);
  if (eventIds.length === 0) return res.json({ requests: [] });

  const registrations = await Registration.find({
    eventId: { $in: eventIds },
    targetType: 'pack',
    status: 'pending',
  }).sort({ createdAt: -1 });
  if (registrations.length === 0) return res.json({ requests: [] });

  const packIds = [...new Set(registrations.map((r) => r.targetId.toString()))];
  const userIds = [...new Set(registrations.map((r) => r.userId.toString()))];

  const [packs, users, profiles] = await Promise.all([
    Pack.find({ _id: { $in: packIds } }),
    User.find({ _id: { $in: userIds } }),
    Profile.find({ userId: { $in: userIds } }),
  ]);

  const eventById = {};
  for (const e of myEvents) eventById[e.id] = e;
  const packById = {};
  for (const p of packs) packById[p.id] = p;
  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();

  const requests = registrations
    .map((reg) => {
      const event = eventById[reg.eventId.toString()];
      const pack = packById[reg.targetId.toString()];
      if (!event || !pack) return null;
      const profile = profileByUser[reg.userId.toString()];
      return {
        id: reg.id,
        eventId: event.id,
        eventTitle: event.title,
        eventCoverMediaUrl: event.coverImageUrl || event.coverVideoUrl,
        packId: pack.id,
        packName: pack.name,
        userId: reg.userId.toString(),
        username: usernameByUser[reg.userId.toString()] || '',
        displayName: profile?.displayName || '',
        profileImage: profile?.profileImage || null,
        createdAt: reg.createdAt,
      };
    })
    .filter(Boolean);

  return res.json({ requests });
};

const getMyReservations = async (req, res) => {
  const registrations = await Registration.find({ userId: req.userId }).sort({ createdAt: -1 });
  if (registrations.length === 0) return res.json({ reservations: [] });

  const eventIds = [...new Set(registrations.map((r) => r.eventId.toString()))];
  const events = await Event.find({ _id: { $in: eventIds } });
  const enrichedEvents = await attachSessionsAndPacks(events, req.userId);
  const eventById = {};
  for (const e of enrichedEvents) eventById[e.id] = e;

  const now = Date.now();
  const reservations = registrations
    .map((reg) => {
      const event = eventById[reg.eventId.toString()];
      if (!event) return null;

      let targetName;
      let relevantSessions;
      let price = null;
      let paymentType = null;

      if (reg.targetType === 'session') {
        const session = event.sessions.find((s) => s.id === reg.targetId.toString());
        if (!session) return null;
        targetName = session.name;
        relevantSessions = [session];
      } else {
        const pack = event.packs.find((p) => p.id === reg.targetId.toString());
        if (!pack) return null;
        targetName = pack.name;
        const coveredIds =
          pack.packType === 'fixed'
            ? pack.sessionIds
            : (reg.selectedSessionIds || []).map((id) => id.toString());
        relevantSessions = event.sessions.filter((s) => coveredIds.includes(s.id));
        price = pack.price;
        paymentType = pack.paymentType;
      }

      const futureSessions = relevantSessions.filter(
        (s) => new Date(s.startDatetime).getTime() >= now
      );
      const isPast = relevantSessions.length > 0 && futureSessions.length === 0;
      const dateSource = isPast ? relevantSessions : futureSessions.length ? futureSessions : relevantSessions;
      const sessionDate = dateSource.length
        ? new Date(
            isPast
              ? Math.max(...dateSource.map((s) => new Date(s.startDatetime).getTime()))
              : Math.min(...dateSource.map((s) => new Date(s.startDatetime).getTime()))
          )
        : null;

      return {
        id: reg.id,
        targetType: reg.targetType,
        targetId: reg.targetId.toString(),
        targetName,
        status: reg.status,
        hasPaid: reg.hasPaid,
        sessionDate,
        isPast,
        price,
        paymentType,
        event,
      };
    })
    .filter(Boolean);

  return res.json({ reservations });
};

const getMyCancelledReservations = async (req, res) => {
  const cancellations = await CancelledReservation.find({ userId: req.userId }).sort({
    cancelledAt: -1,
  });
  return res.json({ cancellations: cancellations.map((c) => c.toJSON()) });
};

module.exports = {
  signUpForSession: sessionHandlers.signUp,
  cancelSessionSignUp: sessionHandlers.cancelSignUp,
  joinSessionWaitlist: sessionHandlers.joinWaitlist,
  leaveSessionWaitlist: sessionHandlers.leaveWaitlist,
  getSessionRegistrants: sessionHandlers.getRegistrants,
  markSessionAttendance,
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
  getMyReservations,
  getMyCancelledReservations,
  getMyPendingRequests,
  notifySavedEventWatchers,
};
