const mongoose = require('mongoose');

const validateGalleryDelete = (req, res, next) => {
  const { id } = req.body;
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  next();
};

module.exports = validateGalleryDelete;
