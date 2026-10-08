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
INSERT INTO services (service_name, base_price) VALUES
  ('Snow Shovelling', 40.00),
  ('Babysitting',     60.00),
  ('Tutoring',        50.00),
  ('Lawn Mowing',     45.00);

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
-- PROVIDER_AVAILABILITY  (recurring weekly windows per provider)
-- day_of_week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday,
--              4=Thursday, 5=Friday, 6=Saturday
-- ----------------------------------------------------------------
INSERT INTO provider_availability (user_id, day_of_week, start_time, end_time) VALUES
  -- Marcus Houston: weekday mornings
  (1, 1, '08:00:00', '12:00:00'), (1, 3, '08:00:00', '12:00:00'), (1, 5, '08:00:00', '12:00:00'),
  -- Emily Brown: weekday afternoons
  (2, 1, '13:00:00', '18:00:00'), (2, 2, '13:00:00', '18:00:00'), (2, 4, '13:00:00', '18:00:00'),
  -- Priya Nair: evenings, Tue/Thu
  (3, 2, '17:00:00', '20:00:00'), (3, 4, '17:00:00', '20:00:00'),
  -- Daniel Brooks: weekends
  (4, 6, '09:00:00', '15:00:00'), (4, 0, '09:00:00', '15:00:00'),
  -- Aisha Malik: weekday evenings
  (5, 1, '16:00:00', '20:00:00'), (5, 3, '16:00:00', '20:00:00'), (5, 5, '16:00:00', '20:00:00'),
  -- Jordan Lee: Mon/Wed/Fri mornings
  (6, 1, '07:00:00', '11:00:00'), (6, 3, '07:00:00', '11:00:00'), (6, 5, '07:00:00', '11:00:00'),
  -- Sophie Tremblay: weekday afternoons
  (7, 2, '12:00:00', '17:00:00'), (7, 4, '12:00:00', '17:00:00'),
  -- Liam O'Brien: weekends
  (8, 6, '08:00:00', '13:00:00'), (8, 0, '08:00:00', '13:00:00'),
  -- Nina Patel: weekday mornings
  (9, 1, '09:00:00', '13:00:00'), (9, 2, '09:00:00', '13:00:00'), (9, 3, '09:00:00', '13:00:00'),
  -- Ethan Campbell: Tue/Thu evenings
  (10, 2, '18:00:00', '21:00:00'), (10, 4, '18:00:00', '21:00:00'),
  -- Olivia Chen: weekday afternoons
  (11, 1, '14:00:00', '19:00:00'), (11, 3, '14:00:00', '19:00:00'), (11, 5, '14:00:00', '19:00:00'),
  -- Hassan Ali: weekends + Friday
  (12, 5, '10:00:00', '16:00:00'), (12, 6, '10:00:00', '16:00:00'), (12, 0, '10:00:00', '16:00:00');

