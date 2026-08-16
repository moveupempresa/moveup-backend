const mongoose = require('mongoose');

const PAYMENT_TYPES = ['bizum', 'paypal', 'offline', 'online'];
const PACK_TYPES = ['fixed', 'customizable'];
const APPROVAL_MODES = ['automatic', 'manual'];

const packSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    price: { type: mongoose.Schema.Types.Decimal128, required: true },
    paymentType: { type: String, enum: PAYMENT_TYPES, required: true },
    // Where to send Bizum/PayPal payment (phone number, PayPal.me link...).
    // Not used for offline (cash) or online (in-app) packs.
    paymentDetails: { type: String, default: null, trim: true, maxlength: 300 },
    packType: { type: String, enum: PACK_TYPES, required: true },
    approvalMode: { type: String, enum: APPROVAL_MODES, required: true },
    maxSelectableSessions: { type: Number, default: null },
    sessionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.eventId = ret.eventId.toString();
        ret.price = parseFloat(ret.price.toString());
        ret.sessionIds = ret.sessionIds.map((id) => id.toString());
        delete ret._id;
        return ret;
      },
    },
  }
);

const Pack = mongoose.model('Pack', packSchema);

module.exports = Pack;
module.exports.PAYMENT_TYPES = PAYMENT_TYPES;
module.exports.PACK_TYPES = PACK_TYPES;
module.exports.APPROVAL_MODES = APPROVAL_MODES;
