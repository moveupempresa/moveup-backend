const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'followed_user',
  'followed_user_new_event',
  'new_follower',
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
  'saved_event_capacity_low',
  'saved_event_capacity_full',
  'saved_event_spot_freed',
  'event_reminder_organizer_day',
  'event_reminder_organizer_hours',
  'event_reminder_student',
  'saved_event_reminder',
  'phone_number_required',
];

const TARGET_TYPES = ['session', 'pack'];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    message: { type: String, required: true },
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    relatedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    relatedTargetType: { type: String, enum: TARGET_TYPES, default: null },
    relatedTargetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Snapshot of the organizer's phone at the time an event_cancelled
    // notification was created, so the attendee can reach out even if the
    // event was deleted or the organizer later changes their number.
    organizerPhone: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId.toString();
        if (ret.relatedUserId) ret.relatedUserId = ret.relatedUserId.toString();
        if (ret.relatedEventId) ret.relatedEventId = ret.relatedEventId.toString();
        if (ret.relatedTargetId) ret.relatedTargetId = ret.relatedTargetId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
