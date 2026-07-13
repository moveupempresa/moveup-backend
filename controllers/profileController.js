const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { deleteUploadedFile } = require('../utils/fileUtils');

const getMyProfile = async (req, res) => {
  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }
  return res.status(200).json({ profile: profile.toJSON() });
};

const getUserProfile = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  const [profile, user] = await Promise.all([
    Profile.findOne({ userId }),
    User.findById(userId),
  ]);
  if (!profile || !user) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  return res.status(200).json({ profile: profile.toJSON(), username: user.username });
};

const updateMyProfile = async (req, res) => {
  const {
    displayName, artisticName, bio, city, country,
    websiteUrl, cvUrl, experience, socialLinks,
  } = req.body;

  const update = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (artisticName !== undefined) update.artisticName = artisticName;
  if (bio !== undefined) update.bio = bio;
  if (city !== undefined) update.city = city;
  if (country !== undefined) update.country = country;
  if (websiteUrl !== undefined) update.websiteUrl = websiteUrl;
  if (cvUrl !== undefined) update.cvUrl = cvUrl;
  if (experience !== undefined) update.experience = experience;
  if (socialLinks) {
    for (const key of Object.keys(socialLinks)) {
      update[`socialLinks.${key}`] = socialLinks[key];
    }
  }

  const profile = await Profile.findOneAndUpdate(
    { userId: req.userId },
    { $set: update },
    { new: true, returnDocument: 'after', runValidators: true }
  );
  if (!profile) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }
  return res.status(200).json({ profile: profile.toJSON() });
};

const uploadProfileImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No se recibió ninguna imagen' });
  }

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    deleteUploadedFile(`/uploads/${req.file.filename}`);
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  const previousImage = profile.profileImage;
  profile.profileImage = `/uploads/${req.file.filename}`;
  await profile.save();
  deleteUploadedFile(previousImage);

  return res.status(200).json({ profile: profile.toJSON() });
};

const GALLERY_LIMIT = 12;

const addGalleryImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No se recibió ningún archivo' });
  }

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    deleteUploadedFile(`/uploads/${req.file.filename}`);
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  if (profile.gallery.length >= GALLERY_LIMIT) {
    deleteUploadedFile(`/uploads/${req.file.filename}`);
    return res
      .status(400)
      .json({ message: `Solo puedes tener hasta ${GALLERY_LIMIT} elementos en tu galería` });
  }

  profile.gallery.push(`/uploads/${req.file.filename}`);
  await profile.save();

  return res.status(200).json({ profile: profile.toJSON() });
};

const removeGalleryImage = async (req, res) => {
  const { url } = req.body;

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  if (!profile.gallery.includes(url)) {
    return res.status(404).json({ message: 'Imagen no encontrada en la galería' });
  }

  profile.gallery = profile.gallery.filter((item) => item !== url);
  await profile.save();
  deleteUploadedFile(url);

  return res.status(200).json({ profile: profile.toJSON() });
};

module.exports = {
  getMyProfile,
  getUserProfile,
  updateMyProfile,
  uploadProfileImage,
  addGalleryImage,
  removeGalleryImage,
};
