const express = require('express');
const {
  getMyProfile,
  getUserProfile,
  updateMyProfile,
  uploadProfileImage,
  uploadCv,
  addGalleryImage,
  removeGalleryImage,
} = require('../controllers/profileController');
const requireAuth = require('../middleware/requireAuth');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
const validateGalleryDelete = require('../middleware/validateGalleryDelete');
const handleImageUpload = require('../middleware/upload');
const handleCvUpload = require('../middleware/uploadCv');
const handleGalleryMediaUpload = require('../middleware/uploadGalleryMedia');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth);

// Rate limiting is scoped to mutating actions only - viewing a profile
// (very frequent while browsing) shares no budget with them.
router.get('/me', getMyProfile);
router.patch('/me', userRateLimit, validateProfileUpdate, updateMyProfile);
router.post('/me/profile-image', userRateLimit, handleImageUpload, uploadProfileImage);
router.post('/me/cv', userRateLimit, handleCvUpload, uploadCv);
router.post('/me/gallery', userRateLimit, handleGalleryMediaUpload, addGalleryImage);
router.delete('/me/gallery', userRateLimit, validateGalleryDelete, removeGalleryImage);
router.get('/:userId', getUserProfile);

module.exports = router;
