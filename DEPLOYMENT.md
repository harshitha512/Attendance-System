# Attendance System — Deployment Guide

## Project structure

```
project/
├── database/
│   ├── schema.sql   ← All tables, indexes, default admin
│   └── setup.sh     ← One-command DB setup script
└── backend/
    ├── .env         ← Configure this first
    ├── package.json
    └── src/
```

---

## All bugs fixed

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | `role "basha" does not exist` — active crash | `.env` | Server couldn't connect to DB |
| 2 | `https://localhost:8000` TLS error | `.env` | All face recognition calls crashed silently |
| 3 | `TIMESTAMP` instead of `TIMESTAMPTZ` | `schema.sql` | Check-in/out times wrong across timezones |
| 4 | `CREATE TABLE` without `IF NOT EXISTS` | `schema.sql` | Re-running setup failed every time |
| 5 | Admin INSERT not idempotent | `schema.sql` | Re-running setup caused unique-constraint error |
| 6 | `final_ot` never updated after OT edit | `attendanceController.js` | Dashboard OT totals always 0 |
| 7 | `date` + `from/to` filters conflicted | `attendanceController.js` | Wrong attendance results |
| 8 | Employee PUT wiped unset fields | `employeeController.js` | Partial updates nulled shift times and status |
| 9 | `migrate.js` duplicated DDL with different passwords | `migrate.js` | Two conflicting sources of truth |

---

## First-time setup

### Prerequisites
- Node.js 18+  |  PostgreSQL 14+  |  Python face service on port 8000

### Step 1 — Configure environment

Edit `backend/.env` — the minimum required changes:

```env
DB_USER=postgres          # must match an existing PostgreSQL role
DB_PASSWORD=postgres123   # your PostgreSQL password
JWT_SECRET=<random>       # generate with:
                          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Check your PostgreSQL roles: `psql -U postgres -c "\du"`

### Step 2 — Create database and apply schema

```bash
bash database/setup.sh
```

Default admin after setup:
- **Username:** `admin`
- **Password:** `Admin@1234`  ⚠️ Change before production

### Step 3 — Install and start

```bash
cd backend
npm install
npm run dev       # development (auto-reload)
# or
npm start         # production
```

API: `http://localhost:5000`  |  Health: `GET /health`

---

## Quick smoke test

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}' | jq .
```

---

## Re-running setup (safe)

Both `setup.sh` and `schema.sql` are fully idempotent:
```bash
bash database/setup.sh    # or: cd backend && npm run migrate
```

---

## Production checklist
- [ ] Strong `JWT_SECRET` (32+ chars)
- [ ] Change default admin password
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` set to exact frontend URL (not `*`)
- [ ] `.env` in `.gitignore` — never commit it
- [ ] Reverse proxy (nginx/caddy) with HTTPS in front of the API
- [ ] Dedicated PostgreSQL user with limited permissions

---

## Face Recognition Service (Python/FastAPI)

### Bugs fixed

| # | Issue | Impact |
|---|-------|--------|
| 1 | **Double-write** — Python `/register` wrote to `face_encodings`, then Node also wrote the returned encoding — every registration created **2 duplicate rows** | Recognition ran against duplicates; `hasFace` returned wrong counts |
| 2 | **New DB connection per request** — `psycopg2.connect()` called on every endpoint call | Exhausts PostgreSQL's connection limit under load |
| 3 | **Full DB scan on every recognition** — `load_all_encodings()` fetched all rows on every attendance mark | Slow check-in; gets worse as headcount grows |
| 4 | **No startup validation** — service booted with no DB connectivity check | Silent failures; misleading "no registered faces" errors |
| 5 | **`_env` filename** — must be renamed to `.env` | `load_dotenv()` can't find the file |

### Setup

#### 1. Install system dependencies (required for dlib / face-recognition)

**Ubuntu/Debian:**
```bash
sudo apt-get install -y cmake build-essential libopenblas-dev liblapack-dev
```
**macOS:**
```bash
brew install cmake
```
**Windows:** Install Visual Studio Build Tools + CMake, or use a pre-built dlib wheel (see comments in requirements.txt).

#### 2. Create a virtual environment and install packages

```bash
cd face_service
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```
> ⚠️ `dlib` compiles from source — this takes 5–15 minutes on first install.

#### 3. Configure environment

Rename `.env` if needed, then edit:
```env
DB_USER=postgres        # match your PostgreSQL role
DB_PASSWORD=postgres123
TOLERANCE=0.5           # lower = stricter match
```

#### 4. Run the service

```bash
python main.py
# or for production:
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

Service runs at: `http://localhost:8000`
Health check: `GET http://localhost:8000/health` (also shows number of cached encodings)

### Startup behaviour

On startup the service:
1. Tests the DB connection — **fails fast** if unreachable
2. Loads all face encodings into memory — subsequent `/recognize` calls use the cache (no DB query)
3. Cache is refreshed automatically on every `/register` and `/delete`

### Start order

Always start services in this order:
```
1. PostgreSQL
2. python main.py        (face service)
3. npm run dev           (node backend)
```
