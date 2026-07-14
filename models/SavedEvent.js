const mongoose = require('mongoose');

const savedEventSchema = new mongoose.Schema(
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
        delete ret._id;
        return ret;
      },
    },
  }
);

savedEventSchema.index({ userId: 1, eventId: 1 }, { unique: true });

const SavedEvent = mongoose.model('SavedEvent', savedEventSchema);

module.exports = SavedEvent;
