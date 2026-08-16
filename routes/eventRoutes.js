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
const { getExploreSections } = require('../controllers/exploreController');
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
  getSessionRegistrants,
  markSessionAttendance,
  signUpForPack,
  cancelPackSignUp,
  joinPackWaitlist,
  leavePackWaitlist,
  getPackRegistrants,
  revokePackRegistration,
  approvePackRequest,
  rejectPackRequest,
  setPackPaymentStatus,
  payForPack,
} = require('../controllers/registrationController');
const requireAuth = require('../middleware/requireAuth');
const handleCoverUpload = require('../middleware/uploadCover');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth);

// Rate limiting is scoped to mutating actions only - plain browsing (every
// GET below) shares no budget with them, so scrolling through events/packs
// can never trip a limiter meant to curb abusive writes.
router.post('/', userRateLimit, handleCoverUpload, createEvent);
router.get('/', getPublicEvents);
router.get('/my', getMyEvents);
router.get('/explore-sections', getExploreSections);
router.put('/:eventId', userRateLimit, handleCoverUpload, updateEvent);
router.delete('/:eventId', userRateLimit, deleteEvent);
router.get('/:eventId/sessions', getEventSessions);
router.post('/:eventId/sessions', userRateLimit, createSession);
router.put('/:eventId/sessions/:sessionId', userRateLimit, updateSession);
router.delete('/:eventId/sessions/:sessionId', userRateLimit, deleteSession);
router.post('/:eventId/sessions/:sessionId/signup', userRateLimit, signUpForSession);
router.delete('/:eventId/sessions/:sessionId/signup', userRateLimit, cancelSessionSignUp);
router.post('/:eventId/sessions/:sessionId/waitlist', userRateLimit, joinSessionWaitlist);
router.delete('/:eventId/sessions/:sessionId/waitlist', userRateLimit, leaveSessionWaitlist);
router.get('/:eventId/sessions/:sessionId/registrations', getSessionRegistrants);
router.post(
  '/:eventId/sessions/:sessionId/registrations/:userId/attendance',
  userRateLimit,
  markSessionAttendance
);
router.get('/:eventId/packs', getEventPacks);
router.post('/:eventId/packs', userRateLimit, createPack);
router.put('/:eventId/packs/:packId', userRateLimit, updatePack);
router.delete('/:eventId/packs/:packId', userRateLimit, deletePack);
router.post('/:eventId/packs/:packId/signup', userRateLimit, signUpForPack);
router.delete('/:eventId/packs/:packId/signup', userRateLimit, cancelPackSignUp);
router.post('/:eventId/packs/:packId/waitlist', userRateLimit, joinPackWaitlist);
router.delete('/:eventId/packs/:packId/waitlist', userRateLimit, leavePackWaitlist);
router.get('/:eventId/packs/:packId/registrations', getPackRegistrants);
router.delete('/:eventId/packs/:packId/registrations/:userId', userRateLimit, revokePackRegistration);
router.post('/:eventId/packs/:packId/requests/:userId/approve', userRateLimit, approvePackRequest);
router.post('/:eventId/packs/:packId/requests/:userId/reject', userRateLimit, rejectPackRequest);
router.post('/:eventId/packs/:packId/registrations/:userId/payment', userRateLimit, setPackPaymentStatus);
router.post('/:eventId/packs/:packId/payment', userRateLimit, payForPack);
router.post('/:eventId/save', userRateLimit, saveEvent);
router.delete('/:eventId/save', userRateLimit, unsaveEvent);

module.exports = router;
