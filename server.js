const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Ensure DB is initialized
require('./db');

const authRoutes = require('./routes/auth');
const { router: cvRoutes } = require('./routes/cv');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Hide Express signature
app.disable('x-powered-by');

// Security: HTTP headers protection against XSS, clickjacking, MIME sniffing
app.use(helmet({
    contentSecurityPolicy: false, // Allow CDN resources (Tailwind, FontAwesome, html2pdf)
    crossOriginEmbedderPolicy: false
}));

// Security: Rate limiting to prevent Brute-Force & DDoS attacks
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 25, // Max 25 login/register attempts per IP in 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. For security reasons, please wait 15 minutes.' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // Max 300 requests per 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Prevent oversized memory payload attacks
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
const uploadsPath = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public/uploads');
app.use('/uploads', express.static(uploadsPath));

// API Routes with Security Limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/admin', adminRoutes);

// Fallback to home / 404
app.use((req, res) => {
    // If requesting api that wasn't found
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start Server (when not run by serverless runner)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🚀 Student CV Builder & Admin Portal is running!`);
        console.log(`🔗 Local URL: http://localhost:${PORT}`);
        console.log(`🔑 Default Admin: ${process.env.ADMIN_EMAIL || 'admin@university.edu'}`);
        console.log(`=======================================================`);
    });
}

module.exports = app;
