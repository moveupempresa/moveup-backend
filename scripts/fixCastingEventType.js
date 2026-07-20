// One-off fix: seed events titled "Casting de X" were tagged with the
// wrong eventType (special_event instead of casting). Run with:
// node scripts/fixCastingEventType.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const events = await Event.find({
    title: { $regex: '^Casting de ' },
    eventType: { $ne: 'casting' },
  });

  console.log(`Found ${events.length} mislabeled casting events`);
  for (const event of events) {
    console.log(`  ${event._id} "${event.title}" (${event.eventType} -> casting)`);
    event.eventType = 'casting';
    await event.save();
  }

  console.log('Done.');
  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
