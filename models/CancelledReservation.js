const mongoose = require('mongoose');

const TARGET_TYPES = ['session', 'pack'];
const CANCELLED_BY_VALUES = ['self', 'organizer', 'event_deleted'];

// An append-only log of cancelled reservations. Cancelling a live
// Registration deletes it (to keep capacity/waitlist logic simple), so this
// is the only record of what a user used to be booked into.
const cancelledReservationSchema = new mongoose.Schema(
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
    eventTitle: { type: String, required: true },
    eventCoverMediaUrl: { type: String, default: null },
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetName: { type: String, required: true },
    sessionDate: { type: Date, default: null },
    cancelledBy: { type: String, enum: CANCELLED_BY_VALUES, required: true },
  },
  {
    timestamps: { createdAt: 'cancelledAt', updatedAt: false },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId.toString();
        ret.eventId = ret.eventId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const CancelledReservation = mongoose.model('CancelledReservation', cancelledReservationSchema);

module.exports = CancelledReservation;
