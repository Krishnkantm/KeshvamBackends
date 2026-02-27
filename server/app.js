// -------------------- IMPORTS --------------------
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const parser = require('./multerCloud');  // multer setup
const cloudinary = require('./cloudinary'); // cloudinary setup
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// -------------------- EXPRESS APP --------------------
const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// -------------------- CORS --------------------
// Only allow frontend origin
const FRONTEND_URL = 'https://keshwam-graphicsfrontend.vercel.app';
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// -------------------- MONGODB CONNECTION --------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// -------------------- UPLOAD SCHEMA --------------------
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
const Upload = mongoose.model('Upload', uploadSchema);

// -------------------- PRICE LIST --------------------
const PRICE_FILE = path.join(__dirname, 'priceList.json');
if (!fs.existsSync(PRICE_FILE)) {
  fs.writeFileSync(PRICE_FILE, JSON.stringify([
    { name: "Wedding Invitation Card", price: "₹300 – ₹1200 / piece" },
    { name: "Flex Printing", price: "₹15 – ₹100 per sq.ft" },
    { name: "Photo Frame (Glass + Wooden)", price: "₹200 – ₹950 per piece" },
    { name: "Number Plate", price: "₹150 – ₹450 per piece" },
    { name: "Reels / Video Editing", price: "₹200 – ₹1200 per video" }
  ], null, 2));
}

const loadPrices = () => JSON.parse(fs.readFileSync(PRICE_FILE));
const savePrices = (data) => fs.writeFileSync(PRICE_FILE, JSON.stringify(data, null, 2));

// -------------------- AUTH MIDDLEWARE --------------------
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// -------------------- ROUTES --------------------

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Prices
app.get('/api/prices', (req, res) => res.json(loadPrices()));
app.put('/api/admin/prices', auth, (req, res) => {
  savePrices(req.body);
  res.json({ success: true });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// Upload to Cloudinary & Mongo
app.post('/api/admin/upload', auth, parser.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { category, title, price } = req.body;

  try {
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'keshvam-uploads', resource_type: 'auto' },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });

    const newUpload = new Upload({
      originalName: req.file.originalname,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: result.secure_url,
      public_id: result.public_id,
      category: category || 'general',
      title: title || '',
      price: price || ''
    });

    await newUpload.save();
    res.json({ success: true, item: newUpload });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Delete file
app.delete('/delete/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const file = await Upload.findById(id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const resourceType = file.mimeType.startsWith('video') ? 'video' : 'image';
    await cloudinary.uploader.destroy(file.public_id, { resource_type: resourceType });
    await Upload.findByIdAndDelete(id);

    res.json({ message: 'Deleted successfully ✅' });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get media list
app.get('/api/media', async (req, res) => {
  try {
    const media = await Upload.find().sort({ uploadedAt: -1 });
    res.json(media);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
