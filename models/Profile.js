const mongoose = require('mongoose');

const galleryAlbumSchema = new mongoose.Schema({
  urls: {
    type: [String],
    required: true,
    validate: { validator: (arr) => arr.length > 0, message: 'Album must have at least one file' },
  },
});

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    displayName: { type: String, default: '', trim: true, maxlength: 100 },
    artisticName: { type: String, default: '', trim: true, maxlength: 100 },
    bio: { type: String, default: '', trim: true, maxlength: 500 },
    city: { type: String, default: '', trim: true, maxlength: 100 },
    country: { type: String, default: '', trim: true, maxlength: 100 },
    profileImage: { type: String, default: null },
    websiteUrl: { type: String, default: '', trim: true },
    cvUrl: { type: String, default: '', trim: true },
    experience: { type: Number, default: 0, min: 0, max: 100 },
    gallery: { type: [galleryAlbumSchema], default: [] },
    socialLinks: {
      instagram: { type: String, default: '', trim: true },
      tiktok: { type: String, default: '', trim: true },
      youtube: { type: String, default: '', trim: true },
      facebook: { type: String, default: '', trim: true },
      twitter: { type: String, default: '', trim: true },
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
        ret.gallery = (ret.gallery || []).map((item) => ({
          id: item._id.toString(),
          urls: item.urls,
        }));
        delete ret._id;
        return ret;
      },
    },
  }
);

const Profile = mongoose.model('Profile', profileSchema);
module.exports = Profile;
