require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./config/logger');

const app = express();

// ✅ FIX: Use /tmp for writable storage on Vercel
const isVercel = process.env.VERCEL === '1';
['logs', 'uploads'].forEach(dir => {
  const p = isVercel
    ? path.join('/tmp', dir)
    : path.join(__dirname, '..', dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts' } }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// API Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
});

module.exports = app;
