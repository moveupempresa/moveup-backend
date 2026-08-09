const express = require('express');

const router = express.Router();

// Bump LATEST_APP_BUILD_NUMBER in the EC2 environment (and pm2 restart) to
// prompt clients to update - no code deploy needed for future bumps.
router.get('/version', (req, res) => {
  const latestBuildNumber = parseInt(process.env.LATEST_APP_BUILD_NUMBER, 10) || 3;
  return res.status(200).json({ latestBuildNumber });
});

module.exports = router;
