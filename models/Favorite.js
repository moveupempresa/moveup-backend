const mongoose = require('mongoose');

// Distinct from Follow: following someone doesn't mean you want every one
// of their updates. Favoriting is the signal that drives the
// "Descubrimiento" new-event notification.
const favoriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    favoriteUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
        ret.favoriteUserId = ret.favoriteUserId.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

favoriteSchema.index({ userId: 1, favoriteUserId: 1 }, { unique: true });

const Favorite = mongoose.model('Favorite', favoriteSchema);

module.exports = Favorite;
