-- ============================================================
-- Neighbourhood Booking App — Database Schema
-- Run this file FIRST to create the database and all tables.
-- ============================================================

CREATE DATABASE IF NOT EXISTS bookingapp_db;
USE bookingapp_db;

-- Drop in reverse FK order so constraints don't block drops
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS provider_availability;
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
    service_name VARCHAR(100) NOT NULL UNIQUE,
    base_price   DECIMAL(8,2) NOT NULL DEFAULT 25.00  -- price of ONE session; recurring packs are discounted off this
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
-- PROVIDER_AVAILABILITY TABLE
-- A provider's recurring weekly availability, expressed as one row
-- per (day_of_week, start_time, end_time) window. A provider can have
-- multiple windows on the same day. day_of_week follows JS/MySQL
-- DAYOFWEEK-style numbering used by the frontend calendar: 0=Sunday,
-- 1=Monday, ... 6=Saturday. The booking calendar reads this table to
-- decide which dates/times are selectable for a given provider.
-- ----------------------------------------------------------------
CREATE TABLE provider_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    day_of_week      TINYINT NOT NULL,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_availability_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_availability_time_range CHECK (start_time < end_time)
);

-- ----------------------------------------------------------------
-- BOOKINGS TABLE
-- Links a requester to a provider+service combination.
-- scheduled_date is the date AND time the service should happen,
-- chosen from the provider's availability on the booking calendar.
-- notes lets the requester add context for the provider.
--
-- booking_type  ONE_TIME = single session, pay on arrival.
--               RECURRING = a prepaid weekly pack; one row per session,
--               all rows share batch_id (session_number 1..sessions_in_batch).
-- price         what this ONE session costs after any recurring discount.
-- payment_status  UNPAID (pay on arrival) / PAID (prepaid pack) / REFUNDED
--               (a prepaid session that was cancelled or declined).
-- DECLINED      the provider refused a PENDING request (decline_reason optional).
-- ----------------------------------------------------------------
CREATE TABLE bookings (
    booking_id         INT AUTO_INCREMENT PRIMARY KEY,
    provider_detail_id INT NOT NULL,
    requester_id       INT NOT NULL,
    service_id         INT NOT NULL,
    status             ENUM('PENDING','CONFIRMED','CANCELLED','DECLINED','COMPLETED') NOT NULL DEFAULT 'PENDING',
    scheduled_date     DATETIME     DEFAULT NULL,
    notes              TEXT         DEFAULT NULL,
    booking_type       ENUM('ONE_TIME','RECURRING') NOT NULL DEFAULT 'ONE_TIME',
    batch_id           CHAR(36)     DEFAULT NULL,
    session_number     TINYINT      NOT NULL DEFAULT 1,
    sessions_in_batch  TINYINT      NOT NULL DEFAULT 1,
    price              DECIMAL(8,2) DEFAULT NULL,
    discount_percent   TINYINT      NOT NULL DEFAULT 0,
    payment_status     ENUM('UNPAID','PAID','REFUNDED') NOT NULL DEFAULT 'UNPAID',
    decline_reason     VARCHAR(255) DEFAULT NULL,
    booking_date       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_detail_id) REFERENCES provider_details(provider_detail_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (requester_id)       REFERENCES users(user_id)                       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (service_id)         REFERENCES services(service_id)                 ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_bookings_batch (batch_id),
    INDEX idx_bookings_provider_time (provider_detail_id, scheduled_date)
);

-- ----------------------------------------------------------------
-- REVIEWS TABLE
-- One review per booking, left by the requester once a booking's
-- status reaches COMPLETED. provider_id is the reviewed provider's
-- user_id (denormalized off the booking) so average-rating lookups
-- don't need to join through provider_details/bookings each time.
-- ----------------------------------------------------------------
CREATE TABLE reviews (
    review_id    INT AUTO_INCREMENT PRIMARY KEY,
    booking_id   INT NOT NULL UNIQUE,
    requester_id INT NOT NULL,
    provider_id  INT NOT NULL,
    rating       TINYINT NOT NULL,
    comment      TEXT DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (provider_id)  REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);
