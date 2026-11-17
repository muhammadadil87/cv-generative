const db = require('./db');
const bcrypt = require('bcryptjs');

const USER_STORE_ID = 'ff808181a09d98f701a1e95bc45c777e';
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 2500; // sync at most once every 2.5 seconds to balance live updates with speed

async function getCloudUserStore() {
    try {
        const res = await fetch(`https://api.restful-api.dev/objects/${USER_STORE_ID}`);
        if (res.ok) {
            const json = await res.json();
            return json.data || { users: {} };
        }
    } catch (e) {
        console.warn('[UserCloudStore] Read error:', e.message);
    }
    return { users: {} };
}

async function saveCloudUserStore(store) {
    try {
        await fetch(`https://api.restful-api.dev/objects/${USER_STORE_ID}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: store
            })
        });
        console.log('[UserCloudStore] Cloud store updated successfully.');
    } catch (e) {
        console.warn('[UserCloudStore] Write error:', e.message);
    }
}

// Sync all users and CV states from Cloud store into local SQLite
async function syncUserOverrides(force = false) {
    const now = Date.now();
    if (!force && (now - lastSyncTime < SYNC_INTERVAL_MS)) {
        return;
    }
    lastSyncTime = now;

    try {
        const store = await getCloudUserStore();
        if (!store || !store.users) return;

        for (const [emailKey, uData] of Object.entries(store.users)) {
            const email = emailKey.toLowerCase().trim();
            const existing = db.prepare('SELECT id, status, password_plain FROM users WHERE LOWER(email) = ?').get(email);

            if (existing) {
                // If status, name or password differs, update local DB
                const newStatus = uData.status || existing.status;
                const newPlain = uData.password_plain || existing.password_plain;
                const newHash = uData.password_plain ? bcrypt.hashSync(uData.password_plain, 10) : null;

                if (newHash) {
                    db.prepare(`
                        UPDATE users 
                        SET status = ?, password_plain = ?, password_hash = ?, 
                            name = COALESCE(?, name), student_id = COALESCE(?, student_id),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(newStatus, newPlain, newHash, uData.name || null, uData.student_id || null, existing.id);
                } else {
                    db.prepare(`
                        UPDATE users 
                        SET status = ?, password_plain = ?, 
                            name = COALESCE(?, name), student_id = COALESCE(?, student_id),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(newStatus, newPlain, uData.name || null, uData.student_id || null, existing.id);
                }

                // Also update CV status, phone, nationality in cv_profiles
                if (uData.cv_status || uData.phone || uData.nationality) {
                    db.prepare(`
                        UPDATE cv_profiles
                        SET status = COALESCE(?, status),
                            phone = COALESCE(?, phone),
                            nationality = COALESCE(?, nationality)
                        WHERE user_id = ?
                    `).run(uData.cv_status || null, uData.phone || null, uData.nationality || null, existing.id);
                }
            } else if (uData.name) {
                // User exists in cloud but not in this SQLite container; recreate permanently!
                try {
                    const pass = uData.password_plain || '123456';
                    const hash = bcrypt.hashSync(pass, 10);
                    const res = db.prepare(`
                        INSERT INTO users (name, email, student_id, password_hash, password_plain, role, status, created_at)
                        VALUES (?, ?, ?, ?, ?, 'student', ?, COALESCE(?, CURRENT_TIMESTAMP))
                    `).run(
                        uData.name,
                        email,
                        uData.student_id || null,
                        hash,
                        pass,
                        uData.status || 'active',
                        uData.created_at || null
                    );

                    const newId = res.lastInsertRowid;
                    db.prepare(`
                        INSERT OR REPLACE INTO cv_profiles (user_id, status, phone, nationality, updated_at)
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(
                        newId,
                        uData.cv_status || 'Draft',
                        uData.phone || null,
                        uData.nationality || null
                    );
                    console.log(`[UserCloudStore] Recreated student ${email} from cloud (ID: ${newId})`);
                } catch (e) {
                    // Ignore duplicate key race conditions
                }
            }
        }
    } catch (e) {
        console.warn('[UserCloudStore] sync error:', e.message);
    }
}

