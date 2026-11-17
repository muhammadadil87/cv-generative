const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireRole } = require('../authMiddleware');
const nodemailer = require('nodemailer');

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'muhammadadil5387@gmail.com';
const CLOUD_STORE_ID = 'ff808181a09d98f701a1e9343be074fd';

// Cloud Store Helper for seamless cross-serverless persistence
async function getCloudStore() {
    try {
        const res = await fetch(`https://api.restful-api.dev/objects/${CLOUD_STORE_ID}`);
        if (res.ok) {
            const data = await res.json();
            return data.data || { threads: {}, messages: {} };
        }
    } catch (e) {
        console.warn('[CloudStore] Read warning:', e.message);
    }
    return { threads: {}, messages: {} };
}

async function updateCloudStore(store) {
    try {
        await fetch(`https://api.restful-api.dev/objects/${CLOUD_STORE_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'cv_portal_chat_store',
                data: store
            })
        });
    } catch (e) {
        console.warn('[CloudStore] Write warning:', e.message);
    }
}

// Nodemailer transporter if SMTP configured
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

// Multi-Channel Instant Admin Notification
async function sendAdminNotification(studentName, studentEmail, messageText, sessionId) {
    const liveTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
    console.log(`\n======================================================`);
    console.log(`🔔 [LIVE CHAT NOTIFICATION] Priority message from student!`);
    console.log(`👤 Student: ${studentName} (${studentEmail})`);
    console.log(`💬 Message: "${messageText}"`);
    console.log(`⏰ Time: ${liveTime}`);
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
                _subject: `🚨 [Live Chat Alert] ${studentName} wants to talk with Admin Muhammad Adil!`,
                'Student Name': studentName,
                'Original Email': studentEmail,
                _replyto: studentEmail,
                'Message / Request': messageText,
                'Exact Time': liveTime,
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
                text: `New live chat message on Student CV Builder Portal!\n\nFrom: ${studentName} (${studentEmail})\nMessage: ${messageText}\nTime: ${liveTime}\n\nLog in to Admin Console: https://cvgenerative.vercel.app/admin.html`
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
router.post('/send', async (req, res) => {
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
        const liveIsoTime = new Date().toISOString();

        // 1. Check or create SQLite thread
        let thread = db.prepare('SELECT id, visitor_name, visitor_email FROM chat_threads WHERE session_id = ?').get(cleanSessionId);

        if (!thread) {
            const countRow = db.prepare('SELECT COUNT(*) as count FROM chat_threads').get();
            const visitorNum = (countRow ? countRow.count : 0) + 1;

            let finalName = (name && name.trim() && name.trim() !== 'Student Visitor') ? name.trim() : `Visitor #${visitorNum}`;
            let finalEmail = (email && email.trim() && email.trim() !== 'visitor@student.portal') ? email.trim() : `visitor${visitorNum}@portal.guest`;

            const info = db.prepare(`
                INSERT INTO chat_threads (session_id, user_id, visitor_name, visitor_email, last_message, last_message_at, unread_admin_count)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `).run(cleanSessionId, user_id || null, finalName, finalEmail, cleanMsg, liveIsoTime);

            thread = { id: info.lastInsertRowid, visitor_name: finalName, visitor_email: finalEmail };
        } else {
            let updatedName = thread.visitor_name;
            let updatedEmail = thread.visitor_email;

            if (name && name.trim() && name.trim() !== 'Student Visitor' && !name.startsWith('Visitor #')) {
                updatedName = name.trim();
            }
            if (email && email.trim() && email.includes('@') && !email.includes('@portal.guest')) {
                updatedEmail = email.trim();
            }

            db.prepare(`
                UPDATE chat_threads 
                SET visitor_name = ?, visitor_email = ?, last_message = ?, last_message_at = ?, unread_admin_count = unread_admin_count + 1
                WHERE id = ?
            `).run(updatedName, updatedEmail, cleanMsg, liveIsoTime, thread.id);

            thread.visitor_name = updatedName;
            thread.visitor_email = updatedEmail;
        }

        // Insert Student Message into SQLite
        const msgInfo = db.prepare(`
            INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
            VALUES (?, 'student', ?, ?, ?)
        `).run(thread.id, thread.visitor_name, cleanMsg, liveIsoTime);

        // Check if student wants to speak with Admin (Press 1 / Admin)
        const isRequestingAdmin = cleanMsg === '1' || 
                                  cleanMsg.toLowerCase().includes('admin') || 
                                  cleanMsg.toLowerCase().includes('connect') ||
                                  cleanMsg.toLowerCase().includes('talk with admin');

        let botReply = null;
        if (isRequestingAdmin) {
            botReply = `Connecting you with Admin (Muhammad Adil)... 🚀\n\nAn instant priority notification has been sent to Muhammad Adil's email (${ADMIN_EMAIL})! Please stay on this screen, he will join and reply to you directly in this chat shortly.`;

            db.prepare(`
                INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
                VALUES (?, 'admin', 'Muhammad Adil (Live Support)', ?, ?)
            `).run(thread.id, botReply, new Date().toISOString());

            db.prepare(`
                UPDATE chat_threads 
                SET last_message = ?, last_message_at = ?
                WHERE id = ?
            `).run(botReply, new Date().toISOString(), thread.id);

            sendAdminNotification(thread.visitor_name, thread.visitor_email, cleanMsg, cleanSessionId).catch(() => {});
        } else {
            sendAdminNotification(thread.visitor_name, thread.visitor_email, cleanMsg, cleanSessionId).catch(() => {});
        }

        // Async Cloud Sync so message NEVER disappears across any serverless container
        (async () => {
            try {
                const store = await getCloudStore();
                if (!store.threads) store.threads = {};
                if (!store.messages) store.messages = {};

                store.threads[cleanSessionId] = {
                    id: thread.id,
                    session_id: cleanSessionId,
                    visitor_name: thread.visitor_name,
                    visitor_email: thread.visitor_email,
                    last_message: botReply || cleanMsg,
                    last_message_at: liveIsoTime,
                    unread_admin_count: 1
                };

                if (!store.messages[cleanSessionId]) store.messages[cleanSessionId] = [];
                store.messages[cleanSessionId].push({
                    id: msgInfo.lastInsertRowid,
                    sender_type: 'student',
                    sender_name: thread.visitor_name,
                    message: cleanMsg,
                    created_at: liveIsoTime
                });

                if (botReply) {
                    store.messages[cleanSessionId].push({
                        id: Date.now(),
                        sender_type: 'admin',
                        sender_name: 'Muhammad Adil (Live Support)',
                        message: botReply,
                        created_at: new Date().toISOString()
                    });
                }

                await updateCloudStore(store);
            } catch (syncErr) {
                console.warn('[Cloud Sync Error]:', syncErr.message);
            }
        })();

        return res.status(201).json({
            success: true,
            message: 'Message delivered successfully.',
            message_id: msgInfo.lastInsertRowid,
            thread_id: thread.id,
            visitor_name: thread.visitor_name,
            created_at: liveIsoTime,
            bot_reply: botReply
        });
    } catch (err) {
        console.error('Chat send error:', err);
        return res.status(500).json({ error: 'Failed to send message.' });
    }
});

// 2. PUBLIC: Get conversation message history for a visitor session
router.get('/messages/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required.' });
        }

        // Try SQLite first
        let thread = db.prepare('SELECT id, visitor_name, visitor_email, status FROM chat_threads WHERE session_id = ?').get(sessionId);
        let messages = [];

        if (thread) {
            db.prepare('UPDATE chat_threads SET unread_user_count = 0 WHERE id = ?').run(thread.id);
            messages = db.prepare(`
                SELECT id, sender_type, sender_name, message, created_at
                FROM chat_messages
                WHERE thread_id = ?
                ORDER BY id ASC
            `).all(thread.id);
        }

        // If SQLite messages is empty, restore from cloud store!
        if (messages.length === 0) {
            const store = await getCloudStore();
            if (store.messages && store.messages[sessionId]) {
                messages = store.messages[sessionId];
                if (store.threads && store.threads[sessionId]) {
                    thread = store.threads[sessionId];
                }
            }
        }

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

