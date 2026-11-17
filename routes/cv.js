const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup photo upload directory (use /tmp on Vercel)
const uploadDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files (JPEG, PNG, WEBP) are allowed!'));
    }
});

// Photo upload endpoint
router.post('/upload-photo', authenticate, upload.single('photo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded.' });
        }
        const photoUrl = '/uploads/' + req.file.filename;
        db.prepare('UPDATE cv_profiles SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .run(photoUrl, req.user.id);
        res.json({ photo_url: photoUrl });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload photo.' });
    }
});

// Delete / remove photo endpoint
router.delete('/remove-photo', authenticate, (req, res) => {
    try {
        db.prepare('UPDATE cv_profiles SET photo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .run(req.user.id);
        res.json({ message: 'Photo removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove photo.' });
    }
});

// GET Student CV (Logged in student only)
router.get('/', authenticate, (req, res) => {
    try {
        const userId = req.user.id;
        const cvData = getStudentCvData(userId);
        res.json(cvData);
    } catch (err) {
        console.error('Error fetching CV:', err);
        res.status(500).json({ error: 'Failed to retrieve CV data.' });
    }
});

// SAVE / UPDATE Student CV
router.post('/save', authenticate, (req, res) => {
    try {
        const userId = req.user.id;
        const {
            personal_info = {},
            about_me = '',
            education = [],
            experience = [],
            skills = [],
            languages = [],
            digital_skills = [],
            hobbies = [],
            references = [],
            is_draft = true
        } = req.body;

        const status = is_draft ? 'Draft' : 'Completed';

        const saveTransaction = db.transaction(() => {
            // 1. Update personal info / profile
            const existingProfile = db.prepare('SELECT user_id, photo_url FROM cv_profiles WHERE user_id = ?').get(userId);
            let photoUrl = existingProfile ? existingProfile.photo_url : null;
            if (personal_info.photo_url !== undefined) {
                photoUrl = personal_info.photo_url || null;
            }

            if (existingProfile) {
                db.prepare(`
                    UPDATE cv_profiles
                    SET nationality = ?, phone = ?, address = ?, linkedin = ?, photo_url = ?, about_me = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(
                    personal_info.nationality || null,
                    personal_info.phone || null,
                    personal_info.address || null,
                    personal_info.linkedin || null,
                    photoUrl,
                    about_me || null,
                    status,
                    userId
                );
            } else {
                db.prepare(`
                    INSERT INTO cv_profiles (user_id, nationality, phone, address, linkedin, photo_url, about_me, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(
                    userId,
                    personal_info.nationality || null,
                    personal_info.phone || null,
                    personal_info.address || null,
                    personal_info.linkedin || null,
                    photoUrl,
                    about_me || null,
                    status
                );
            }

            // Also update student's name if modified in personal_info
            if (personal_info.name && personal_info.name.trim()) {
                db.prepare('UPDATE users SET name = ? WHERE id = ?').run(personal_info.name.trim(), userId);
            }

            // 2. Education (Replace entries)
            db.prepare('DELETE FROM cv_education WHERE user_id = ?').run(userId);
            const insertEdu = db.prepare(`
                INSERT INTO cv_education (user_id, qualification, specialization, institution, location, start_year, end_year, result, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            education.forEach((item, index) => {
                if (item.qualification || item.institution) {
                    insertEdu.run(
                        userId,
                        item.qualification || '',
                        item.specialization || '',
                        item.institution || '',
                        item.location || '',
                        item.start_year || '',
                        item.end_year || '',
                        item.result || '',
                        index
                    );
                }
            });

            // 3. Work Experience (Replace entries)
            db.prepare('DELETE FROM cv_experience WHERE user_id = ?').run(userId);
            const insertExp = db.prepare(`
                INSERT INTO cv_experience (user_id, job_title, organization, location, start_date, end_date, is_current, responsibilities, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            experience.forEach((item, index) => {
                if (item.job_title || item.organization) {
                    const respString = Array.isArray(item.responsibilities) ? JSON.stringify(item.responsibilities) : (item.responsibilities || '');
                    insertExp.run(
                        userId,
                        item.job_title || '',
                        item.organization || '',
                        item.location || '',
                        item.start_date || '',
                        item.end_date || '',
                        item.is_current ? 1 : 0,
                        respString,
                        index
                    );
                }
            });

            // 4. Skills
            db.prepare('DELETE FROM cv_skills WHERE user_id = ?').run(userId);
            const insertSkill = db.prepare(`
                INSERT INTO cv_skills (user_id, skill_name, proficiency, sort_order)
                VALUES (?, ?, ?, ?)
            `);
            skills.forEach((item, index) => {
                const sName = typeof item === 'string' ? item : item.skill_name;
                const sProf = typeof item === 'string' ? '' : (item.proficiency || '');
                if (sName && sName.trim()) {
                    insertSkill.run(userId, sName.trim(), sProf, index);
                }
            });

            // 5. Languages
            db.prepare('DELETE FROM cv_languages WHERE user_id = ?').run(userId);
            const insertLang = db.prepare(`
                INSERT INTO cv_languages (user_id, language, is_mother_tongue, listening, reading, spoken_production, spoken_interaction, writing, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            languages.forEach((item, index) => {
                if (item.language && item.language.trim()) {
                    insertLang.run(
                        userId,
                        item.language.trim(),
                        item.is_mother_tongue ? 1 : 0,
                        item.listening || '',
                        item.reading || '',
                        item.spoken_production || '',
                        item.spoken_interaction || '',
                        item.writing || '',
                        index
                    );
                }
            });

            // 6. Digital Skills
            db.prepare('DELETE FROM cv_digital_skills WHERE user_id = ?').run(userId);
            const insertDig = db.prepare(`
                INSERT INTO cv_digital_skills (user_id, skill, description, sort_order)
                VALUES (?, ?, ?, ?)
            `);
            digital_skills.forEach((item, index) => {
                const dSkill = typeof item === 'string' ? item : item.skill;
                const dDesc = typeof item === 'string' ? '' : (item.description || '');
                if (dSkill && dSkill.trim()) {
                    insertDig.run(userId, dSkill.trim(), dDesc, index);
                }
            });

            // 7. Hobbies
            db.prepare('DELETE FROM cv_hobbies WHERE user_id = ?').run(userId);
            const insertHobby = db.prepare(`
                INSERT INTO cv_hobbies (user_id, hobby, sort_order)
                VALUES (?, ?, ?)
            `);
            hobbies.forEach((item, index) => {
                const hName = typeof item === 'string' ? item : item.hobby;
                if (hName && hName.trim()) {
                    insertHobby.run(userId, hName.trim(), index);
                }
            });

            // 8. References (Optional)
            db.prepare('DELETE FROM cv_references WHERE user_id = ?').run(userId);
            const insertRef = db.prepare(`
                INSERT INTO cv_references (user_id, name, designation, organization, email, phone, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            references.forEach((item, index) => {
                const rName = item && item.name ? item.name.trim() : '';
                if (rName) {
                    insertRef.run(
                        userId,
                        rName,
                        item.designation ? item.designation.trim() : '',
                        item.organization ? item.organization.trim() : '',
                        item.email ? item.email.trim() : '',
                        item.phone ? item.phone.trim() : '',
                        index
                    );
                }
            });
        });

        saveTransaction();

        const updatedData = getStudentCvData(userId);
        res.json({
            message: status === 'Completed' ? 'CV marked as Completed and saved!' : 'Draft saved successfully.',
            status,
            cv: updatedData
        });
    } catch (err) {
        console.error('Error saving CV:', err);
        res.status(500).json({ error: 'Failed to save CV data.' });
    }
});

// Helper function to fetch all CV data for a user
function getStudentCvData(userId) {
    const user = db.prepare('SELECT id, name, email, student_id FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    const profile = db.prepare('SELECT * FROM cv_profiles WHERE user_id = ?').get(userId) || {};
    const education = db.prepare('SELECT * FROM cv_education WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const experience = db.prepare('SELECT * FROM cv_experience WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const skills = db.prepare('SELECT * FROM cv_skills WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const languages = db.prepare('SELECT * FROM cv_languages WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const digital_skills = db.prepare('SELECT * FROM cv_digital_skills WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const hobbies = db.prepare('SELECT * FROM cv_hobbies WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);
    const references = db.prepare('SELECT * FROM cv_references WHERE user_id = ? ORDER BY sort_order ASC, id ASC').all(userId);

    // Format experience responsibilities
    const formattedExperience = experience.map(exp => {
        let resp = [];
        try {
            resp = exp.responsibilities ? JSON.parse(exp.responsibilities) : [];
        } catch {
            resp = exp.responsibilities ? exp.responsibilities.split('\n').filter(Boolean) : [];
        }
        return {
            ...exp,
            responsibilities: Array.isArray(resp) ? resp : [resp]
        };
    });

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            student_id: user.student_id
        },
        personal_info: {
            name: user.name,
            email: user.email,
            student_id: user.student_id,
            nationality: profile.nationality || '',
            phone: profile.phone || '',
            address: profile.address || '',
            linkedin: profile.linkedin || '',
            photo_url: profile.photo_url || ''
        },
        about_me: profile.about_me || '',
        status: profile.status || 'Not Created',
        last_updated: profile.updated_at || null,
        education,
        experience: formattedExperience,
        skills,
        languages,
        digital_skills,
        hobbies,
        references
    };
}

module.exports = {
    router,
    getStudentCvData
};