// Record new registered student to cloud store (called on signup)
async function registerStudentCloud(student) {
    if (!student || !student.email) return;
    const cleanEmail = student.email.toLowerCase().trim();

    try {
        const store = await getCloudUserStore();
        if (!store.users) store.users = {};
        store.users[cleanEmail] = {
            name: student.name || 'Student User',
            student_id: student.student_id || null,
            password_plain: student.password_plain || '123456',
            status: 'active',
            cv_status: 'Draft',
            phone: '',
            nationality: '',
            created_at: new Date().toISOString()
        };
        await saveCloudUserStore(store);
        lastSyncTime = Date.now();
        console.log(`[UserCloudStore] Registered student ${cleanEmail} to cloud.`);
    } catch (e) {
        console.warn('[UserCloudStore] registerStudent error:', e.message);
    }
}

// Update CV profile status, phone, nationality in cloud
async function saveCvCloud(email, cvData = {}) {
    if (!email) return;
    const cleanEmail = email.toLowerCase().trim();

    try {
        const store = await getCloudUserStore();
        if (!store.users) store.users = {};
        if (!store.users[cleanEmail]) store.users[cleanEmail] = {};

        if (cvData.cv_status) store.users[cleanEmail].cv_status = cvData.cv_status;
        if (cvData.phone) store.users[cleanEmail].phone = cvData.phone;
        if (cvData.nationality) store.users[cleanEmail].nationality = cvData.nationality;
        if (cvData.name) store.users[cleanEmail].name = cvData.name;

        await saveCloudUserStore(store);
        lastSyncTime = Date.now();
    } catch (e) {
        console.warn('[UserCloudStore] saveCvCloud error:', e.message);
    }
}

// Update student active/inactive status across all containers
async function setStudentStatusCloud(email, status) {
    if (!email) return;
    const cleanEmail = email.toLowerCase().trim();

    // 1. Update local SQLite first
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?').run(status, cleanEmail);

    // 2. Update cloud store
    try {
        const store = await getCloudUserStore();
        if (!store.users) store.users = {};
        if (!store.users[cleanEmail]) store.users[cleanEmail] = {};
        store.users[cleanEmail].status = status;
        await saveCloudUserStore(store);
        lastSyncTime = Date.now();
    } catch (e) {
        console.warn('[UserCloudStore] setStudentStatus error:', e.message);
    }
}

// Update student details and password across all containers
async function updateStudentDetailsCloud(email, details) {
    if (!email) return;
    const cleanEmail = email.toLowerCase().trim();

    try {
        const store = await getCloudUserStore();
        if (!store.users) store.users = {};
        if (!store.users[cleanEmail]) store.users[cleanEmail] = {};

        if (details.status) store.users[cleanEmail].status = details.status;
        if (details.password_plain) store.users[cleanEmail].password_plain = details.password_plain;
        if (details.name) store.users[cleanEmail].name = details.name;
        if (details.student_id) store.users[cleanEmail].student_id = details.student_id;

        // If email changed, re-key under new email
        if (details.newEmail && details.newEmail.toLowerCase() !== cleanEmail) {
            const newEmailKey = details.newEmail.toLowerCase().trim();
            store.users[newEmailKey] = { ...store.users[cleanEmail] };
            delete store.users[cleanEmail];
        }

        await saveCloudUserStore(store);
        lastSyncTime = Date.now();
    } catch (e) {
        console.warn('[UserCloudStore] updateStudentDetails error:', e.message);
    }
}

// Delete student permanently from cloud store
async function deleteStudentCloud(email) {
    if (!email) return;
    const cleanEmail = email.toLowerCase().trim();

    try {
        const store = await getCloudUserStore();
        if (store.users && store.users[cleanEmail]) {
            delete store.users[cleanEmail];
            await saveCloudUserStore(store);
            lastSyncTime = Date.now();
            console.log(`[UserCloudStore] Deleted student ${cleanEmail} from cloud.`);
        }
    } catch (e) {
        console.warn('[UserCloudStore] deleteStudentCloud error:', e.message);
    }
}

module.exports = {
    syncUserOverrides,
    registerStudentCloud,
    saveCvCloud,
    setStudentStatusCloud,
    updateStudentDetailsCloud,
    deleteStudentCloud
};
