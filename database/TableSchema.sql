-- ============================================================
-- Neighbourhood Booking App — Database Schema
-- Run this file FIRST to create the database and all tables.
-- Column names are aligned with frontend form fields and
-- backend controller expectations.
-- ============================================================

CREATE DATABASE IF NOT EXISTS bookingapp_db;
USE bookingapp_db;

-- Drop in reverse FK order so constraints don't block drops
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS provider_details;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;

-- ----------------------------------------------------------------
-- USERS TABLE
-- Stores PROVIDER, REQUESTER, and ADMIN accounts.
-- is_blocked lets admins restrict accounts without deleting them.
-- ----------------------------------------------------------------
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    first_name    VARCHAR(50)  NOT NULL,
    last_name     VARCHAR(50)  NOT NULL,
    phone_number  VARCHAR(25)  NOT NULL,
    date_of_birth DATE         NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,  -- bcrypt hash
    street        VARCHAR(100) NOT NULL,
    city          VARCHAR(50)  NOT NULL,
    province      VARCHAR(20)  NOT NULL,
    postal_code   VARCHAR(10)  NOT NULL,
    role          ENUM('REQUESTER','PROVIDER','ADMIN') NOT NULL,
    is_blocked    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------
-- SERVICES TABLE
-- Master list of available service types.
-- ----------------------------------------------------------------
CREATE TABLE services (
    service_id   INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE
);

-- ----------------------------------------------------------------
-- PROVIDER_DETAILS TABLE
-- Many-to-many: one provider can offer multiple services.
-- ----------------------------------------------------------------
CREATE TABLE provider_details (
    provider_detail_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id            INT NOT NULL,
    service_id         INT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY unique_provider_service (user_id, service_id)
);

-- ----------------------------------------------------------------
-- BOOKINGS TABLE
-- Links a requester to a provider+service combination.
-- scheduled_date is when the service should happen.
-- notes lets the requester add context for the provider.
-- ----------------------------------------------------------------
CREATE TABLE bookings (
    booking_id         INT AUTO_INCREMENT PRIMARY KEY,
    provider_detail_id INT NOT NULL,
    requester_id       INT NOT NULL,
    service_id         INT NOT NULL,
    status             ENUM('PENDING','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    scheduled_date     DATE         DEFAULT NULL,
    notes              TEXT         DEFAULT NULL,
    booking_date       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_detail_id) REFERENCES provider_details(provider_detail_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (requester_id)       REFERENCES users(user_id)                       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (service_id)         REFERENCES services(service_id)                 ON DELETE CASCADE ON UPDATE CASCADE
);
