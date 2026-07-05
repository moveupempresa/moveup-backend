const express = require('express');
const { getMyProfile, updateMyProfile, uploadProfileImage, addGalleryImage, removeGalleryImage } = require('../controllers/profileController');
const requireAuth = require('../middleware/requireAuth');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');
const validateGalleryDelete = require('../middleware/validateGalleryDelete');
const handleImageUpload = require('../middleware/upload');
const userRateLimit = require('../middleware/userRateLimit');

const router = express.Router();

router.use(requireAuth, userRateLimit);

router.get('/me', getMyProfile);
router.patch('/me', validateProfileUpdate, updateMyProfile);
router.post('/me/profile-image', handleImageUpload, uploadProfileImage);
router.post('/me/gallery', handleImageUpload, addGalleryImage);
router.delete('/me/gallery', validateGalleryDelete, removeGalleryImage);

module.exports = router;
