const { getFirebaseApp } = require('../config/firebase');
const DeviceToken = require('../models/DeviceToken');

// Notification types that should also trigger a push, not just the in-app
// notification list - see the client's "notificaciones push" review item.
// Deliberately excludes social/discovery noise (new followers, content
// published, generic recommendations) per their explicit "no bombardear"
// request.
const PUSH_ENABLED_TYPES = new Set([
  'followed_user_new_event',
  'signed_up',
  'waitlisted',
  'spot_available',
  'target_updated',
  'new_registration',
  'signup_request',
  'signup_approved',
  'signup_rejected',
  'pack_paid',
  'registration_revoked',
  'payment_required',
  'registrant_cancelled',
  'self_cancel_confirmed',
  'capacity_full',
  'spot_freed',
  'event_cancelled',
  'bizum_payment_claimed',
  'payment_proof_submitted',
  'saved_event_capacity_low',
  'saved_event_capacity_full',
  'saved_event_spot_freed',
  'event_reminder_organizer_day',
  'event_reminder_organizer_hours',
  'event_reminder_student',
  'event_reminder_student_hours',
  'saved_event_reminder',
  'location_updated',
  'organizer_announcement',
]);

async function sendPushToUser(userId, { title, body, data } = {}) {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return;

  const devices = await DeviceToken.find({ userId }).lean();
  if (devices.length === 0) return;

  const response = await firebaseApp.messaging().sendEachForMulticast({
    tokens: devices.map((d) => d.token),
    notification: { title, body },
    data: data
      ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
      : undefined,
  });

  const staleTokens = [];
  response.responses.forEach((result, i) => {
    const code = result.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      staleTokens.push(devices[i].token);
    }
  });
  if (staleTokens.length > 0) {
    await DeviceToken.deleteMany({ token: { $in: staleTokens } });
  }
}

module.exports = { sendPushToUser, PUSH_ENABLED_TYPES };
