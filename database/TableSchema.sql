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

-- ----------------------------------------------------------------
-- Conversations TABLE
-- its gonna link the service provider and the user that booked them onto a chatroom 
-- a link will also be makde that links chats to specific bookings
-- if there are any deletions it will keep that chat history but remove the link to the conversation 
-- ----------------------------------------------------------------

CREATE TABLE conversations (
    conversation_id INT AUTO_INCREMENT PRIMARY KEY,
    participant_one_id INT NOT NULL, 
    participant_two_id INT NOT NULL, 
    booking_id INT DEFAULT NULL,     
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (participant_one_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (participant_two_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- ----------------------------------------------------------------
-- Messages TABLE
-- This is for the messages sent by the users to each other 
-- It links the messages to whick chatroom/conversation it belongs to
-- it also links the messages to who sent them
-- ----------------------------------------------------------------

CREATE TABLE messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ----------------------------------------------------------------
-- These indexs are to make sure that when a user goes to thier inbox, it loads all the conversations theyve had
-- ----------------------------------------------------------------
CREATE INDEX idx_conversations_participants ON conversations(participant_one_id, participant_two_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);