const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../authMiddleware');
const { getStudentCvData } = require('./cv');

// Enforce admin role for all routes in this router
router.use(authenticate, requireRole('admin'));

// 1. Admin Dashboard Stats
router.get('/stats', (req, res) => {
    try {
        const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get().count;
        const totalActive = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND status = 'active'").get().count;
        const totalCompletedCv = db.prepare("SELECT COUNT(*) as count FROM cv_profiles WHERE status = 'Completed'").get().count;
        const totalDraftCv = db.prepare("SELECT COUNT(*) as count FROM cv_profiles WHERE status = 'Draft'").get().count;

        res.json({
            total_students: totalStudents,
            active_students: totalActive,
            completed_cvs: totalCompletedCv,
            draft_cvs: totalDraftCv,
            total_cvs_started: totalCompletedCv + totalDraftCv
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
    }
});

// 2. Student List with Search and Filter
router.get('/students', (req, res) => {
    try {
        const { search = '', status = 'all' } = req.query;
        let query = `
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.student_id, 
                u.status as account_status, 
                u.created_at as registered_at,
                p.status as cv_status,
                p.updated_at as cv_updated_at
            FROM users u
            LEFT JOIN cv_profiles p ON u.id = p.user_id
            WHERE u.role = 'student'
        `;
        const params = [];

        if (status !== 'all') {
            query += ` AND u.status = ?`;
            params.push(status);
        }

        if (search.trim()) {
            const term = `%${search.trim()}%`;
            query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.student_id LIKE ?)`;
            params.push(term, term, term);
        }

        query += ` ORDER BY u.created_at DESC`;

        const students = db.prepare(query).all(...params);
        res.json(students);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Failed to fetch student directory.' });
    }
});

// 3. View individual student CV
router.get('/students/:id', (req, res) => {
    try {
        const studentId = parseInt(req.params.id, 10);
        const cvData = getStudentCvData(studentId);
        if (!cvData) {
            return res.status(404).json({ error: 'Student not found.' });
        }
        res.json(cvData);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching student CV.' });
    }
});

// 4. Toggle Student Account Status (Active/Deactive)
router.patch('/students/:id/status', (req, res) => {
    try {
        const studentId = parseInt(req.params.id, 10);
        const { status } = req.body;

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value.' });
        }

        const student = db.prepare("SELECT id, role FROM users WHERE id = ? AND role = 'student'").get(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Student account not found.' });
        }

        db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, studentId);
        res.json({ message: `Student account marked as ${status}.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update student account status.' });
    }
});

// 5. Delete Student Account (Safeguard)
router.delete('/students/:id', (req, res) => {
    try {
        const studentId = parseInt(req.params.id, 10);
        const student = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'student'").get(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Student account not found.' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
        res.json({ message: `Student ${student.name} deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete student record.' });
    }
});

// 6. Export Students to CSV
router.get('/export/csv', (req, res) => {
    try {
        const students = db.prepare(`
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.student_id, 
                u.status as account_status, 
                u.created_at as registered_at,
                p.nationality,
                p.phone,
                p.status as cv_status,
                p.updated_at as cv_updated_at
            FROM users u
            LEFT JOIN cv_profiles p ON u.id = p.user_id
            WHERE u.role = 'student'
            ORDER BY u.id ASC
        `).all();

        const headers = ['ID', 'Full Name', 'Email', 'Student ID', 'Account Status', 'Registered At', 'Nationality', 'Phone', 'CV Status', 'CV Last Updated'];
        const csvRows = [headers.join(',')];

        students.forEach(s => {
            const row = [
                s.id,
                `"${(s.name || '').replace(/"/g, '""')}"`,
                `"${(s.email || '').replace(/"/g, '""')}"`,
                `"${(s.student_id || '').replace(/"/g, '""')}"`,
                s.account_status,
                s.registered_at,
                `"${(s.nationality || '').replace(/"/g, '""')}"`,
                `"${(s.phone || '').replace(/"/g, '""')}"`,
                s.cv_status || 'Not Created',
                s.cv_updated_at || 'Never'
            ];
            csvRows.push(row.join(','));
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="students_cv_registry.csv"');
        res.send(csvRows.join('\r\n'));
    } catch (err) {
        res.status(500).send('Error generating CSV export.');
    }
});

module.exports = router;
