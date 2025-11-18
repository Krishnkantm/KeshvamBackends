const multer = require('multer');

const storage = multer.memoryStorage(); // buffer storage
const parser = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

module.exports = parser;



