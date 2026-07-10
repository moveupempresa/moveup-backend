const express = require('express');
const { createEvent, updateEvent, getMyEvents } = require('../controllers/eventController');
const {
  createSession,
  getEventSessions,
  updateSession,
  deleteSession,
} = require('../controllers/sessionController');
const {
  createPack,
  getEventPacks,
  updatePack,
  deletePack,
} = require('../controllers/packController');
const requireAuth = require('../middleware/requireAuth');
const handleCoverUpload = require('../middleware/uploadCover');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth, userRateLimit);

router.post('/', handleCoverUpload, createEvent);
router.get('/my', getMyEvents);
router.put('/:eventId', handleCoverUpload, updateEvent);
router.get('/:eventId/sessions', getEventSessions);
router.post('/:eventId/sessions', createSession);
router.put('/:eventId/sessions/:sessionId', updateSession);
router.delete('/:eventId/sessions/:sessionId', deleteSession);
router.get('/:eventId/packs', getEventPacks);
router.post('/:eventId/packs', createPack);
router.put('/:eventId/packs/:packId', updatePack);
router.delete('/:eventId/packs/:packId', deletePack);

module.exports = router;
