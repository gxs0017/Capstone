# Neighbourhood Booking App

A full-stack peer-to-peer marketplace where neighbours offer and book local services
(snow shovelling, babysitting, tutoring, lawn mowing). Capstone project, 2026.

## Tech stack
- **Frontend:** Angular 21 (standalone components, Angular Material, signals, reactive forms)
- **Backend:** Node.js + Express 5, JWT auth, bcryptjs
- **Database:** MySQL (mysql2, connection pooling, parameterized queries)

## Roles
- **REQUESTER** – searches providers and books services
- **PROVIDER** – lists services and confirms/cancels incoming bookings
- **ADMIN** – manages users (block/unblock/delete) and views dashboard stats

## Project structure
```
backend/    Express API (controllers, models, routes, middleware, DTOs)
frontend/   Angular app (components, services, guards, interceptors)
database/   MySQL schema (TableSchema.sql) + mock data (MockData.sql)
documents/  Project documents
```

## Prerequisites
- Node.js 20+ and npm
- MySQL 8+

## Setup

### 1. Database
Run these SQL files in MySQL (Workbench or CLI), in order:
1. `database/TableSchema.sql` — creates the `bookingapp_db` database and tables
2. `database/MockData.sql` — inserts sample users, services, and bookings

### 2. Backend
```bash
cd backend
npm install
copy .env.example .env    # then edit .env with your real MySQL password + a JWT secret
npm start                 # starts on http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
npm start                 # starts on http://localhost:4200
```

## Environment variables
See `backend/.env.example`. Copy it to `backend/.env` and fill in real values.
The real `.env` is gitignored and must never be committed.

## Test logins
All seeded users share the password **`pass123`**:
- Admin: `admin@test.com`
- Requester: `sarah@test.com`
- Provider: `marcus@test.com`

## Git workflow
- `working-feature-test` — active development branch
- `testdemoapplication` — frozen snapshot of the finalized prototype (restore point)


## .env File format:
# Backend environment variables.
# Copy this file to ".env" in the same folder and fill in real values.
# The real .env is gitignored — never commit it.

# --- MySQL database connection ---
DB_HOST==<please ask me (Guransh)>
DB_PORT==<please ask me (Guransh)>
DB_USER==<please ask me (Guransh)>
DB_PASSWORD=<please ask me (Guransh)>
DB_NAME==<please ask me (Guransh)>
DB_SSL==<please ask me (Guransh)>

# --- Server ---
PORT==<please ask me (Guransh)>

# --- JWT authentication ---
# Use a long, random string for the secret (e.g. 32+ characters).
JWT_SECRET==<please ask me (Guransh)>
JWT_EXPIRES_IN==<please ask me (Guransh)>


#If any team member or professor requires the env with pas to run locally please contact me ( Guransh ).

## Team
Alisson Johnson · Broinson Jeyarajah · Judd Rosagya · Guransh Singh Bagga
