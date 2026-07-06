const mongoose = require('mongoose');

const EVENT_TYPES = [
  'class', 'workshop', 'intensive', 'training', 'formation',
  'casting', 'competition', 'battle', 'party', 'special_event',
];
const LOCATION_TYPES = ['presential', 'online'];
const VISIBILITIES = ['public', 'private'];
const STATUSES = ['draft', 'published', 'unpublished', 'cancelled', 'archived'];
const COVER_MEDIA_TYPES = ['image', 'video'];

const eventSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    address: { type: String, default: null, trim: true },
    locationType: { type: String, enum: LOCATION_TYPES, required: true },
    visibility: { type: String, enum: VISIBILITIES, required: true },
    reservationEnabled: { type: Boolean, default: false },
    coverMediaType: { type: String, enum: COVER_MEDIA_TYPES, required: true },
    coverMediaUrl: { type: String, required: true },
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

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.LOCATION_TYPES = LOCATION_TYPES;
module.exports.VISIBILITIES = VISIBILITIES;
module.exports.STATUSES = STATUSES;
module.exports.COVER_MEDIA_TYPES = COVER_MEDIA_TYPES;
