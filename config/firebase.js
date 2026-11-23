const admin = require('firebase-admin');

let app = null;

// FIREBASE_SERVICE_ACCOUNT_PATH points at the service account JSON kept
// outside the repo (see ~/secrets on the EC2 instance) - never committed.
function getFirebaseApp() {
  if (app) return app;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) return null;

  app = admin.initializeApp({
    credential: admin.credential.cert(require(path)),
  });
  return app;
}

module.exports = { getFirebaseApp };
