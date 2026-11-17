const jwt = require('jsonwebtoken');
const db = require('./db');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-antigravity-2026';

function authenticate(req, res, next) {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.cv_token) {
        token = req.cookies.cv_token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        let user = db.prepare('SELECT id, name, email, student_id, role, status FROM users WHERE id = ?').get(decoded.id);

        // If not found by ID, try finding by email
        if (!user && decoded.email) {
            user = db.prepare('SELECT id, name, email, student_id, role, status FROM users WHERE LOWER(email) = ?').get(decoded.email.toLowerCase());
        }

        // Auto-recovery for Vercel ephemeral serverless environment
        if (!user && decoded.email) {
            try {
                const defaultPassHash = bcrypt.hashSync('Student@123', 10);
                const userName = decoded.name || 'Muhammad Umar';
                const userRole = decoded.role || 'student';
                const userStudentId = decoded.student_id || null;

                // Re-create user with their exact decoded ID so foreign keys match
                db.prepare(`
                    INSERT OR REPLACE INTO users (id, name, email, student_id, password_hash, role, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'active')
                `).run(decoded.id, userName, decoded.email.toLowerCase(), userStudentId, defaultPassHash, userRole);

                // Ensure cv_profiles record exists
                db.prepare(`
                    INSERT OR IGNORE INTO cv_profiles (user_id, status)
                    VALUES (?, 'Draft')
                `).run(decoded.id);

                user = db.prepare('SELECT id, name, email, student_id, role, status FROM users WHERE id = ?').get(decoded.id);
                console.log(`[Auto-Recovery] Successfully restored verified user: ${decoded.email} (ID: ${decoded.id})`);
            } catch (recoveryErr) {
                console.error('[Auto-Recovery Error]:', recoveryErr);
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'User account not found.' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth verification error:', err);
        return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (req.user.role !== role) {
            return res.status(403).json({ error: `Forbidden: Access restricted to ${role}s only.` });
        }
        next();
    };
}

module.exports = {
    authenticate,
    requireRole,
    JWT_SECRET
};
