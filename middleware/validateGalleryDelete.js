const validateGalleryDelete = (req, res, next) => {
  const { url } = req.body;
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  next();
};

module.exports = validateGalleryDelete;
