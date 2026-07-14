const express = require('express');
const {
  createEvent,
  updateEvent,
  deleteEvent,
  getMyEvents,
  getPublicEvents,
  saveEvent,
  unsaveEvent,
} = require('../controllers/eventController');
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
const {
  signUpForSession,
  cancelSessionSignUp,
  joinSessionWaitlist,
  leaveSessionWaitlist,
  signUpForPack,
  cancelPackSignUp,
  joinPackWaitlist,
  leavePackWaitlist,
  approvePackRequest,
  rejectPackRequest,
} = require('../controllers/registrationController');
const requireAuth = require('../middleware/requireAuth');
const handleCoverUpload = require('../middleware/uploadCover');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth, userRateLimit);

router.post('/', handleCoverUpload, createEvent);
router.get('/', getPublicEvents);
router.get('/my', getMyEvents);
router.put('/:eventId', handleCoverUpload, updateEvent);
router.delete('/:eventId', deleteEvent);
router.get('/:eventId/sessions', getEventSessions);
router.post('/:eventId/sessions', createSession);
router.put('/:eventId/sessions/:sessionId', updateSession);
router.delete('/:eventId/sessions/:sessionId', deleteSession);
router.post('/:eventId/sessions/:sessionId/signup', signUpForSession);
router.delete('/:eventId/sessions/:sessionId/signup', cancelSessionSignUp);
router.post('/:eventId/sessions/:sessionId/waitlist', joinSessionWaitlist);
router.delete('/:eventId/sessions/:sessionId/waitlist', leaveSessionWaitlist);
router.get('/:eventId/packs', getEventPacks);
router.post('/:eventId/packs', createPack);
router.put('/:eventId/packs/:packId', updatePack);
router.delete('/:eventId/packs/:packId', deletePack);
router.post('/:eventId/packs/:packId/signup', signUpForPack);
router.delete('/:eventId/packs/:packId/signup', cancelPackSignUp);
router.post('/:eventId/packs/:packId/waitlist', joinPackWaitlist);
router.delete('/:eventId/packs/:packId/waitlist', leavePackWaitlist);
router.post('/:eventId/packs/:packId/requests/:userId/approve', approvePackRequest);
router.post('/:eventId/packs/:packId/requests/:userId/reject', rejectPackRequest);
router.post('/:eventId/save', saveEvent);
router.delete('/:eventId/save', unsaveEvent);

module.exports = router;
