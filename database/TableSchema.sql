USE bookingapp_db;

-- References used: 
-- https://dba.stackexchange.com/questions/74627/difference-between-on-delete-cascade-on-update-cascade-in-mysql
-- phone number should not be int: https://stackoverflow.com/questions/33963607/how-to-store-a-phone-number-in-sql-as-an-integer

-- Additional Comments/Explanation: 
-- users: stores people
-- services: stores service types
-- provider_details: connects providers to services
-- bookings: connects everything together
-- Every person gets a ID that is unique (primary key) 
-- PROVIDER_DETAILS table: user is a provider and services theyt offer 


-- Created a ERD diagram to document flow of database.
-- Need to recreate ER diagram after creating tables.



USE bookingapp_db;

-- USERS TABLE
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone_number VARCHAR(25) NOT NULL,
    date_of_birth DATE NOT NULL,
    email_info VARCHAR(100) NOT NULL UNIQUE,
    password_info VARCHAR(255) NOT NULL,
    street_name VARCHAR(100) NOT NULL,
    city VARCHAR(50) NOT NULL,
    province VARCHAR(20) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    user_role ENUM('REQUESTER', 'PROVIDER') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SERVICES TABLE
CREATE TABLE services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE
);

-- PROVIDER DETAILS TABLE
CREATE TABLE provider_details (
    provider_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(service_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- BOOKINGS TABLE
CREATE TABLE bookings (
    ref_id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES provider_details(provider_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(service_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- DROP all tables if needed since FK and PK is involved
-- DROP TABLE IF EXISTS provider_details;
-- DROP TABLE IF EXISTS services;
-- DROP TABLE IF EXISTS users;