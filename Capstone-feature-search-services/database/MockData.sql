-- ============================================================
-- Neighbourhood Booking App — Mock / Test Data
-- Run AFTER TableSchema.sql.
-- Passwords are pre-hashed with bcrypt (10 rounds):
--   pass123, pass456, pass789, pass321
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
-- USERS  (2 providers, 2 requesters)
-- ----------------------------------------------------------------
INSERT INTO users
  (first_name, last_name, phone_number, date_of_birth, email, password,
   street, city, province, postal_code, role)
VALUES
  ('Marcus', 'Houston', '4035552341', '1987-11-12', 'marcus@test.com',
   '$2b$10$QewWm5.rn03jmLiAi9THLuXkHipUMJP5xOYL/L06CrPQbMG.4ikjG',
   '87 Mountainash Ave', 'Calgary', 'AB', 'T2P3K1', 'PROVIDER'),

  ('Emily', 'Brown', '6475552222', '1992-08-10', 'emily@test.com',
   '$2b$10$V9GvguHtVSYg.PqOdIgmxOCgw2FykOeHUBB.j44bXYb0YoTWUrf/G',
   '99 Bay St', 'Toronto', 'ON', 'M5J2N8', 'PROVIDER'),

  ('Sarah', 'Lee', '4165551234', '1995-06-20', 'sarah@test.com',
   '$2b$10$ELfyKgVV34ZxqrouS.6hfeR4L9ZUA7n00BNUlh4jBWT8.XoAt1CuK',
   '12 King St', 'Toronto', 'ON', 'M5V2K3', 'REQUESTER'),

  ('John', 'Smith', '9055555678', '1990-03-15', 'john@test.com',
   '$2b$10$u5ag52P6mqvXskSJTYqUp./70.ITKF0xMAvxAtfHHjC/.Se/IAw5a',
   '55 Queen St', 'Brampton', 'ON', 'L6P1A1', 'REQUESTER');

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
INSERT INTO bookings (provider_detail_id, requester_id, service_id, status) VALUES
  (1, 3, 1, 'CONFIRMED'),  -- Sarah booked Marcus for Snow Shovelling
  (3, 4, 2, 'PENDING'),    -- John  booked Emily  for Babysitting
  (2, 3, 4, 'CONFIRMED'),  -- Sarah booked Marcus for Lawn Mowing
  (4, 4, 3, 'PENDING');    -- John  booked Emily  for Tutoring

-- ----------------------------------------------------------------
-- Verification queries
-- ----------------------------------------------------------------
SELECT * FROM services;
SELECT user_id, first_name, last_name, email, role, city FROM users;
SELECT * FROM provider_details;
SELECT * FROM bookings;

-- Show providers with their services (useful for search endpoint)
SELECT
  u.user_id, u.first_name, u.last_name, u.email,
  u.city, u.province, u.role,
  GROUP_CONCAT(s.service_name ORDER BY s.service_name SEPARATOR ', ') AS services
FROM users u
JOIN provider_details pd ON u.user_id = pd.user_id
JOIN services s ON pd.service_id = s.service_id
WHERE u.role = 'PROVIDER'
GROUP BY u.user_id;
