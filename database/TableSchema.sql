-- ============================================================
-- Neighborhood Booking App — Database Schema
-- Run this file FIRST to create the database and all tables.
-- ============================================================

CREATE DATABASE IF NOT EXISTS bookingapp_db;
USE bookingapp_db;

-- Drop in reverse FK order so constraints don't block drops
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS payouts;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS post_comments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS provider_availability;
DROP TABLE IF EXISTS provider_details;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS neighbourhoods;

-- ----------------------------------------------------------------
-- USERS TABLE
-- Stores PROVIDER, REQUESTER, and ADMIN accounts.
-- is_blocked lets admins restrict accounts without deleting them.
-- deleted_at is a SOFT delete: an admin "delete" only stamps this column, so the
-- row, its bookings and reviews stay for history. Deleted users cannot log in
-- and are hidden from search and admin lists.
-- ----------------------------------------------------------------
-- Named areas inside a city, imported from OpenStreetMap (source 'OSM') plus
-- one fallback row per postal area (source 'POSTAL', e.g. "Brampton (L6X)").
-- Users are matched to the nearest named area automatically; see utils/neighbourhoods.js.
CREATE TABLE neighbourhoods (
    neighbourhood_id INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    source     ENUM('OSM','POSTAL') NOT NULL,
    ext_key    VARCHAR(40)  NOT NULL,
    province   CHAR(2)      DEFAULT NULL,
    lat        DECIMAL(9,6) DEFAULT NULL,
    lng        DECIMAL(9,6) DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_neighbourhood_source (source, ext_key),
    INDEX idx_neighbourhood_geo (source, lat, lng)
);

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
    deleted_at    DATETIME     DEFAULT NULL,
    bio           VARCHAR(300) DEFAULT NULL,           -- provider's "about me" (directory + storefront)
    directory_visible BOOLEAN  NOT NULL DEFAULT FALSE, -- legacy; the directory now lists providers only
    lat           DECIMAL(9,6) DEFAULT NULL,           -- from the address lookup / geocoder
    lng           DECIMAL(9,6) DEFAULT NULL,
    neighbourhood_id INT       DEFAULT NULL,           -- worked out automatically from lat/lng (see neighbourhoods)
    show_email    BOOLEAN      NOT NULL DEFAULT FALSE, -- provider privacy: show email on public profile
    show_phone    BOOLEAN      NOT NULL DEFAULT FALSE, -- provider privacy: show phone on public profile
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
    price              DECIMAL(8,2) DEFAULT NULL,  -- provider's own price for this service; NULL = use services.base_price
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
-- payment_status  UNPAID (pay on arrival) / PAID (prepaid pack or paid online) / REFUNDED / FAILED (online payment error)
--               (a prepaid session that was cancelled or declined).
-- DECLINED      the provider refused a PENDING request (decline_reason optional).
-- cancelled_by / cancelled_at / cancel_reason  cancellation log: who cancelled
--               (user_id; NULL if that user was later removed), when, and why.
-- EXPIRED       a PENDING request nobody accepted within PENDING_EXPIRY_HOURS of
--               being made, or before its start time (set by utils/bookingExpiry.js;
--               a prepaid session is flagged REFUNDED).
-- ----------------------------------------------------------------
CREATE TABLE bookings (
    booking_id         INT AUTO_INCREMENT PRIMARY KEY,
    provider_detail_id INT NOT NULL,
    requester_id       INT NOT NULL,
    service_id         INT NOT NULL,
    status             ENUM('PENDING','CONFIRMED','CANCELLED','DECLINED','COMPLETED','EXPIRED') NOT NULL DEFAULT 'PENDING',
    scheduled_date     DATETIME     DEFAULT NULL,
    notes              TEXT         DEFAULT NULL,
    booking_type       ENUM('ONE_TIME','RECURRING') NOT NULL DEFAULT 'ONE_TIME',
    batch_id           CHAR(36)     DEFAULT NULL,
    session_number     TINYINT      NOT NULL DEFAULT 1,
    sessions_in_batch  TINYINT      NOT NULL DEFAULT 1,
    price              DECIMAL(8,2) DEFAULT NULL,
    discount_percent   TINYINT      NOT NULL DEFAULT 0,
    payment_status     ENUM('UNPAID','PAID','REFUNDED','FAILED') NOT NULL DEFAULT 'UNPAID',
    payment_method     VARCHAR(20)  DEFAULT NULL,   -- 'paypal' / 'stripe' when paid online
    amount             DECIMAL(8,2) DEFAULT NULL,   -- amount charged online
    paypal_order_id    VARCHAR(64)  DEFAULT NULL,
    paypal_capture_id  VARCHAR(64)  DEFAULT NULL,
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    decline_reason     VARCHAR(255) DEFAULT NULL,
    cancelled_by       INT          DEFAULT NULL,
    cancelled_at       DATETIME     DEFAULT NULL,
    cancel_reason      VARCHAR(255) DEFAULT NULL,
    completed_at       DATETIME     DEFAULT NULL,
    auto_completed     BOOLEAN      NOT NULL DEFAULT FALSE,
    issue_reported_at  DATETIME     DEFAULT NULL,
    issue_note         VARCHAR(255) DEFAULT NULL,
    booking_date       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_detail_id) REFERENCES provider_details(provider_detail_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (requester_id)       REFERENCES users(user_id)                       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (service_id)         REFERENCES services(service_id)                 ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (cancelled_by)       REFERENCES users(user_id)                       ON DELETE SET NULL ON UPDATE CASCADE,
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

-- ----------------------------------------------------------------
-- AUDIT_LOGS TABLE
-- Account/security activity (register, login, booking changes, admin
-- actions). Written by models/AuditLog.js; read at GET /admin/audit-logs.
-- user_id is not a foreign key so the log survives user removal.
-- ----------------------------------------------------------------
CREATE TABLE audit_logs (
    audit_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT DEFAULT NULL,
    action     VARCHAR(50) NOT NULL,
    details    VARCHAR(1000) DEFAULT NULL,
    ip_address VARCHAR(64) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
);

-- ----------------------------------------------------------------
-- CONVERSATIONS TABLE
-- One row per *person pair* (not per booking) — any user can message
-- any other user. participant_one_id is always the smaller user_id of
-- the pair so the same two people always collide on the same row
-- regardless of who started the conversation (enforced by the app layer,
-- see models/Chat.js normalizePair, plus the unique key below as a backstop).
-- booking_id is the "pinned" booking for this conversation — a participant
-- can pin/unpin/change it from the chat UI so price, status and the
-- confirmation number sit at the top of the thread instead of being
-- asked about repeatedly. NULL = nothing pinned.
-- ----------------------------------------------------------------
CREATE TABLE conversations (
    conversation_id    INT AUTO_INCREMENT PRIMARY KEY,
    participant_one_id INT NOT NULL,
    participant_two_id INT NOT NULL,
    booking_id          INT DEFAULT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    read_only_for       INT DEFAULT NULL,   -- this participant can read but not reply (admin notices)
    FOREIGN KEY (participant_one_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (participant_two_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (booking_id)         REFERENCES bookings(booking_id) ON DELETE SET NULL ON UPDATE CASCADE,
    UNIQUE KEY uniq_participant_pair (participant_one_id, participant_two_id)
);

-- ----------------------------------------------------------------
-- MESSAGES TABLE
-- ip_address is captured for every message for incident/abuse investigation
-- ONLY — it must never be returned by the participant-facing chat API
-- (see dtos/ChatDTO.js), only ever readable by an admin/DB-level query.
--
-- status / flag_reason / reviewed_by / reviewed_at support message
-- moderation: a message is normally 'SENT' (delivered immediately).
-- A future automated check (see utils/chatModeration.js, currently a
-- no-op stub) can mark one 'BLOCKED' with a flag_reason instead of
-- delivering it; the sender sees a "held for review" placeholder
-- referencing message_id as the case/blocking id, the recipient sees
-- nothing. An admin then 'APPROVE's it (delivered after the fact) or
-- 'REJECT's it (stays hidden permanently).
-- ----------------------------------------------------------------
CREATE TABLE messages (
    message_id      INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id       INT NOT NULL,
    content         TEXT NOT NULL,
    ip_address      VARCHAR(64) DEFAULT NULL,
    status          ENUM('SENT','BLOCKED','APPROVED','REJECTED') NOT NULL DEFAULT 'SENT',
    flag_reason     VARCHAR(255) DEFAULT NULL,
    reviewed_by     INT DEFAULT NULL,
    reviewed_at     DATETIME DEFAULT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (sender_id)       REFERENCES users(user_id)                 ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (reviewed_by)     REFERENCES users(user_id)                 ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_messages_conversation (conversation_id, created_at),
    INDEX idx_messages_status (status)
);

-- ----------------------------------------------------------------
-- POSTS TABLE
-- The Community Board: a classifieds-style board that sits alongside the
-- normal search/book flow. Any logged-in user (REQUESTER or PROVIDER) can
-- post. type = 'WANTED' is "I need help with X"; type = 'OFFERING' is a
-- provider advertising a service with a price (separate from, and not
-- required to match, their structured provider_details listings — this is
-- just a classified ad). No category/service link by design: fully
-- free-text title + description, matching the search-by-keyword board UX
-- rather than the structured Browse Services filters.
-- ----------------------------------------------------------------
CREATE TABLE posts (
    post_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    type        ENUM('GENERAL','WANTED','OFFERING','RECOMMENDATION','FOR_SALE','LOST_FOUND','SAFETY','EVENT') NOT NULL DEFAULT 'GENERAL',
    title       VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    price       DECIMAL(8,2) DEFAULT NULL,
    city        VARCHAR(50) DEFAULT NULL,
    status      ENUM('OPEN','CLOSED','ARCHIVED','REMOVED') NOT NULL DEFAULT 'OPEN',
    moderation_reason VARCHAR(255) DEFAULT NULL,
    moderated_by INT DEFAULT NULL,
    moderated_at DATETIME DEFAULT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_posts_type_status (type, status),
    INDEX idx_posts_created (created_at),
    neighbourhood_id INT DEFAULT NULL,
    INDEX idx_posts_city (city),
    INDEX idx_posts_neighbourhood (neighbourhood_id)
);

-- Public comments (one level of replies) and "Thanks" likes on board posts.
CREATE TABLE post_comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    parent_id  INT DEFAULT NULL,
    content    VARCHAR(1000) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id)   REFERENCES posts(post_id)            ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(user_id)            ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES post_comments(comment_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_comments_post (post_id, created_at)
);

CREATE TABLE post_likes (
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ----------------------------------------------------------------
-- PAYMENTS TABLE (ledger)
-- One row per paid booking session. Amount is always computed server-side
-- from the stored booking price. HELD = captured, waiting for the job to be
-- confirmed done; RELEASED = provider earned it; REFUNDED / REFUND_FAILED =
-- cancelled/expired/declined bookings (failed refunds are retried).
-- ----------------------------------------------------------------
CREATE TABLE payments (
    payment_id      INT AUTO_INCREMENT PRIMARY KEY,
    booking_id      INT NOT NULL,
    payer_id        INT NOT NULL,
    provider_id     INT NOT NULL,
    method          VARCHAR(20)  NOT NULL,
    external_ref    VARCHAR(255) DEFAULT NULL,
    currency        CHAR(3)      NOT NULL DEFAULT 'CAD',
    amount          DECIMAL(8,2) NOT NULL,
    platform_fee    DECIMAL(8,2) NOT NULL DEFAULT 0,
    provider_amount DECIMAL(8,2) NOT NULL,
    status          ENUM('HELD','RELEASED','REFUNDED','REFUND_FAILED') NOT NULL DEFAULT 'HELD',
    refund_error    VARCHAR(255) DEFAULT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    released_at     DATETIME DEFAULT NULL,
    refunded_at     DATETIME DEFAULT NULL,
    available_at    DATETIME DEFAULT NULL,   -- released_at + 7 days: when the provider may withdraw
    payout_id       INT DEFAULT NULL,        -- set once withdrawn
    UNIQUE KEY uniq_payment_booking (booking_id),
    FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (payer_id)    REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_payments_provider (provider_id, status),
    INDEX idx_payments_payer (payer_id)
);


CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    type       VARCHAR(40)  NOT NULL,
    title      VARCHAR(120) NOT NULL,
    body       VARCHAR(500) DEFAULT NULL,
    link       VARCHAR(120) DEFAULT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_notifications_user (user_id, is_read, created_at)
);

CREATE TABLE payouts (
    payout_id    INT AUTO_INCREMENT PRIMARY KEY,
    provider_id  INT NOT NULL,
    amount       DECIMAL(10,2) NOT NULL,
    currency     CHAR(3) NOT NULL DEFAULT 'CAD',
    status       ENUM('REQUESTED','PAID','FAILED') NOT NULL DEFAULT 'REQUESTED',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at      DATETIME DEFAULT NULL,
    FOREIGN KEY (provider_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_payouts_provider (provider_id, status)
);
