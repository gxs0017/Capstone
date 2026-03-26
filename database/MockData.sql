USE bookingapp_db;

-- Dummy Data to test out database to backend system

-- SERVICES DATA
-- registration for the services
INSERT INTO services (service_name)
VALUES
('Snow Shovelling'),
('Babysitting'),
('Tutoring'),
('Lawn Mowing');


-- USERS DATA
-- Providers and Requesters 

INSERT INTO users
(first_name, last_name, phone_number, date_of_birth, email_info, password_info, street_name, city, province, postal_code, user_role)
VALUES
('Marcus', 'Houston', '4035552341', '1987-11-12', 'marcus@test.com', 'pass123', '87 Mountainash Ave', 'Calgary', 'AB', 'T2P3K1', 'PROVIDER'),
('Emily', 'Brown', '6475552222', '1992-08-10', 'emily@test.com', 'pass456', '99 Bay St', 'Toronto', 'ON', 'M5J2N8', 'PROVIDER'),
('Sarah', 'Lee', '4165551234', '1995-06-20', 'sarah@test.com', 'pass789', '12 King St', 'Toronto', 'ON', 'M5V2K3', 'REQUESTER'),
('John', 'Smith', '9055555678', '1990-03-15', 'john@test.com', 'pass321', '55 Queen St', 'Brampton', 'ON', 'L6P1A1', 'REQUESTER');


-- PROVIDER DETAILS DATA
-- Links provider users to services

INSERT INTO provider_details (user_id, service_id)
VALUES
(1, 1), 
(1, 4),
(2, 2), 
(2, 3); 


-- BOOKINGS DATA
-- Links requester, provider, and service

INSERT INTO bookings (provider_id, user_id, service_id)
VALUES
(1, 3, 1), 
(3, 4, 2),
(2, 3, 4), 
(4, 4, 3); 


-- All tables have the data in it
SELECT * FROM services;
SELECT * FROM users;
SELECT * FROM provider_details;
SELECT * FROM bookings;


-- sample statments to check (providers)

SELECT * FROM users
WHERE user_role = 'PROVIDER';



