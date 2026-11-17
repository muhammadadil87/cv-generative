const express = require('express');
const cors = require('cors');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
const uploadsPath = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public/uploads');
app.use('/uploads', express.static(uploadsPath));

// API Routes
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
