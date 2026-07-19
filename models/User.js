const mongoose = require('mongoose');

const SUBSCRIPTION_PLANS = ['free', 'pro'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => EMAIL_REGEX.test(value),
        message: (props) => `${props.value} is not a valid email`,
      },
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    subscriptionPlan: {
      type: String,
      enum: SUBSCRIPTION_PLANS,
      default: 'free',
      required: true,
    },
    billingAccountHolder: {
      type: String,
      select: false,
      default: null,
    },
    billingIban: {
      type: String,
      select: false,
      default: null,
    },
    resetCodeHash: {
      type: String,
      select: false,
    },
    resetCodeExpiresAt: {
      type: Date,
      select: false,
    },
    pendingEmail: {
      type: String,
      select: false,
      default: null,
    },
    emailChangeCodeHash: {
      type: String,
      select: false,
    },
    emailChangeCodeExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.password;
        delete ret.resetCodeHash;
        delete ret.resetCodeExpiresAt;
        delete ret.pendingEmail;
        delete ret.emailChangeCodeHash;
        delete ret.emailChangeCodeExpiresAt;
        delete ret.billingAccountHolder;
        delete ret.billingIban;
        return ret;
      },
    },
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS;
