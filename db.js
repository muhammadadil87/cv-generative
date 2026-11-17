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
            role TEXT NOT NULL DEFAULT 'student',
            status TEXT NOT NULL DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

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

    // Ensure Initial Admin Account exists
    seedAdmin();
}

function seedAdmin() {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@university.edu').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';

    const checkStmt = db.prepare('SELECT id, role FROM users WHERE email = ?');
    const existing = checkStmt.get(adminEmail);

    if (!existing) {
        const hash = bcrypt.hashSync(adminPassword, 10);
        const insertStmt = db.prepare(`
            INSERT INTO users (name, email, password_hash, role, status)
            VALUES (?, ?, ?, 'admin', 'active')
        `);
        insertStmt.run(adminName, adminEmail, hash);
        console.log(`[Database] Initial Admin account created: ${adminEmail}`);
    } else if (existing.role !== 'admin') {
        db.prepare('UPDATE users SET role = "admin" WHERE id = ?').run(existing.id);
        console.log(`[Database] User ${adminEmail} promoted to Admin.`);
    }
}

initDatabase();

module.exports = db;
