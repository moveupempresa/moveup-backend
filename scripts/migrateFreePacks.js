// One-off migration: 'free' is retired as a paymentType (payment methods
// are now bizum/paypal/offline/online only). Existing free packs become
// offline (Efectivo) - no real money changes hands for them either way, and
// offline is the closest "no in-app processing" bucket.
// Run with: node scripts/migrateFreePacks.js
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.db.collection('packs');

  const freePacks = await collection.find({ paymentType: 'free' }).toArray();
  console.log(`Found ${freePacks.length} free packs to migrate`);
  for (const pack of freePacks) {
    console.log(`  ${pack._id} "${pack.name}" (price=${pack.price}) -> offline`);
    await collection.updateOne({ _id: pack._id }, { $set: { paymentType: 'offline' } });
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