// 3. ADMIN: Get all chat threads (Merges SQLite + Cloud Store)
router.get('/admin/threads', authenticate, requireRole('admin'), async (req, res) => {
    try {
        let threads = db.prepare(`
            SELECT t.*, 
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id) as total_messages
            FROM chat_threads t
            ORDER BY t.last_message_at DESC
        `).all();

        // Merge from cloud store so Admin NEVER sees empty threads even after cold restart
        try {
            const store = await getCloudStore();
            if (store.threads) {
                const cloudThreadList = Object.values(store.threads);
                cloudThreadList.forEach(ct => {
                    const exists = threads.some(t => t.session_id === ct.session_id);
                    if (!exists) {
                        threads.push(ct);
                    }
                });
            }
        } catch (e) {}

        // Sort descending by last message time
        threads.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

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
router.get('/admin/threads/:threadId/messages', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const threadId = parseInt(req.params.threadId);
        if (!threadId) {
            return res.status(400).json({ error: 'Valid thread ID required.' });
        }

        let thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(threadId);
        let messages = [];

        if (thread) {
            db.prepare('UPDATE chat_threads SET unread_admin_count = 0 WHERE id = ?').run(threadId);
            messages = db.prepare(`
                SELECT id, sender_type, sender_name, message, created_at
                FROM chat_messages
                WHERE thread_id = ?
                ORDER BY id ASC
            `).all(threadId);
        }

        // Cloud fallback
        if (messages.length === 0 && thread && thread.session_id) {
            const store = await getCloudStore();
            if (store.messages && store.messages[thread.session_id]) {
                messages = store.messages[thread.session_id];
            }
        }

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
router.post('/admin/reply', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { thread_id, message } = req.body;

        if (!thread_id || !message || !message.trim()) {
            return res.status(400).json({ error: 'Thread ID and message are required.' });
        }

        const cleanMsg = message.trim();
        const liveIsoTime = new Date().toISOString();
        const adminName = req.user.name || 'Muhammad Adil (Admin)';

        const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(thread_id);
        if (!thread) {
            return res.status(404).json({ error: 'Chat thread not found.' });
        }

        const msgInfo = db.prepare(`
            INSERT INTO chat_messages (thread_id, sender_type, sender_name, message, created_at)
            VALUES (?, 'admin', ?, ?, ?)
        `).run(thread_id, adminName, cleanMsg, liveIsoTime);

        db.prepare(`
            UPDATE chat_threads 
            SET last_message = ?, last_message_at = ?, unread_user_count = unread_user_count + 1
            WHERE id = ?
        `).run(cleanMsg, liveIsoTime, thread_id);

        // Async update cloud store
        (async () => {
            try {
                const store = await getCloudStore();
                if (store.messages && store.messages[thread.session_id]) {
                    store.messages[thread.session_id].push({
                        id: msgInfo.lastInsertRowid,
                        sender_type: 'admin',
                        sender_name: adminName,
                        message: cleanMsg,
                        created_at: liveIsoTime
                    });
                }
                if (store.threads && store.threads[thread.session_id]) {
                    store.threads[thread.session_id].last_message = cleanMsg;
                    store.threads[thread.session_id].last_message_at = liveIsoTime;
                }
                await updateCloudStore(store);
            } catch (e) {}
        })();

        return res.json({
            success: true,
            message: 'Reply sent successfully.',
            message_id: msgInfo.lastInsertRowid,
            created_at: liveIsoTime
        });
    } catch (err) {
        console.error('Admin reply error:', err);
        return res.status(500).json({ error: 'Failed to send reply.' });
    }
});

module.exports = router;
