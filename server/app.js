const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const parser = require('./multerCloud');
const cloudinary = require('./cloudinary');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({
  origin: '*', // Allow all origins (for development)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// -------------------- MONGODB CONNECTION --------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected successfully ✅"))
.catch(err => console.log("MongoDB connection error ❌", err));

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

// -------------------- PRICE LIST STORAGE --------------------
const PRICE_FILE = require('path').join(__dirname, 'priceList.json');
const fs = require('fs');
if (!fs.existsSync(PRICE_FILE)) {
  fs.writeFileSync(PRICE_FILE, JSON.stringify([
    { name: "Wedding Invitation Card", price: "₹300 – ₹1200 / piece" },
    { name: "Flex Printing", price: "₹15 – ₹100 per sq.ft" },
    { name: "Photo Frame (Glass + Wooden)", price: "₹200 – ₹950 per piece" },
    { name: "Number Plate", price: "₹150 – ₹450 per piece" },
    { name: "Reels / Video Editing", price: "₹200 – ₹1200 per video" }
  ], null, 2));
}

function loadPrices(){ return JSON.parse(fs.readFileSync(PRICE_FILE)); }
function savePrices(d){ fs.writeFileSync(PRICE_FILE, JSON.stringify(d, null,2)); }

// Anyone can view price list
app.get('/api/prices', (req,res) => res.json(loadPrices()));
// Only admin can update price list
app.put('/api/admin/prices', auth, (req,res) => {
  savePrices(req.body);
  res.json({ success: true });
});

// -------------------- AUTH --------------------
function auth(req,res,next){
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'No token'});
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch(e) {
    res.status(401).json({error:'Invalid token'});
  }
}

// Admin login
app.post('/api/admin/login', (req,res) => {
  const { password } = req.body;
  const ADMIN = process.env.ADMIN_PASS;
  if(password === ADMIN){
    const token = jwt.sign({admin:true}, process.env.JWT_SECRET || 'secret', {expiresIn:'8h'});
    return res.json({ token });
  }
  return res.status(401).json({ error:'Invalid password' });
});

// -------------------- UPLOAD TO CLOUDINARY & SAVE TO MONGO --------------------
app.post('/api/admin/upload', auth, parser.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { category, title, price } = req.body;

  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'keshvam-uploads', resource_type: 'auto' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
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
      title: title || "",
      price: price || ""
    });

    await newUpload.save();

    res.json({ success: true, item: newUpload });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// -------------------- DELETE --------------------
app.delete("/delete/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const file = await Upload.findById(id);

    if (!file) return res.status(404).json({ error: "File not found" });

    const resourceType = file.mimeType.startsWith("video") ? "video" : "image";
    await cloudinary.uploader.destroy(file.public_id, { resource_type: resourceType });
    await Upload.findByIdAndDelete(id);

    res.json({ message: "Deleted successfully ✅" });
  } catch (error) {
    console.log("❌ Delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- MEDIA LIST --------------------
app.get('/api/media', async (req,res) => {
  try {
    const media = await Upload.find().sort({ uploadedAt: -1 });
    res.json(media);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- HEALTH CHECK --------------------
app.get('/api/health', (req,res) => res.json({ok:true}));

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 5000;
app.listen(5000, '0.0.0.0', () => console.log("Server running on port 5000"));

