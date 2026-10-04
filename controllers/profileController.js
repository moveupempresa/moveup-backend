const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Favorite = require('../models/Favorite');
const { deleteUploadedFile } = require('../utils/fileUtils');
const { geocodeLocation } = require('../utils/geocode');

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

  const [profile, user, followersCount, isFollowing, isFavorite] = await Promise.all([
    Profile.findOne({ userId }),
    User.findById(userId),
    Follow.countDocuments({ followingId: userId }),
    Follow.exists({ followerId: req.userId, followingId: userId }),
    Favorite.exists({ userId: req.userId, favoriteUserId: userId }),
  ]);
  if (!profile || !user) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  return res.status(200).json({
    profile: profile.toJSON(),
    username: user.username,
    followersCount,
    isFollowing: Boolean(isFollowing),
    isFavorite: Boolean(isFavorite),
    contact: buildContactInfo(user, profile),
  });
};

// Resolves a profile's chosen contact methods to their actual values -
// only ever includes a field the user explicitly opted into showing, since
// this is sent to other users' clients (unlike the owner's own session,
// which already has their full User/Profile and needs no resolving).
const buildContactInfo = (user, profile) => {
  const cm = profile.contactMethods || {};
  const contact = {};
  if (cm.phone && user.phone) contact.phone = user.phone;
  if (cm.email) contact.email = user.email;
  if (cm.social?.enabled && cm.social.platform) {
    const value = profile.socialLinks?.[cm.social.platform];
    if (value) contact.social = { platform: cm.social.platform, value };
  }
  return Object.keys(contact).length > 0 ? contact : null;
};

const updateMyProfile = async (req, res) => {
  const {
    displayName, artisticName, bio, city, country,
    websiteUrl, cvUrl, experience, socialLinks, contactMethods,
  } = req.body;

  const existing = await Profile.findOne({ userId: req.userId });
  if (!existing) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

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

  if (contactMethods !== undefined) {
    const phone = contactMethods.phone ?? existing.contactMethods.phone;
    const email = contactMethods.email ?? existing.contactMethods.email;
    const socialInput = contactMethods.social ?? {};
    const socialEnabled =
      socialInput.enabled ?? existing.contactMethods.social.enabled;
    const socialPlatform =
      socialInput.platform !== undefined
        ? socialInput.platform
        : existing.contactMethods.social.platform;

    if (!phone && !email && !socialEnabled) {
      return res
        .status(400)
        .json({ message: 'Selecciona al menos un método de contacto' });
    }

    if (phone) {
      const user = await User.findById(req.userId);
      if (!user?.phone) {
        return res.status(400).json({
          message: 'Añade un número de teléfono antes de seleccionarlo como método de contacto',
        });
      }
    }

    if (socialEnabled) {
      if (!socialPlatform) {
        return res
          .status(400)
          .json({ message: 'Selecciona una red social' });
      }
      const futureValue = socialLinks?.[socialPlatform] ?? existing.socialLinks[socialPlatform];
      if (!futureValue) {
        return res.status(400).json({
          message: 'Añade el enlace o usuario de esa red social antes de seleccionarla como método de contacto',
        });
      }
    }

    update['contactMethods.phone'] = phone;
    update['contactMethods.email'] = email;
    update['contactMethods.social.enabled'] = socialEnabled;
    update['contactMethods.social.platform'] = socialEnabled ? socialPlatform : null;
  }

  const locationChanged =
    (city !== undefined && city !== existing.city) ||
    (country !== undefined && country !== existing.country);
  if (locationChanged) {
    update.location = await geocodeLocation(city ?? existing.city, country ?? existing.country);
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

const uploadCv = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No se recibió ningún archivo' });
  }

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    deleteUploadedFile(`/uploads/${req.file.filename}`);
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  const previousCvUrl = profile.cvUrl;
  profile.cvUrl = `/uploads/${req.file.filename}`;
  await profile.save();
  // A previous CV pasted as an external URL isn't a local file - deleting it
  // is a harmless no-op in that case.
  deleteUploadedFile(previousCvUrl);

  return res.status(200).json({ profile: profile.toJSON() });
};

const GALLERY_LIMIT = 12;

const addGalleryImage = async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ message: 'No se recibió ningún archivo' });
  }

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    files.forEach((f) => deleteUploadedFile(`/uploads/${f.filename}`));
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  if (profile.gallery.length >= GALLERY_LIMIT) {
    files.forEach((f) => deleteUploadedFile(`/uploads/${f.filename}`));
    return res
      .status(400)
      .json({ message: `Solo puedes tener hasta ${GALLERY_LIMIT} elementos en tu galería` });
  }

  profile.gallery.push({ urls: files.map((f) => `/uploads/${f.filename}`) });
  await profile.save();

  return res.status(200).json({ profile: profile.toJSON() });
};

const removeGalleryImage = async (req, res) => {
  const { id } = req.body;

  const profile = await Profile.findOne({ userId: req.userId });
  if (!profile) {
    return res.status(404).json({ message: 'Perfil no encontrado' });
  }

  const album = profile.gallery.id(id);
  if (!album) {
    return res.status(404).json({ message: 'Elemento no encontrado en la galería' });
  }

  const urls = [...album.urls];
  album.deleteOne();
  await profile.save();
  urls.forEach((url) => deleteUploadedFile(url));

  return res.status(200).json({ profile: profile.toJSON() });
};

module.exports = {
  getMyProfile,
  getUserProfile,
  updateMyProfile,
  uploadProfileImage,
  uploadCv,
  addGalleryImage,
  removeGalleryImage,
};
