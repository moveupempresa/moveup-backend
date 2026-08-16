// One-off migration: hour-anchored calendar notes used to be plain text.
// They're now lightweight personal "events" (title/address/endHour), so
// existing hour-anchored notes get their text promoted to a title.
// Run with: node scripts/migrateCalendarEventNotes.js
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.db.collection('calendarnotes');

  const legacyNotes = await collection
    .find({ hour: { $ne: null }, title: { $in: [null, undefined] } })
    .toArray();

  console.log(`Found ${legacyNotes.length} legacy hour-anchored notes to migrate`);
  for (const note of legacyNotes) {
    const title = (note.text || 'Evento').trim().slice(0, 200) || 'Evento';
    const endHour = Math.min(note.hour + 1, 24);
    console.log(`  ${note._id} hour=${note.hour} -> title="${title}" endHour=${endHour}`);
    await collection.updateOne(
      { _id: note._id },
      { $set: { title, endHour, address: null, text: '' } }
    );
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
