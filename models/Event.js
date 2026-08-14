const mongoose = require('mongoose');

const EVENT_TYPES = [
  'class', 'workshop', 'intensive', 'training', 'formation',
  'casting', 'competition', 'battle', 'party', 'special_event', 'other',
];
const LOCATION_TYPES = ['presential', 'online'];
const VISIBILITIES = ['public', 'private'];
const STATUSES = ['draft', 'published', 'unpublished', 'cancelled', 'archived'];

const eventSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    style: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0 && arr.length <= 3,
        message: 'Choose between 1 and 3 styles',
      },
    },
    eventType: { type: String, enum: EVENT_TYPES, default: 'special_event' },
    customEventType: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    location: {
      type: new mongoose.Schema(
        { lat: Number, lng: Number },
        { _id: false }
      ),
      default: null,
    },
    locationType: { type: String, enum: LOCATION_TYPES, default: 'presential' },
    visibility: { type: String, enum: VISIBILITIES, default: 'public' },
    reservationEnabled: { type: Boolean, default: false },
    // The cover is a small carousel: an image and/or a video, at least one
    // of the two required.
    coverImageUrl: { type: String, default: null },
    coverVideoUrl: { type: String, default: null },
    status: { type: String, enum: STATUSES, required: true, default: 'draft' },
    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.ownerUserId = ret.ownerUserId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

eventSchema.path('coverImageUrl').validate(function validateCover() {
  return Boolean(this.coverImageUrl || this.coverVideoUrl);
}, 'Añade al menos una imagen o un video de portada');

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.LOCATION_TYPES = LOCATION_TYPES;
module.exports.VISIBILITIES = VISIBILITIES;
module.exports.STATUSES = STATUSES;
