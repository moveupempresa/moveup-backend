// One-off script: existing profiles predate the contact-methods feature,
// so they'd otherwise show up as "missing a contact method" even though
// every account already has a working email on file. Defaults their
// contact method to email (the one method guaranteed to be valid) so
// only genuinely new signups go through the mandatory setup step.
// Run manually once after deploying: `node scripts/backfillContactMethods.js`
require('dotenv').config();
const mongoose = require('mongoose');
const Profile = require('../models/Profile');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Matches both profiles that predate the field entirely and ones already
  // written with every method left off - a raw MongoDB query doesn't see
  // Mongoose's schema defaults, so a missing field needs its own check.
  const result = await Profile.updateMany(
    {
      $or: [
        { contactMethods: { $exists: false } },
        {
          'contactMethods.phone': false,
          'contactMethods.email': false,
          'contactMethods.social.enabled': false,
        },
      ],
    },
    { $set: { 'contactMethods.email': true } }
  );
  console.log(`Profiles backfilled with email as contact method: ${result.modifiedCount}`);

  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
