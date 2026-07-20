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
