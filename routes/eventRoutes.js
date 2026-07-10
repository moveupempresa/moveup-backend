const express = require('express');
const { createEvent, getMyEvents } = require('../controllers/eventController');
const { createSession, getEventSessions } = require('../controllers/sessionController');
const { createPack, getEventPacks } = require('../controllers/packController');
const requireAuth = require('../middleware/requireAuth');
const handleCoverUpload = require('../middleware/uploadCover');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth, userRateLimit);

router.post('/', handleCoverUpload, createEvent);
router.get('/my', getMyEvents);
router.get('/:eventId/sessions', getEventSessions);
router.post('/:eventId/sessions', createSession);
router.get('/:eventId/packs', getEventPacks);
router.post('/:eventId/packs', createPack);

module.exports = router;
