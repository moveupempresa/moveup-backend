// One-off script: geocodes city/country into lat/lng for Events and
// Profiles that predate the location field. Run manually once after
// deploying the location feature: `node scripts/backfillLocations.js`
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Profile = require('../models/Profile');
const { geocodeLocation } = require('../utils/geocode');

// Nominatim's usage policy caps anonymous use at 1 request/second.
const NOMINATIM_DELAY_MS = 1100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backfill = async (Model, label) => {
  const docs = await Model.find({ location: null });
  console.log(`${label}: ${docs.length} missing coordinates`);

  let geocoded = 0;
  for (const doc of docs) {
    if (!doc.city && !doc.country) continue;
    const location = await geocodeLocation(doc.city, doc.country);
    if (location) {
      doc.location = location;
      await doc.save();
      geocoded += 1;
    }
    await sleep(NOMINATIM_DELAY_MS);
  }
  console.log(`${label}: geocoded ${geocoded}/${docs.length}`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await backfill(Event, 'Events');
  await backfill(Profile, 'Profiles');
  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
