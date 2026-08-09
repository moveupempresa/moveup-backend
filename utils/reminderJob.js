const Session = require('../models/Session');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');
const { notifySavedEventWatchers } = require('../controllers/registrationController');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// Sends "starts in 2 days / tomorrow / 2 hours" reminders for upcoming
// sessions. Each threshold is tracked with a boolean flag on the session so
// a reminder is sent at most once regardless of how often this job runs.
const runReminderCheck = async () => {
  const now = Date.now();
  const sessions = await Session.find({
    startDatetime: { $gte: new Date(now) },
    $or: [{ reminded2DaysSent: false }, { reminded1DaySent: false }, { reminded2HoursSent: false }],
  });
  if (sessions.length === 0) return;

  const eventIds = [...new Set(sessions.map((s) => s.eventId.toString()))];
  const events = await Event.find({ _id: { $in: eventIds } });
  const eventById = {};
  for (const e of events) eventById[e.id] = e;

  for (const session of sessions) {
    const event = eventById[session.eventId.toString()];
    if (!event) continue;

    const hoursUntil = (new Date(session.startDatetime).getTime() - now) / MS_PER_HOUR;
    let dirty = false;

    if (hoursUntil <= 48 && !session.reminded2DaysSent) {
      await notifySavedEventWatchers(
        event._id,
        'saved_event_reminder',
        `El evento "${event.title}" comienza en 2 días`
      );
      session.reminded2DaysSent = true;
      dirty = true;
    }

    if (hoursUntil <= 24 && !session.reminded1DaySent) {
      await Notification.create({
        userId: event.ownerUserId,
        type: 'event_reminder_organizer_day',
        message: `Tu evento "${event.title}" comienza mañana`,
        relatedEventId: event._id,
      });

      const registrants = await Registration.find({
        targetType: 'session',
        targetId: session._id,
        status: 'confirmed',
      });
      if (registrants.length > 0) {
        await Notification.insertMany(
          registrants.map((r) => ({
            userId: r.userId,
            type: 'event_reminder_student',
            message: `Tu evento "${event.title}" comienza mañana`,
            relatedEventId: event._id,
          }))
        );
      }
      session.reminded1DaySent = true;
      dirty = true;
    }

    if (hoursUntil <= 2 && !session.reminded2HoursSent) {
      await Notification.create({
        userId: event.ownerUserId,
        type: 'event_reminder_organizer_hours',
        message: `Tu evento "${event.title}" comienza en 2 horas`,
        relatedEventId: event._id,
      });
      session.reminded2HoursSent = true;
      dirty = true;
    }

    if (dirty) await session.save();
  }
};

const startReminderJob = () => {
  runReminderCheck().catch((err) => console.error('Reminder job failed', err));
  setInterval(() => {
    runReminderCheck().catch((err) => console.error('Reminder job failed', err));
  }, CHECK_INTERVAL_MS);
};

module.exports = { startReminderJob, runReminderCheck };
