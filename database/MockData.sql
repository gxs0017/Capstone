-- ============================================================
-- Neighbourhood Booking App — Mock / Test Data
-- Run AFTER TableSchema.sql.
-- Passwords are pre-hashed with bcrypt (10 rounds):
--   All test users use password: pass123
--   Hash: $2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG
-- ============================================================

USE bookingapp_db;

-- ----------------------------------------------------------------
-- SERVICES
-- ----------------------------------------------------------------
INSERT INTO services (service_name) VALUES
  ('Snow Shovelling'),
  ('Babysitting'),
  ('Tutoring'),
  ('Lawn Mowing');

-- ----------------------------------------------------------------
-- USERS  (2 providers, 2 requesters, 1 admin)
-- ----------------------------------------------------------------
INSERT INTO users
  (first_name, last_name, phone_number, date_of_birth, email, password,
   street, city, province, postal_code, role, is_blocked)
VALUES
  -- Providers
  ('Marcus', 'Houston', '4035552341', '1987-11-12', 'marcus@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '87 Mountainash Ave', 'Calgary', 'AB', 'T2P3K1', 'PROVIDER', FALSE),

  ('Emily', 'Brown', '6475552222', '1992-08-10', 'emily@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '99 Bay St', 'Toronto', 'ON', 'M5J2N8', 'PROVIDER', FALSE),

  -- Requesters
  ('Sarah', 'Lee', '4165551234', '1995-06-20', 'sarah@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '12 King St', 'Toronto', 'ON', 'M5V2K3', 'REQUESTER', FALSE),

  ('John', 'Smith', '9055555678', '1990-03-15', 'john@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '55 Queen St', 'Brampton', 'ON', 'L6P1A1', 'REQUESTER', FALSE),

  -- Admin
  ('Admin', 'User', '4165550000', '1985-01-01', 'admin@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '1 Admin Plaza', 'Toronto', 'ON', 'M5H1T1', 'ADMIN', FALSE);

-- ----------------------------------------------------------------
-- PROVIDER_DETAILS  (Marcus → Snow Shovelling + Lawn Mowing,
--                    Emily  → Babysitting + Tutoring)
-- ----------------------------------------------------------------
INSERT INTO provider_details (user_id, service_id) VALUES
  (1, 1),  -- Marcus: Snow Shovelling
  (1, 4),  -- Marcus: Lawn Mowing
  (2, 2),  -- Emily:  Babysitting
  (2, 3);  -- Emily:  Tutoring

-- ----------------------------------------------------------------
-- BOOKINGS  (sample bookings for testing)
-- ----------------------------------------------------------------
INSERT INTO bookings (provider_detail_id, requester_id, service_id, status, scheduled_date, notes) VALUES
  (1, 3, 1, 'CONFIRMED', '2026-04-15', 'Front driveway and walkway please'),
  (3, 4, 2, 'PENDING',   '2026-04-20', 'Two kids, ages 5 and 7, for 3 hours'),
  (2, 3, 4, 'CONFIRMED', '2026-04-18', 'Backyard only, about 500 sq ft'),
  (4, 4, 3, 'PENDING',   '2026-04-22', 'Grade 10 math tutoring, 1 hour session');

-- ----------------------------------------------------------------
-- Verification queries
-- ----------------------------------------------------------------
SELECT * FROM services;
SELECT user_id, first_name, last_name, email, role, is_blocked, city FROM users;
SELECT * FROM provider_details;
SELECT * FROM bookings;

-- Show providers with their services
SELECT
  u.user_id, u.first_name, u.last_name, u.email,
  u.city, u.province, u.role,
  GROUP_CONCAT(s.service_name ORDER BY s.service_name SEPARATOR ', ') AS services
FROM users u
JOIN provider_details pd ON u.user_id = pd.user_id
JOIN services s ON pd.service_id = s.service_id
WHERE u.role = 'PROVIDER'
GROUP BY u.user_id;
