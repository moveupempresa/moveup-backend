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

router.use(requireAuth, userRateLimit);

router.get('/me', getMyProfile);
router.patch('/me', validateProfileUpdate, updateMyProfile);
router.post('/me/profile-image', handleImageUpload, uploadProfileImage);
router.post('/me/cv', handleCvUpload, uploadCv);
router.post('/me/gallery', handleGalleryMediaUpload, addGalleryImage);
router.delete('/me/gallery', validateGalleryDelete, removeGalleryImage);
router.get('/:userId', getUserProfile);

module.exports = router;
