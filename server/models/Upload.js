const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
    originalName: String,
    filename: String,
    mimeType: String,
    size: Number,
    url: String,
    public_id: String,
    category: { type: String, default: 'general' },
    title: String,
    price: String,
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Upload', uploadSchema);
