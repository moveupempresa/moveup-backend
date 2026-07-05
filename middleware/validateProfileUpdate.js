const SOCIAL_LINK_KEYS = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'];
const isString = (v) => typeof v === 'string';

const validateProfileUpdate = (req, res, next) => {
  const {
    displayName, artisticName, bio, city, country,
    websiteUrl, cvUrl, experience, socialLinks,
  } = req.body;

  const hasAnyField = [
    displayName, artisticName, bio, city, country,
    websiteUrl, cvUrl, experience, socialLinks,
  ].some((v) => v !== undefined);

  if (!hasAnyField) {
    return res.status(400).json({ message: 'No hay cambios para actualizar' });
  }

  if (displayName !== undefined && (!isString(displayName) || displayName.length > 100)) {
    return res.status(400).json({ message: 'Nombre inválido (máx. 100 caracteres)' });
  }
  if (artisticName !== undefined && (!isString(artisticName) || artisticName.length > 100)) {
    return res.status(400).json({ message: 'Nombre artístico inválido (máx. 100 caracteres)' });
  }
  if (bio !== undefined && (!isString(bio) || bio.length > 500)) {
    return res.status(400).json({ message: 'La biografía no puede superar los 500 caracteres' });
  }
  if (city !== undefined && !isString(city)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (country !== undefined && !isString(country)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (websiteUrl !== undefined && !isString(websiteUrl)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (cvUrl !== undefined && !isString(cvUrl)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  if (experience !== undefined) {
    if (!Number.isInteger(experience) || experience < 0 || experience > 100) {
      return res.status(400).json({ message: 'La experiencia debe ser un número entre 0 y 100' });
    }
  }
  if (socialLinks !== undefined) {
    if (typeof socialLinks !== 'object' || Array.isArray(socialLinks)) {
      return res.status(400).json({ message: 'Invalid request body' });
    }
    for (const key of Object.keys(socialLinks)) {
      if (!SOCIAL_LINK_KEYS.includes(key) || !isString(socialLinks[key])) {
        return res.status(400).json({ message: 'Invalid request body' });
      }
      req.body.socialLinks[key] = socialLinks[key].trim();
    }
  }

  if (displayName !== undefined) req.body.displayName = displayName.trim();
  if (artisticName !== undefined) req.body.artisticName = artisticName.trim();
  if (bio !== undefined) req.body.bio = bio.trim();
  if (city !== undefined) req.body.city = city.trim();
  if (country !== undefined) req.body.country = country.trim();
  if (websiteUrl !== undefined) req.body.websiteUrl = websiteUrl.trim();
  if (cvUrl !== undefined) req.body.cvUrl = cvUrl.trim();

  next();
};

module.exports = validateProfileUpdate;
