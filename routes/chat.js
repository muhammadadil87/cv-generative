const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../authMiddleware');
const nodemailer = require('nodemailer');

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'muhammadadil5387@gmail.com';

// Configure nodemailer transporter if SMTP configured
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
        console.warn('[Chat] SMTP Transporter initialization note:', e.message);
    }
}

// Guaranteed Multi-Channel Admin Notification
async function sendAdminNotification(studentName, studentEmail, messageText, sessionId) {
    console.log(`\n======================================================`);
    console.log(`🔔 [LIVE CHAT NOTIFICATION] Priority message from student!`);
    console.log(`👤 Student: ${studentName} (${studentEmail})`);
    console.log(`💬 Message: "${messageText}"`);
    console.log(`📧 Target Admin Email: ${ADMIN_EMAIL}`);
    console.log(`🔗 Admin Live Console: https://cvgenerative.vercel.app/admin.html`);
    console.log(`======================================================\n`);

    // 1. Send via Cloud Webhook (FormSubmit) directly into muhammadadil5387@gmail.com inbox
    try {
        const cloudToken = 'e4c6cadf7979071f1268d4560e534af4';
        const cloudRes = await fetch(`https://formsubmit.co/ajax/${cloudToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://cvgenerative.vercel.app',
                'Referer': 'https://cvgenerative.vercel.app/'
            },
            body: JSON.stringify({
                _subject: `🚨 [Live Chat Alert] ${studentName} (${studentEmail}) wants to talk with Admin Muhammad Adil!`,
                'Student Name': studentName,
                'Original Email': studentEmail,
                _replyto: studentEmail,
                'Latest Message': messageText,
                'Session ID': sessionId,
                'Action Required': 'Please log in to Admin Portal to reply: https://cvgenerative.vercel.app/admin.html'
            })
        });
        const cloudData = await cloudRes.json();
        console.log('[Chat Alert] Cloud email dispatch status:', cloudData);
    } catch (cloudErr) {
        console.warn('[Chat Alert] Cloud webhook warning:', cloudErr.message);
    }

    // 2. Also send via Nodemailer if SMTP configured
    if (transporter) {
        try {
            await transporter.sendMail({
                from: `"Student CV Portal" <${process.env.SMTP_USER}>`,
                to: ADMIN_EMAIL,
                subject: `🔔 [Live Chat Alert] ${studentName} requested Admin assistance`,
                text: `New live chat message on Student CV Builder Portal!\n\nFrom: ${studentName} (${studentEmail})\nMessage: ${messageText}\n\nLog in to Admin Console: https://cvgenerative.vercel.app/admin.html`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <h2 style="color: #4f46e5; margin-top: 0;">💬 Live Chat Request from ${escapeHtml(studentName)}</h2>
                        <p style="font-size: 14px; color: #334155;">A visitor on your CV portal has asked to speak with Admin:</p>
                        <div style="background-color: #f8fafc; padding: 14px; border-radius: 8px; margin: 15px 0;">
                            <p style="margin: 0 0 6px 0;"><strong>Name:</strong> ${escapeHtml(studentName)}</p>
                            <p style="margin: 0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(studentEmail)}</p>
                            <p style="margin: 0 0 6px 0;"><strong>Message:</strong></p>
                            <blockquote style="margin: 0; padding-left: 10px; border-left: 3px solid #6366f1; color: #1e293b;">
                                ${escapeHtml(messageText)}
                            </blockquote>
                        </div>
                        <a href="https://cvgenerative.vercel.app/admin.html" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 13px;">
                            Open Admin Live Desk & Reply
                        </a>
                    </div>
                `
            });
            console.log('[Chat Alert] Nodemailer SMTP delivered successfully.');
        } catch (smtpErr) {
            console.error('[Chat Alert] SMTP send error:', smtpErr.message);
        }
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

        // Check if thread exists for this exact session
        let thread = db.prepare('SELECT id, visitor_name, visitor_email FROM chat_threads WHERE session_id = ?').get(cleanSessionId);

        if (!thread) {
            // Count total threads so unauthenticated visitors become Visitor #1, Visitor #2, etc.
            const countRow = db.prepare('SELECT COUNT(*) as count FROM chat_threads').get();
            const visitorNum = (countRow ? countRow.count : 0) + 1;

            let finalName = (name && name.trim() && name.trim() !== 'Student Visitor') ? name.trim() : `Visitor #${visitorNum}`;
            let finalEmail = (email && email.trim() && email.trim() !== 'visitor@student.portal') ? email.trim() : `visitor${visitorNum}@portal.guest`;

            const info = db.prepare(`
                INSERT INTO chat_threads (session_id, user_id, visitor_name, visitor_email, last_message, last_message_at, unread_admin_count)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
            `).run(cleanSessionId, user_id || null, finalName, finalEmail, cleanMsg);

            thread = { id: info.lastInsertRowid, visitor_name: finalName, visitor_email: finalEmail };
        } else {
            // Check if visitor is updating their name or if text contains their name/email
            let updatedName = thread.visitor_name;
            let updatedEmail = thread.visitor_email;

            if (name && name.trim() && name.trim() !== 'Student Visitor' && !name.startsWith('Visitor #')) {
                updatedName = name.trim();
            }
            if (email && email.trim() && email.includes('@') && !email.includes('@portal.guest')) {
                updatedEmail = email.trim();
            }

            // Simple auto-name extractor if visitor says "my name is Ali" or "I am Umar"
            const nameMatch = cleanMsg.match(/(?:my name is|i am|this is|call me)\s+([a-zA-Z\s]{2,25})/i);
            if (nameMatch && nameMatch[1] && updatedName.startsWith('Visitor #')) {
                updatedName = nameMatch[1].trim();
            }

            // Simple auto-email extractor
            const emailMatch = cleanMsg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch && emailMatch[1]) {
                updatedEmail = emailMatch[1].trim();
            }

            db.prepare(`
                UPDATE chat_threads 
                SET visitor_name = ?, visitor_email = ?, last_message = ?, last_message_at = CURRENT_TIMESTAMP, unread_admin_count = unread_admin_count + 1
                WHERE id = ?
            `).run(updatedName, updatedEmail, cleanMsg, thread.id);

            thread.visitor_name = updatedName;
            thread.visitor_email = updatedEmail;
        }

        // Insert Student Message into persistent conversation
        const msgInfo = db.prepare(`
            INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
            VALUES (?, 'student', ?, ?, CURRENT_TIMESTAMP)
        `).run(thread.id, thread.visitor_name, cleanMsg);

        // Check if student wants to speak with Admin:
        // Triggered by typing "1", "admin", "talk", "connect", or "help"
        const isRequestingAdmin = cleanMsg === '1' || 
                                  cleanMsg.toLowerCase().includes('admin') || 
                                  cleanMsg.toLowerCase().includes('connect') ||
                                  cleanMsg.toLowerCase().includes('talk with admin');

        let botReply = null;
        if (isRequestingAdmin) {
            botReply = `Connecting you with Admin (Muhammad Adil)... 🚀\n\nAn instant priority notification has been sent to Muhammad Adil's email (${ADMIN_EMAIL})! Please stay on this screen, he will join and reply to you directly in this chat shortly.`;

            // Insert automated bot reply into persistent conversation
            db.prepare(`
                INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
                VALUES (?, 'admin', 'Muhammad Adil (Live Support)', ?, CURRENT_TIMESTAMP)
            `).run(thread.id, botReply);

            // Update thread last message
            db.prepare(`
                UPDATE chat_threads 
                SET last_message = ?, last_message_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(botReply, thread.id);

            // Immediate email notification to Muhammad Adil
            sendAdminNotification(thread.visitor_name, thread.visitor_email, cleanMsg, cleanSessionId).catch(() => {});
        } else {
            // First time student sends a message:
            // Check how many messages exist in this thread
            const totalMsgs = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE thread_id = ?').get(thread.id).count;
            if (totalMsgs <= 2) {
                botReply = `Thank you for your message! 😊\n\nIf you would like to speak directly with Admin Muhammad Adil, simply reply with:\n👉 Press [ 1 ] or type 'Admin' to notify Muhammad Adil right now!`;

                db.prepare(`
                    INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
                    VALUES (?, 'admin', 'Muhammad Adil (Live Support)', ?, CURRENT_TIMESTAMP)
                `).run(thread.id, botReply);
            }

            // Also dispatch notification to email
            sendAdminNotification(thread.visitor_name, thread.visitor_email, cleanMsg, cleanSessionId).catch(() => {});
        }

        return res.status(201).json({
            success: true,
            message: 'Message delivered successfully.',
            message_id: msgInfo.lastInsertRowid,
            thread_id: thread.id,
            visitor_name: thread.visitor_name,
            bot_reply: botReply
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
