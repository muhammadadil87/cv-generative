const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../authMiddleware');
const nodemailer = require('nodemailer');

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'muhammadadil5387@gmail.com';

// Configure nodemailer transporter if SMTP configured, or graceful logger
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    } catch (e) {
        console.warn('[Chat] Failed to initialize SMTP transporter:', e.message);
    }
}

async function sendAdminNotification(studentName, studentEmail, messageText, sessionId) {
    console.log(`\n======================================================`);
    console.log(`🔔 [LIVE CHAT ALERT] New message from student!`);
    console.log(`👤 Student: ${studentName} (${studentEmail})`);
    console.log(`💬 Message: "${messageText}"`);
    console.log(`📧 Target Admin Email: ${ADMIN_EMAIL}`);
    console.log(`🔗 Reply via Admin Portal: http://localhost:5000/admin.html`);
    console.log(`======================================================\n`);

    if (!transporter) {
        return; // Graceful skip if custom SMTP credentials not in .env yet
    }

    try {
        await transporter.sendMail({
            from: `"Student CV Portal" <${process.env.SMTP_USER}>`,
            to: ADMIN_EMAIL,
            subject: `🔔 New Live Chat Message from ${studentName}`,
            text: `You have received a new live chat message on Student CV Builder Portal!\n\nFrom: ${studentName} (${studentEmail})\nMessage: ${messageText}\n\nLog in to reply: https://cvgenerative.vercel.app/admin.html`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
                    <h2 style="color: #4f46e5; margin-top: 0;">💬 New Student Live Chat Message</h2>
                    <p style="font-size: 15px; color: #334155;">A student or visitor has initiated a conversation on your CV Builder portal:</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 0 0 8px 0;"><strong>Student Name:</strong> ${escapeHtml(studentName)}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Student Email:</strong> ${escapeHtml(studentEmail)}</p>
                        <p style="margin: 0;"><strong>Message:</strong></p>
                        <blockquote style="margin: 8px 0 0 0; padding-left: 12px; border-left: 3px solid #6366f1; color: #1e293b; font-style: italic;">
                            ${escapeHtml(messageText)}
                        </blockquote>
                    </div>
                    <a href="https://cvgenerative.vercel.app/admin.html" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
                        Open Admin Portal & Reply
                    </a>
                </div>
            `
        });
    } catch (err) {
        console.error('[Chat] Email send error:', err.message);
    }
}

function escapeHtml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 1. PUBLIC: Send a message from visitor/student (Works BEFORE and AFTER login)
router.post('/send', (req, res) => {
    try {
        const { session_id, name, email, message, user_id } = req.body;

        if (!session_id || !session_id.trim()) {
            return res.status(400).json({ error: 'Session ID is required.' });
        }
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        const cleanSessionId = session_id.trim();
        const cleanMsg = message.trim();
        const cleanName = (name && name.trim()) ? name.trim() : 'Student Visitor';
        const cleanEmail = (email && email.trim()) ? email.trim() : 'visitor@student.portal';

        // Check if thread exists
        let thread = db.prepare('SELECT id, visitor_name, visitor_email FROM chat_threads WHERE session_id = ?').get(cleanSessionId);

        if (!thread) {
            const info = db.prepare(`
                INSERT INTO chat_threads (session_id, user_id, visitor_name, visitor_email, last_message, last_message_at, unread_admin_count)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
            `).run(cleanSessionId, user_id || null, cleanName, cleanEmail, cleanMsg);
            thread = { id: info.lastInsertRowid, visitor_name: cleanName, visitor_email: cleanEmail };
        } else {
            // Update thread info if user supplied better name/email
            const updatedName = (cleanName !== 'Student Visitor') ? cleanName : thread.visitor_name;
            const updatedEmail = (cleanEmail !== 'visitor@student.portal') ? cleanEmail : thread.visitor_email;

            db.prepare(`
                UPDATE chat_threads 
                SET visitor_name = ?, visitor_email = ?, last_message = ?, last_message_at = CURRENT_TIMESTAMP, unread_admin_count = unread_admin_count + 1
                WHERE id = ?
            `).run(updatedName, updatedEmail, cleanMsg, thread.id);
        }

        // Insert message
        const msgInfo = db.prepare(`
            INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
            VALUES (?, 'student', ?, ?, CURRENT_TIMESTAMP)
        `).run(thread.id, cleanName, cleanMsg);

        // Async notify Admin via email
        sendAdminNotification(cleanName, cleanEmail, cleanMsg, cleanSessionId).catch(() => {});

        return res.status(201).json({
            success: true,
            message: 'Message delivered successfully.',
            message_id: msgInfo.lastInsertRowid,
            thread_id: thread.id
        });
    } catch (err) {
        console.error('Chat send error:', err);
        return res.status(500).json({ error: 'Failed to send message.' });
    }
});

// 2. PUBLIC: Get conversation message history for a visitor session
router.get('/messages/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required.' });
        }

        const thread = db.prepare('SELECT id, visitor_name, visitor_email, status FROM chat_threads WHERE session_id = ?').get(sessionId);

        if (!thread) {
            return res.json({ success: true, messages: [] });
        }

        // Mark unread for user as 0
        db.prepare('UPDATE chat_threads SET unread_user_count = 0 WHERE id = ?').run(thread.id);

        const messages = db.prepare(`
            SELECT id, sender_type, sender_name, message, created_at
            FROM chat_messages
            WHERE thread_id = ?
            ORDER BY id ASC
        `).all(thread.id);

        return res.json({
            success: true,
            thread,
            messages
        });
    } catch (err) {
        console.error('Chat get messages error:', err);
        return res.status(500).json({ error: 'Failed to retrieve messages.' });
    }
});

// 3. ADMIN: Get all chat threads
router.get('/admin/threads', authenticate, requireRole('admin'), (req, res) => {
    try {
        const threads = db.prepare(`
            SELECT t.*, 
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id) as total_messages
            FROM chat_threads t
            ORDER BY t.last_message_at DESC
        `).all();

        return res.json({
            success: true,
            threads
        });
    } catch (err) {
        console.error('Admin get threads error:', err);
        return res.status(500).json({ error: 'Failed to fetch chat threads.' });
    }
});

// 4. ADMIN: Get messages for a specific thread
router.get('/admin/threads/:threadId/messages', authenticate, requireRole('admin'), (req, res) => {
    try {
        const threadId = parseInt(req.params.threadId);
        if (!threadId) {
            return res.status(400).json({ error: 'Valid thread ID required.' });
        }

        const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(threadId);
        if (!thread) {
            return res.status(404).json({ error: 'Chat thread not found.' });
        }

        // Mark unread admin count to 0
        db.prepare('UPDATE chat_threads SET unread_admin_count = 0 WHERE id = ?').run(threadId);

        const messages = db.prepare(`
            SELECT id, sender_type, sender_name, message, created_at
            FROM chat_messages
            WHERE thread_id = ?
            ORDER BY id ASC
        `).all(threadId);

        return res.json({
            success: true,
            thread,
            messages
        });
    } catch (err) {
        console.error('Admin get thread messages error:', err);
        return res.status(500).json({ error: 'Failed to fetch thread messages.' });
    }
});

// 5. ADMIN: Send a reply to student
router.post('/admin/reply', authenticate, requireRole('admin'), (req, res) => {
    try {
        const { thread_id, message } = req.body;

        if (!thread_id || !message || !message.trim()) {
            return res.status(400).json({ error: 'Thread ID and message are required.' });
        }

        const cleanMsg = message.trim();
        const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(thread_id);
        if (!thread) {
            return res.status(404).json({ error: 'Chat thread not found.' });
        }

        const adminName = req.user.name || 'Muhammad Adil (Admin)';

        const msgInfo = db.prepare(`
            INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
            VALUES (?, 'admin', ?, ?, CURRENT_TIMESTAMP)
        `).run(thread_id, adminName, cleanMsg);

        // Update thread
        db.prepare(`
            UPDATE chat_threads 
            SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, unread_user_count = unread_user_count + 1
            WHERE id = ?
        `).run(cleanMsg, thread_id);

        return res.json({
            success: true,
            message: 'Reply sent successfully.',
            message_id: msgInfo.lastInsertRowid
        });
    } catch (err) {
        console.error('Admin reply error:', err);
        return res.status(500).json({ error: 'Failed to send reply.' });
    }
});

module.exports = router;
