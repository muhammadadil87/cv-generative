const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../authMiddleware');

// 1. Submit Feedback (Public)
router.post('/', (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message / feedback cannot be empty.' });
        }

        const stmt = db.prepare(`
            INSERT INTO feedback (name, email, subject, message)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(
            name.trim(),
            email.trim().toLowerCase(),
            (subject || 'General Feedback').trim(),
            message.trim()
        );

        return res.status(201).json({
            success: true,
            message: 'Thank you! Your feedback has been successfully submitted and saved.'
        });
    } catch (err) {
        console.error('Feedback submit error:', err);
        return res.status(500).json({ error: 'Failed to submit feedback. Please try again later.' });
    }
});

// 2. Get All Feedback (Admin Only)
router.get('/', authenticate, requireRole('admin'), (req, res) => {
    try {
        const items = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
        return res.json({ success: true, feedback: items });
    } catch (err) {
        console.error('Feedback fetch error:', err);
        return res.status(500).json({ error: 'Failed to retrieve feedback.' });
    }
});

module.exports = router;
