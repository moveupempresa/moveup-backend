const fs = require('fs');
const path = require('path');

const deleteUploadedFile = (relativeUrl) => {
  if (!relativeUrl) return;
  const filePath = path.join(__dirname, '..', relativeUrl.replace(/^\//, ''));
  fs.unlink(filePath, () => {});
};

module.exports = { deleteUploadedFile };
