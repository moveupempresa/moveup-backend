const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    startDatetime: { type: Date, required: true },
    endDatetime: { type: Date, required: true },
    address: { type: String, default: null, trim: true },
    accessUrl: { type: String, default: null, trim: true },
    capacity: { type: Number, default: null },
    isUnlimitedCapacity: { type: Boolean, default: false },
    reminded2DaysSent: { type: Boolean, default: false },
    reminded1DaySent: { type: Boolean, default: false },
    reminded2HoursSent: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.eventId = ret.eventId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
