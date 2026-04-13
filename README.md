# 🎯 Attendance Facial Recognition System

A production-ready web-based employee attendance system using **facial recognition** with editable overtime (OT) adjustment.

---

## 🏗️ Architecture

```
attendance-facial-recognition-system/
├── database/           # PostgreSQL schema & setup scripts
├── backend/            # Node.js + Express REST API
├── face-service/       # Python FastAPI face recognition microservice
└── frontend/           # React + Vite + Tailwind CSS
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | v18+ |
| npm | v9+ |
| Python | 3.9+ |
| PostgreSQL | v14+ |
| cmake & dlib deps | (for face_recognition) |

> **Linux/Mac:** Install dlib dependencies:
> ```bash
> sudo apt-get install build-essential cmake libopenblas-dev liblapack-dev libx11-dev libgtk-3-dev   # Ubuntu/Debian
> brew install cmake                                                                                  # macOS
> ```

---

### Step 1 — Database

```bash
# Create DB and apply schema
DB_USER=postgres bash database/setup.sh
```

Or manually:
```sql
CREATE DATABASE attendance_db;
\c attendance_db
\i database/schema.sql
```

---

### Step 2 — Backend

```bash
cd backend
cp .env.example .env       # Edit DB credentials & JWT secret
npm install
npm run dev                 # Runs on http://localhost:5000
```

---

### Step 3 — Face Service

```bash
cd face-service
cp .env.example .env       # Edit DB credentials
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py              # Runs on http://localhost:8000
```

> Face service API docs: http://localhost:8000/docs

---

### Step 4 — Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # Runs on http://localhost:3000
```

---

### OR — Start Everything at Once

```bash
bash start.sh
```

---

## 🔐 Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Admin@1234` |

> ⚠️ **Change this immediately** in production via the database.

---

## 📋 Features

### Employee Management
- Add / Edit / Delete employees
- Fields: code, name, department, designation, shift timing, status
- Face registration status indicator

### Facial Recognition Attendance
- Webcam-based face detection
- Auto check-in (first scan) and check-out (second scan)
- Late detection based on shift start time
- Auto-scan mode (every 4 seconds)

### Overtime System
| Field | Description |
|-------|-------------|
| `actual_hours` | Total worked hours |
| `system_ot` | Auto-calculated from shift |
| `manual_ot` | Admin override (optional) |
| `final_ot` | = manual_ot if set, else system_ot |
| `ot_remarks` | Notes on adjustment |

### Admin Dashboard
- Live stats: present, absent, late, OT hours
- Today's attendance table
- Attendance records with filters (date / date range)
- Inline OT edit with audit trail
- Daily & monthly reports
- CSV export

---

## 📡 API Reference

### Auth
```
POST   /api/auth/login          Body: { username, password }
GET    /api/auth/me             Requires: Bearer token
```

### Employees
```
GET    /api/employees           ?search=&department=&status=&page=&limit=
POST   /api/employees           Body: employee fields
PUT    /api/employees/:id
DELETE /api/employees/:id
GET    /api/employees/departments
```

### Face
```
POST   /api/employees/:id/face  Multipart: image file
GET    /api/employees/:id/face  Check registration status
DELETE /api/employees/:id/face  Remove encoding
```

### Attendance
```
POST   /api/attendance/mark     Multipart: image file  (no auth required — kiosk use)
GET    /api/attendance          ?date=&from=&to=&employee_id=
GET    /api/attendance/summary/today
PUT    /api/attendance/ot-update  Body: { attendance_id, manual_ot, ot_remarks }
```

### Reports
```
GET    /api/reports             ?type=daily|monthly&date=&month=&year=
```

---

## 🗄️ Database Schema

```
admins               → admin login accounts
employees            → employee records
face_encodings       → 128-d face vectors (JSON)
attendance_logs      → check-in / check-out per day
overtime_adjustments → OT tracking with manual override
audit_logs           → all admin actions logged
```

---

## 🔒 Security Notes

- JWT tokens expire in 8 hours
- Passwords hashed with bcrypt (cost 12)
- Rate limiting on login (10 req / 15 min)
- Face encodings stored as vectors, not raw images
- All admin mutations are audit-logged with IP address

### Where to Add Liveness Detection
In `face-service/main.py`, at the start of both `/register` and `/recognize` endpoints, integrate an anti-spoofing model (e.g. [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing)) before processing the image:

```python
# TODO: Add liveness check before encoding
# if not is_live(img_array):
#     raise HTTPException(400, "Liveness check failed")
```

---

## 🛠️ Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=change_this_to_long_random_string
JWT_EXPIRES_IN=8h
FACE_SERVICE_URL=http://localhost:8000
```

### Face Service (`face-service/.env`)
```env
HOST=0.0.0.0
PORT=8000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_db
DB_USER=postgres
DB_PASSWORD=your_password
TOLERANCE=0.5        # Lower = stricter matching (0.4–0.6 recommended)
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL 14+ |
| Face Recognition | Python + face_recognition + OpenCV |
| Face API | FastAPI + Uvicorn |
| Auth | JWT (jsonwebtoken) |
| Webcam | react-webcam |

---

## 🧪 Testing the System

1. Start all services
2. Open http://localhost:3000 and log in
3. Go to **Employees** → Add an employee
4. Go to **Face Register** → Select the employee → Start camera → Capture → Register
5. Go to **Live Attendance** → Start camera → point at your face → it auto check-ins
6. Check **Attendance** tab to see the record and edit OT
7. Check **Reports** for daily/monthly summaries

---

## 🗒️ Production Checklist

- [ ] Change default admin password
- [ ] Set strong `JWT_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (nginx reverse proxy recommended)
- [ ] Set `CORS_ORIGIN` to your actual domain
- [ ] Enable PostgreSQL SSL
- [ ] Add liveness detection in face service
- [ ] Set up regular DB backups
- [ ] Configure log rotation
