const jwt = require('jsonwebtoken');
const db = require('./db');

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
        const user = db.prepare('SELECT id, name, email, student_id, role, status FROM users WHERE id = ?').get(decoded.id);

        if (!user) {
            return res.status(401).json({ error: 'User account not found.' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
        }

        req.user = user;
        next();
    } catch (err) {
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
