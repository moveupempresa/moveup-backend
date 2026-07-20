// One-off read-only scan: reports every document/field containing the
// Unicode replacement character (U+FFFD), a sign of historically corrupted
// text (not an active bug - verified separately that new writes round-trip
// correctly). Run with: node scripts/findEncodingIssues.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Session = require('../models/Session');
const Pack = require('../models/Pack');
const Profile = require('../models/Profile');
const User = require('../models/User');

const REPLACEMENT_CHAR = '�';

const scan = async (Model, label, fields) => {
  const or = fields.map((f) => ({ [f]: { $regex: REPLACEMENT_CHAR } }));
  const docs = await Model.find({ $or: or });
  if (docs.length === 0) return;
  console.log(`\n${label}: ${docs.length} affected`);
  for (const doc of docs) {
    console.log(`  id=${doc._id}`);
    for (const f of fields) {
      const value = doc[f];
      if (typeof value === 'string' && value.includes(REPLACEMENT_CHAR)) {
        console.log(`    ${f}: ${JSON.stringify(value)}`);
      }
    }
  }
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await scan(Event, 'Events', ['title', 'description', 'city', 'country', 'customEventType']);
  await scan(Session, 'Sessions', ['name', 'address']);
  await scan(Pack, 'Packs', ['name', 'description']);
  await scan(Profile, 'Profiles', ['displayName', 'artisticName', 'bio', 'city', 'country']);
  await scan(User, 'Users', ['username']);
  console.log('\nDone.');
  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
