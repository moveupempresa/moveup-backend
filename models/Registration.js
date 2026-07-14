const mongoose = require('mongoose');

const TARGET_TYPES = ['session', 'pack'];
const STATUSES = ['confirmed', 'waitlisted', 'pending'];

const registrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: { type: String, enum: STATUSES, default: 'confirmed', required: true },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId.toString();
        ret.eventId = ret.eventId.toString();
        ret.targetId = ret.targetId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

registrationSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

const Registration = mongoose.model('Registration', registrationSchema);

module.exports = Registration;
module.exports.TARGET_TYPES = TARGET_TYPES;
module.exports.STATUSES = STATUSES;
