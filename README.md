# Student CV Builder & Admin Portal

A complete, production-ready web application for building verified student CVs matching the official university template format (`CV formate.pdf`) with role-based authentication and an administrator portal.

---

## 🚀 Features

### 1. Authentication & Security
- **Student Registration**: Full Name, Email, Student ID (optional), Password with confirmation.
- **Role-Based Access Control**:
  - `student`: Can only view/edit their own CV.
  - `admin`: Can view all student records, search, filter, activate/deactivate, delete, view CV previews, and export records.
- **Password Hashing**: Securely hashed with `bcryptjs`.
- **JWT Session Tokens**: Stored securely in HTTP-only cookies and localStorage.
- **Database**: Persistent SQLite with foreign key cascading and auto-migration (`better-sqlite3`).

### 2. Student CV Builder (`CV formate.pdf` Standard)
- **Flexible & Optional**: No section is mandatory. Empty sections and headings are completely hidden from the preview and generated PDF. Zero dummy placeholders or sample text.
- **Sections**:
  1. Personal Information (Full Name, Nationality, Phone, Email, Address, LinkedIn, Photo upload)
  2. About Me (Professional summary statement)
  3. Education (Repeatable: Degree, Specialization, Institute, Location, Dates, CGPA/Result)
  4. Work Experience (Repeatable: Title, Organization, Dates, Location, Bullet points)
  5. Skills (Repeatable: Skill name & proficiency)
  6. Language (Mother tongue + Europass CEFR grid: Listening, Reading, Spoken Production, Spoken Interaction, Writing)
  7. Digital Skills (Repeatable: Tool/Skill & description)
  8. Hobbies & Interests (Repeatable)
- **Live Preview & PDF Export**: A4 formatted document download with one click.

### 3. Admin Console
- **Key Metrics**: Total students, active accounts, completed CVs, drafts.
- **Student Directory**: Search by student name, email, or student ID; filter by account status.
- **Actions**:
  - View full live CV preview
  - Download individual student CV PDF
  - Activate / Deactivate student access
  - Delete student records with confirmation
  - **Export to CSV**: Download student registry with one click

---

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js (v18+ or later)

### 2. Start the Server
Run the following in the project root:
```bash
node server.js
```

The portal runs at: **`http://localhost:5000`**

---

## 🔑 Default Credentials

### Admin Account (Pre-seeded):
- **Email**: `admin@university.edu`
- **Password**: `Admin@123456`
- **Role**: `admin`

### Student Account:
- Any student can register directly at `/register.html`.
- Test Student:
  - **Email**: `ali@student.edu`
  - **Password**: `Password123`
