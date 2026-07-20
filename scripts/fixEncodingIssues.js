// One-off fix for the legacy encoding corruption identified by
// findEncodingIssues.js. Applies a fixed set of known, verified string
// replacements to Event and Session text fields. Run with:
// node scripts/fixEncodingIssues.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Session = require('../models/Session');

const REPLACEMENT_CHAR = '�';

const REPLACEMENTS = [
  ['Espa�a', 'España'],
  ['Sesi�n', 'Sesión'],
  ['Formaci�n', 'Formación'],
  ['Competici�n', 'Competición'],
  ['Contempor�neo', 'Contemporáneo'],
  ['�Todos los niveles bienvenidos', '¡Todos los niveles bienvenidos'],
];

const fixValue = (value) => {
  let fixed = value;
  for (const [bad, good] of REPLACEMENTS) fixed = fixed.split(bad).join(good);
  return fixed;
};

const fixDocs = async (Model, label, fields) => {
  const or = fields.map((f) => ({ [f]: { $regex: REPLACEMENT_CHAR } }));
  const docs = await Model.find({ $or: or });
  let fixedCount = 0;
  let leftoverCount = 0;

  for (const doc of docs) {
    let changed = false;
    for (const f of fields) {
      const value = doc[f];
      if (typeof value !== 'string' || !value.includes(REPLACEMENT_CHAR)) continue;
      const fixed = fixValue(value);
      if (fixed !== value) {
        doc[f] = fixed;
        changed = true;
      }
      if (fixed.includes(REPLACEMENT_CHAR)) {
        console.log(`  UNRESOLVED ${label} ${doc._id}.${f}: ${JSON.stringify(fixed)}`);
        leftoverCount += 1;
      }
    }
    if (changed) {
      await doc.save();
      fixedCount += 1;
    }
  }
  console.log(`${label}: fixed ${fixedCount}/${docs.length} docs, ${leftoverCount} unresolved fields`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await fixDocs(Event, 'Events', ['title', 'description', 'city', 'country', 'customEventType']);
  await fixDocs(Session, 'Sessions', ['name', 'address']);
  console.log('Done.');
  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