-- ----------------------------------------------------------------
-- BOOKINGS  (sample bookings across different users and statuses)
-- scheduled_date now carries a time component picked from the
-- provider's available window above.
-- ----------------------------------------------------------------
INSERT INTO bookings (provider_detail_id, requester_id, service_id, status, scheduled_date, notes) VALUES
  -- Sarah booked Marcus for Snow Shovelling (CONFIRMED) — Marcus available Wed mornings
  (1, 13, 1, 'CONFIRMED', '2026-04-15 09:00:00', 'Front driveway and walkway please'),
  -- John booked Emily for Babysitting (PENDING) — Emily available Mon afternoons
  (3, 14, 2, 'PENDING', '2026-04-20 14:00:00', 'Two kids, ages 5 and 7, for 3 hours'),
  -- Sarah booked Marcus for Lawn Mowing (CONFIRMED) — Marcus available Sat... use Fri morning
  (2, 13, 4, 'CONFIRMED', '2026-04-18 10:00:00', 'Backyard only, about 500 sq ft'),
  -- Maya booked Priya for Tutoring (PENDING) — Priya available Wed evenings
  (5, 15, 3, 'PENDING', '2026-04-22 18:00:00', 'Grade 10 math tutoring, 1 hour session'),
  -- Tyler booked Daniel for Snow Shovelling (CONFIRMED) — Daniel available weekends
  (6, 16, 1, 'CONFIRMED', '2026-04-12 10:00:00', 'Double driveway, might need salt too'),
  -- Rachel booked Nina for Lawn Mowing (PENDING) — Nina available Wed mornings
  (15, 17, 4, 'PENDING', '2026-04-25 09:30:00', 'Front and back yard, medium size'),
  -- Kevin booked Ethan for Tutoring (CONFIRMED) — Ethan available Thu evenings
  (17, 18, 3, 'CONFIRMED', '2026-04-19 18:30:00', 'University-level calculus help'),
  -- Fatima booked Jordan for Lawn Mowing (CANCELLED)
  (10, 19, 4, 'CANCELLED', '2026-04-14 07:30:00', 'Had to reschedule, will rebook'),
  -- Sarah booked Sophie for Babysitting (PENDING) — Sophie available Tue afternoons
  (12, 13, 2, 'PENDING', '2026-04-28 13:00:00', 'One child, age 3, evening babysitting'),
  -- John booked Hassan for Snow Shovelling (CONFIRMED) — Hassan available Fri
  (22, 14, 1, 'CONFIRMED', '2026-04-10 11:00:00', 'Commercial lot, will need extra time'),
  -- Sarah booked Marcus for Snow Shovelling again (COMPLETED — has a review below)
  (1, 13, 1, 'COMPLETED', '2026-03-02 08:30:00', 'Did the walkway too'),
  -- Tyler booked Daniel for Snow Shovelling (COMPLETED — reviewed below)
  (6, 16, 1, 'COMPLETED', '2026-03-05 09:00:00', 'Same as last time'),

  -- ── Additional COMPLETED bookings so every provider has at least one
  --    review — needed to exercise "sort by rating" and "view reviews"
  --    with more than a single data point. booking_id 13-24 below.
  -- Maya booked Emily for Babysitting (COMPLETED)
  (3, 15, 2, 'COMPLETED', '2026-07-09 14:00:00', 'Evening babysitting while we were out'),
  -- Rachel booked Priya for Tutoring (COMPLETED)
  (5, 17, 3, 'COMPLETED', '2026-04-29 18:00:00', 'Grade 9 algebra review session'),
  -- Kevin booked Aisha for Babysitting (COMPLETED)
  (8, 18, 2, 'COMPLETED', '2026-07-18 17:00:00', 'Weeknight babysitting, one child'),
  -- John booked Jordan for Snow Shovelling (COMPLETED)
  (9, 14, 1, 'COMPLETED', '2026-02-06 07:30:00', 'Driveway and front steps'),
  -- Sarah booked Sophie for Tutoring (COMPLETED)
  (11, 13, 3, 'COMPLETED', '2026-05-13 13:00:00', 'Grade 7 science homework help'),
  -- John booked Sophie for Babysitting (COMPLETED)
  (12, 14, 2, 'COMPLETED', '2026-06-10 13:30:00', 'Afternoon babysitting, two kids'),
  -- Tyler booked Liam for Snow Shovelling (COMPLETED)
  (13, 16, 1, 'COMPLETED', '2026-01-24 08:30:00', 'Driveway only'),
  -- Rachel booked Nina for Babysitting (COMPLETED)
  (15, 17, 2, 'COMPLETED', '2026-07-25 09:30:00', 'Morning babysitting, two kids'),
  -- Kevin booked Ethan for Tutoring (COMPLETED)
  (16, 18, 3, 'COMPLETED', '2026-05-06 18:30:00', 'High school physics tutoring'),
  -- Maya booked Olivia for Lawn Mowing (COMPLETED)
  (18, 15, 4, 'COMPLETED', '2026-06-19 14:30:00', 'Front and back yard'),
  -- John booked Hassan for Snow Shovelling (COMPLETED)
  (20, 14, 1, 'COMPLETED', '2026-02-13 10:30:00', 'Commercial lot, full clear'),
  -- Sarah booked Hassan for Lawn Mowing (COMPLETED)
  (21, 13, 4, 'COMPLETED', '2026-06-26 10:00:00', 'Backyard mow and edge trim');

-- ----------------------------------------------------------------
-- REVIEWS  (left by requesters against COMPLETED bookings)
-- booking_id 11 = Sarah's completed booking with Marcus (user_id 1)
-- booking_id 12 = Tyler's completed booking with Daniel (user_id 4)
-- booking_id 13-24 = the additional COMPLETED bookings added above,
-- giving every provider at least one review (ratings range 2-5, and
-- Sophie/Hassan each get two reviews to exercise the reviews panel).
-- ----------------------------------------------------------------
INSERT INTO reviews (booking_id, requester_id, provider_id, rating, comment) VALUES
  (11, 13, 1, 5, 'Marcus was quick and thorough, driveway was spotless.'),
  (12, 16, 4, 4, 'Daniel showed up on time and did a solid job, just a little rushed at the end.'),
  (13, 15, 2, 5, 'Emily was wonderful with the kids and kept us updated the whole evening.'),
  (14, 17, 3, 4, 'Priya explained the concepts clearly, started a few minutes late though.'),
  (15, 18, 5, 3, 'Decent babysitting experience, but felt a bit rushed picking up after the kids.'),
  (16, 14, 6, 4, 'Jordan cleared the driveway quickly after a big snowfall, very reliable.'),
  (17, 13, 7, 5, 'Sophie is an amazing tutor, my daughter finally understands fractions!'),
  (18, 14, 7, 4, 'Sophie was great with our toddler, just arrived a few minutes late.'),
  (19, 16, 8, 2, 'Liam showed up over an hour late and the job felt rushed.'),
  (20, 17, 9, 5, 'Nina was fantastic, very patient and professional with our kids.'),
  (21, 18, 10, 3, 'Ethan knows the material but could explain concepts more clearly.'),
  (22, 15, 11, 4, 'Olivia did a great job mowing the lawn, yard looks fantastic.'),
  (23, 14, 12, 5, 'Hassan cleared our commercial lot fast and thoroughly, highly recommend.'),
  (24, 13, 12, 5, 'Hassan mowed our lawn perfectly and even trimmed the edges.');

