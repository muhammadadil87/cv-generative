const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate, JWT_SECRET } = require('../authMiddleware');

// 1. Student Registration
router.post('/register', (req, res) => {
    try {
        const { name, email, student_id, password, confirm_password } = req.body;

        // Validation
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Full Name is required.' });
        }

        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email Address is required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = email.trim().toLowerCase();
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ error: 'Please provide a valid email address.' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        if (password !== confirm_password) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        // Check duplicate email
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
        }

        // Hash password
        const password_hash = bcrypt.hashSync(password, 10);
        const trimmedName = name.trim();
        const trimmedStudentId = student_id ? student_id.trim() : null;

        const insertUser = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO users (name, email, student_id, password_hash, role, status)
                VALUES (?, ?, ?, ?, 'student', 'active')
            `).run(trimmedName, normalizedEmail, trimmedStudentId, password_hash);

            const userId = result.lastInsertRowid;

            // Initialize default CV profile record
            db.prepare(`
                INSERT INTO cv_profiles (user_id, status)
                VALUES (?, 'Not Created')
            `).run(userId);

            return userId;
        });

        const newUserId = insertUser();

        // Generate JWT
        const token = jwt.sign(
            { id: newUserId, name: trimmedName, email: normalizedEmail, student_id: trimmedStudentId, role: 'student' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('cv_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.status(201).json({
            message: 'Registration successful!',
            token,
            user: {
                id: newUserId,
                name: trimmedName,
                email: normalizedEmail,
                student_id: trimmedStudentId,
                role: 'student'
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed due to server error.' });
    }
});

// 2. Login (Student & Admin)
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please enter both email and password.' });
        }

        const normalizedInput = email.trim().toLowerCase();
        // Allow login by email address OR username (student_id / admin username)
        const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(student_id) = ?').get(normalizedInput, normalizedInput);

        if (!user) {
            return res.status(401).json({ error: 'Invalid username/email or password.' });
        }

        const isMatch = bcrypt.compareSync(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Your account is deactivated. Contact administrator.' });
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email, student_id: user.student_id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('cv_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                student_id: user.student_id,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed due to server error.' });
    }
});

// 3. Logout
router.post('/logout', (req, res) => {
    res.clearCookie('cv_token');
    return res.json({ message: 'Logged out successfully.' });
});

// 4. Current User Session
router.get('/me', authenticate, (req, res) => {
    try {
        let cvStatus = 'Not Created';
        let lastUpdated = null;

        if (req.user.role === 'student') {
            const profile = db.prepare('SELECT status, updated_at FROM cv_profiles WHERE user_id = ?').get(req.user.id);
            if (profile) {
                cvStatus = profile.status || 'Not Created';
                lastUpdated = profile.updated_at;
            }
        }

        return res.json({
            user: req.user,
            cv_status: cvStatus,
            last_updated: lastUpdated
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error fetching session profile.' });
    }
});

module.exports = router;
