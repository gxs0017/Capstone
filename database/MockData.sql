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
-- USERS  (12 providers, 7 requesters, 1 admin = 20 users)
-- ----------------------------------------------------------------
INSERT INTO users
  (first_name, last_name, phone_number, date_of_birth, email, password,
   street, city, province, postal_code, role, is_blocked)
VALUES
  -- ── PROVIDERS (12) ────────────────────────────────────────────
  ('Marcus', 'Houston', '4035552341', '1987-11-12', 'marcus@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '87 Mountainash Ave', 'Calgary', 'AB', 'T2P3K1', 'PROVIDER', FALSE),

  ('Emily', 'Brown', '6475552222', '1992-08-10', 'emily@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '99 Bay St', 'Toronto', 'ON', 'M5J2N8', 'PROVIDER', FALSE),

  ('Priya', 'Nair', '6475553456', '1994-02-17', 'priya@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '45 Bloor St W', 'Toronto', 'ON', 'M4W1A8', 'PROVIDER', FALSE),

  ('Daniel', 'Brooks', '9055554321', '1989-07-03', 'daniel@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '22 Hurontario St', 'Mississauga', 'ON', 'L5B1M4', 'PROVIDER', FALSE),

  ('Aisha', 'Malik', '4165558888', '1996-12-05', 'aisha@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '180 Dundas St W', 'Toronto', 'ON', 'M5G1Z8', 'PROVIDER', FALSE),

  ('Jordan', 'Lee', '6135559090', '1991-09-28', 'jordan@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '75 Rideau St', 'Ottawa', 'ON', 'K1N5W8', 'PROVIDER', FALSE),

  ('Sophie', 'Tremblay', '5145557777', '1993-04-14', 'sophie@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '300 Rue Sainte-Catherine', 'Montreal', 'QC', 'H2X1L7', 'PROVIDER', FALSE),

  ('Liam', 'O''Brien', '4035556543', '1988-01-22', 'liam@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '14 Stephen Ave', 'Calgary', 'AB', 'T2P1T2', 'PROVIDER', FALSE),

  ('Nina', 'Patel', '6047771234', '1995-10-09', 'nina@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '88 Robson St', 'Vancouver', 'BC', 'V6B2A7', 'PROVIDER', FALSE),

  ('Ethan', 'Campbell', '2045559876', '1990-06-30', 'ethan@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '55 Portage Ave', 'Winnipeg', 'MB', 'R3C0A5', 'PROVIDER', FALSE),

  ('Olivia', 'Chen', '9055551111', '1997-03-18', 'olivia@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '40 Main St E', 'Hamilton', 'ON', 'L8N1A1', 'PROVIDER', FALSE),

  ('Hassan', 'Ali', '7805552468', '1986-08-25', 'hassan@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '100 Jasper Ave', 'Edmonton', 'AB', 'T5J1S9', 'PROVIDER', FALSE),

  -- ── REQUESTERS (7) ────────────────────────────────────────────
  ('Sarah', 'Lee', '4165551234', '1995-06-20', 'sarah@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '12 King St', 'Toronto', 'ON', 'M5V2K3', 'REQUESTER', FALSE),

  ('John', 'Smith', '9055555678', '1990-03-15', 'john@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '55 Queen St', 'Brampton', 'ON', 'L6P1A1', 'REQUESTER', FALSE),

  ('Maya', 'Rodriguez', '6475554567', '1998-11-02', 'maya@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '29 College St', 'Toronto', 'ON', 'M5T1R4', 'REQUESTER', FALSE),

  ('Tyler', 'Davis', '4035558765', '1993-05-11', 'tyler@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '63 4th Ave SW', 'Calgary', 'AB', 'T2P0H7', 'REQUESTER', FALSE),

  ('Rachel', 'Kim', '6045553210', '1999-01-30', 'rachel@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '12 Granville St', 'Vancouver', 'BC', 'V6C1T2', 'REQUESTER', FALSE),

  ('Kevin', 'Wilson', '2045553333', '1991-09-07', 'kevin@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '77 Broadway Ave', 'Winnipeg', 'MB', 'R3C0R3', 'REQUESTER', FALSE),

  ('Fatima', 'Hassan', '6135552222', '1997-04-16', 'fatima@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '50 Elgin St', 'Ottawa', 'ON', 'K1P5K6', 'REQUESTER', FALSE),

  -- ── ADMIN (1) ─────────────────────────────────────────────────
  ('Admin', 'User', '4165550000', '1985-01-01', 'admin@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '1 Admin Plaza', 'Toronto', 'ON', 'M5H1T1', 'ADMIN', FALSE);

-- ----------------------------------------------------------------
-- PROVIDER_DETAILS  (link providers to services)
-- user_id 1-12 are providers
-- service_id: 1=Snow Shovelling, 2=Babysitting, 3=Tutoring, 4=Lawn Mowing
-- ----------------------------------------------------------------
INSERT INTO provider_details (user_id, service_id) VALUES
  -- Marcus Houston: Snow Shovelling + Lawn Mowing
  (1, 1), (1, 4),
  -- Emily Brown: Babysitting + Tutoring
  (2, 2), (2, 3),
  -- Priya Nair: Tutoring
  (3, 3),
  -- Daniel Brooks: Snow Shovelling + Lawn Mowing
  (4, 1), (4, 4),
  -- Aisha Malik: Babysitting
  (5, 2),
  -- Jordan Lee: Snow Shovelling + Lawn Mowing
  (6, 1), (6, 4),
  -- Sophie Tremblay: Tutoring + Babysitting
  (7, 3), (7, 2),
  -- Liam O'Brien: Snow Shovelling
  (8, 1),
  -- Nina Patel: Lawn Mowing + Babysitting
  (9, 4), (9, 2),
  -- Ethan Campbell: Tutoring + Snow Shovelling
  (10, 3), (10, 1),
  -- Olivia Chen: Lawn Mowing + Tutoring
  (11, 4), (11, 3),
  -- Hassan Ali: Snow Shovelling + Lawn Mowing + Babysitting
  (12, 1), (12, 4), (12, 2);

-- ----------------------------------------------------------------
-- BOOKINGS  (sample bookings across different users and statuses)
-- ----------------------------------------------------------------
INSERT INTO bookings (provider_detail_id, requester_id, service_id, status, scheduled_date, notes) VALUES
  -- Sarah booked Marcus for Snow Shovelling (CONFIRMED)
  (1, 13, 1, 'CONFIRMED', '2026-04-15', 'Front driveway and walkway please'),
  -- John booked Emily for Babysitting (PENDING)
  (3, 14, 2, 'PENDING', '2026-04-20', 'Two kids, ages 5 and 7, for 3 hours'),
  -- Sarah booked Marcus for Lawn Mowing (CONFIRMED)
  (2, 13, 4, 'CONFIRMED', '2026-04-18', 'Backyard only, about 500 sq ft'),
  -- Maya booked Priya for Tutoring (PENDING)
  (5, 15, 3, 'PENDING', '2026-04-22', 'Grade 10 math tutoring, 1 hour session'),
  -- Tyler booked Daniel for Snow Shovelling (CONFIRMED)
  (6, 16, 1, 'CONFIRMED', '2026-04-12', 'Double driveway, might need salt too'),
  -- Rachel booked Nina for Lawn Mowing (PENDING)
  (15, 17, 4, 'PENDING', '2026-04-25', 'Front and back yard, medium size'),
  -- Kevin booked Ethan for Tutoring (CONFIRMED)
  (17, 18, 3, 'CONFIRMED', '2026-04-19', 'University-level calculus help'),
  -- Fatima booked Jordan for Lawn Mowing (CANCELLED)
  (10, 19, 4, 'CANCELLED', '2026-04-14', 'Had to reschedule, will rebook'),
  -- Sarah booked Sophie for Babysitting (PENDING)
  (12, 13, 2, 'PENDING', '2026-04-28', 'One child, age 3, evening babysitting'),
  -- John booked Hassan for Snow Shovelling (CONFIRMED)
  (22, 14, 1, 'CONFIRMED', '2026-04-10', 'Commercial lot, will need extra time');

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
