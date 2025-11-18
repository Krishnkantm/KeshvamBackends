const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dyzdb1agq',       // your Cloudinary name
  api_key: '597156844167385',    // your API key
  api_secret: 'lvWOPrVBSiU-VYquoD4OEC0Iw_4', // your secret key
  secure: true
});

module.exports = cloudinary;
