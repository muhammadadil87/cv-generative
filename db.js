const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const fs = require('fs');

let dbPath = path.join(__dirname, 'database.sqlite');

// On Vercel serverless environment, the root filesystem is read-only, so use /tmp
if (process.env.VERCEL) {
    const tmpDbPath = path.join('/tmp', 'database.sqlite');
    try {
        if (!fs.existsSync(tmpDbPath) && fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, tmpDbPath);
        }
    } catch (e) {
        console.error('Error copying sqlite to /tmp on Vercel:', e);
    }
    dbPath = tmpDbPath;
}

const db = new Database(dbPath);

// Enable Foreign Keys
db.pragma('foreign_keys = ON');

function initDatabase() {
    // 1. Users Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            student_id TEXT,
            password_hash TEXT NOT NULL,
            password_plain TEXT,
            role TEXT NOT NULL DEFAULT 'student',
            status TEXT NOT NULL DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Ensure password_plain column exists in existing database
    try {
        db.exec("ALTER TABLE users ADD COLUMN password_plain TEXT;");
    } catch (e) {
        // Column already exists
    }

    // 2. StudentProfile / CV Metadata Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_profiles (
            user_id INTEGER PRIMARY KEY,
            nationality TEXT,
            phone TEXT,
            address TEXT,
            linkedin TEXT,
            photo_url TEXT,
            about_me TEXT,
            status TEXT DEFAULT 'Not Created',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 3. Education
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_education (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            qualification TEXT NOT NULL,
            specialization TEXT,
            institution TEXT NOT NULL,
            location TEXT,
            start_year TEXT,
            end_year TEXT,
            result TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 4. Work Experience
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_experience (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            job_title TEXT NOT NULL,
            organization TEXT NOT NULL,
            location TEXT,
            start_date TEXT,
            end_date TEXT,
            is_current INTEGER DEFAULT 0,
            responsibilities TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 5. Skills
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_skills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            skill_name TEXT NOT NULL,
            proficiency TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 6. Languages
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_languages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            language TEXT NOT NULL,
            is_mother_tongue INTEGER DEFAULT 0,
            listening TEXT,
            reading TEXT,
            spoken_production TEXT,
            spoken_interaction TEXT,
            writing TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 7. Digital Skills
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_digital_skills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            skill TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 8. Hobbies & Interests
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_hobbies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            hobby TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 9. References (Optional)
    db.exec(`
        CREATE TABLE IF NOT EXISTS cv_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            designation TEXT,
            organization TEXT,
            email TEXT,
            phone TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 10. Student & Visitor Feedback Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'unread',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 11. Live Student Chat Threads
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_threads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            visitor_name TEXT NOT NULL,
            visitor_email TEXT NOT NULL,
            last_message TEXT,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            unread_admin_count INTEGER DEFAULT 0,
            unread_user_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

    // 12. Live Student Chat Messages
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL, -- 'student' or 'admin'
            sender_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
        );
    `);

    // Ensure Initial Admin Account exists
    seedAdmin();
    seedInitialStudents();
}

function seedAdmin() {
    const adminUsername = 'adil5387';
    const adminEmail = (process.env.ADMIN_EMAIL || 'adil5387@university.edu').toLowerCase().trim();
    // Use exact raw password string if process.env gets stripped
    const adminPassword = (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 5) ? process.env.ADMIN_PASSWORD : 'Adil@ch@#$5387';
    const adminName = 'Muhammad Adil (Admin)';

    // Delete any old default admin accounts (e.g. admin@university.edu)
    db.prepare("DELETE FROM users WHERE email = 'admin@university.edu'").run();
    db.prepare("DELETE FROM users WHERE role = 'admin' AND email != ? AND student_id != ?").run(adminEmail, adminUsername);

    const hash = bcrypt.hashSync(adminPassword, 10);
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR student_id = ?').get(adminEmail, adminUsername);

    if (existing) {
        db.prepare(`
            UPDATE users 
            SET name = ?, email = ?, student_id = ?, password_hash = ?, password_plain = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(adminName, adminEmail, adminUsername, hash, adminPassword, existing.id);
        console.log(`[Database] Admin credentials updated for ${adminUsername} / ${adminEmail}`);
    } else {
        const insertStmt = db.prepare(`
            INSERT INTO users (name, email, student_id, password_hash, password_plain, role, status)
            VALUES (?, ?, ?, ?, ?, 'admin', 'active')
        `);
        insertStmt.run(adminName, adminEmail, adminUsername, hash, adminPassword);
        console.log(`[Database] Sole Admin account created for: ${adminUsername} / ${adminEmail}`);
    }
}

function seedInitialStudents() {
    // 1. Ensure Muhammad Adil (Student Account) exists
    const adilStudent = db.prepare("SELECT id FROM users WHERE email = 'adil@gmail.com'").get();
    if (!adilStudent) {
        const hash = bcrypt.hashSync('Adil@123', 10);
        db.prepare(`
            INSERT INTO users (id, name, email, student_id, password_hash, password_plain, role, status)
            VALUES (3, 'Muhammad Adil', 'adil@gmail.com', 'MBF24004331', ?, 'Adil@123', 'student', 'active')
        `).run(hash);
        db.prepare("INSERT OR IGNORE INTO cv_profiles (user_id, status) VALUES (3, 'Completed')").run();
    } else {
        db.prepare("UPDATE users SET password_plain = 'Adil@123' WHERE id = ?").run(adilStudent.id);
    }

    // 2. Ensure Muhammad Umar (Student Account) exists and is protected
    const umarStudent = db.prepare("SELECT id FROM users WHERE email LIKE '%umar%' OR name LIKE '%Umar%'").get();
    if (!umarStudent) {
        const hash = bcrypt.hashSync('123456', 10);
        const res = db.prepare(`
            INSERT INTO users (name, email, student_id, password_hash, password_plain, role, status)
            VALUES ('Muhammad Umar', 'umar@university.edu', 'STU2026Umar', ?, '123456', 'student', 'active')
        `).run(hash);
        const umarId = res.lastInsertRowid;
        db.prepare("INSERT OR IGNORE INTO cv_profiles (user_id, status) VALUES (?, 'Draft')").run(umarId);
        console.log(`[Database] Seeded student Muhammad Umar (ID: ${umarId})`);
    } else {
        db.prepare("UPDATE users SET password_plain = '123456' WHERE id = ?").run(umarStudent.id);
    }
}

initDatabase();

module.exports = db;