-- ----------------------------------------------------------------
-- Price the historical bookings above at their service's base price.
-- ----------------------------------------------------------------
UPDATE bookings b JOIN services s ON b.service_id = s.service_id SET b.price = s.base_price;

-- ----------------------------------------------------------------
-- UPCOMING bookings relative to NOW() — for testing the booking rules
--  (booking_id 25+; reviews above only reference ids 11-24)
--  * 25: CONFIRMED, starts in ~3 hours  -> requester CANNOT cancel (inside 24h cutoff)
--  * 26: CONFIRMED, starts in ~3 days   -> requester CAN cancel
--  * 27: PENDING,   starts in ~5 days   -> provider can confirm or decline
--  * 28-31: a prepaid RECURRING pack of 4 weekly sessions (10% discount)
--  * 32: DECLINED by the provider with a reason
--  * 33-34: a 2nd pack (Emily, tutoring) with session 1 CANCELLED + REFUNDED
-- ----------------------------------------------------------------
INSERT INTO bookings
  (provider_detail_id, requester_id, service_id, status, scheduled_date, notes,
   booking_type, batch_id, session_number, sessions_in_batch, price, discount_percent, payment_status)
VALUES
  (1, 13, 1, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 3 HOUR), 'Test: inside 24h cancellation cutoff',
   'ONE_TIME', NULL, 1, 1, 40.00, 0, 'UNPAID'),
  (1, 14, 1, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 3 DAY),  'Test: outside 24h cancellation cutoff',
   'ONE_TIME', NULL, 1, 1, 40.00, 0, 'UNPAID'),
  (3, 14, 2, 'PENDING',   DATE_ADD(NOW(), INTERVAL 5 DAY),  'Test: provider can confirm or decline',
   'ONE_TIME', NULL, 1, 1, 60.00, 0, 'UNPAID'),
  (5, 13, 3, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 8 DAY),  'Weekly tutoring pack',
   'RECURRING', '11111111-2222-4333-8444-555555555555', 1, 4, 45.00, 10, 'PAID'),
  (5, 13, 3, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 15 DAY), 'Weekly tutoring pack',
   'RECURRING', '11111111-2222-4333-8444-555555555555', 2, 4, 45.00, 10, 'PAID'),
  (5, 13, 3, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 22 DAY), 'Weekly tutoring pack',
   'RECURRING', '11111111-2222-4333-8444-555555555555', 3, 4, 45.00, 10, 'PAID'),
  (5, 13, 3, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 29 DAY), 'Weekly tutoring pack',
   'RECURRING', '11111111-2222-4333-8444-555555555555', 4, 4, 45.00, 10, 'PAID'),
  (3, 15, 2, 'DECLINED', DATE_ADD(NOW(), INTERVAL 6 DAY), 'Test: declined request',
   'ONE_TIME', NULL, 1, 1, 60.00, 0, 'UNPAID'),
  (4, 16, 3, 'CANCELLED', DATE_ADD(NOW(), INTERVAL 9 DAY), 'Weekly pack, session cancelled early',
   'RECURRING', '66666666-7777-4888-9999-000000000000', 1, 2, 45.00, 10, 'REFUNDED'),
  (4, 16, 3, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 16 DAY), 'Weekly pack, session cancelled early',
   'RECURRING', '66666666-7777-4888-9999-000000000000', 2, 2, 45.00, 10, 'PAID');

UPDATE bookings SET decline_reason = 'Sorry, I am away that day.' WHERE status = 'DECLINED';

-- ----------------------------------------------------------------
-- Verification queries
-- ----------------------------------------------------------------
SELECT * FROM services;
SELECT user_id, first_name, last_name, email, role, is_blocked, city FROM users;
SELECT * FROM provider_details;
SELECT * FROM provider_availability;
SELECT booking_id, requester_id, provider_detail_id, status, booking_type, session_number, sessions_in_batch, price, discount_percent, payment_status, scheduled_date FROM bookings;
SELECT * FROM reviews;

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
