const mongoose = require('mongoose');

const calendarNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // 'YYYY-MM-DD', the calendar day as seen on the user's device - kept as
    // a plain string so there's no timezone ambiguity to resolve server-side.
    date: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

calendarNoteSchema.index({ userId: 1, date: 1 }, { unique: true });

const CalendarNote = mongoose.model('CalendarNote', calendarNoteSchema);

module.exports = CalendarNote;
