-- ============================================================
-- Chat feature migration — ADDITIVE ONLY. Documents the target schema;
-- the actual migration to run is backend/run-chat-migration.js (`node
-- run-chat-migration.js` from backend/), which applies this same shape
-- idempotently against whatever DB_HOST points at in .env. It checks
-- information_schema before each ALTER instead of using "ADD COLUMN
-- IF NOT EXISTS" in raw SQL, since that clause isn't accepted here.
-- Nothing is ever dropped.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    conversation_id    INT AUTO_INCREMENT PRIMARY KEY,
    participant_one_id INT NOT NULL,
    participant_two_id INT NOT NULL,
    booking_id          INT DEFAULT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (participant_one_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (participant_two_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (booking_id)         REFERENCES bookings(booking_id) ON DELETE SET NULL ON UPDATE CASCADE,
    UNIQUE KEY uniq_participant_pair (participant_one_id, participant_two_id)
);

CREATE TABLE IF NOT EXISTS messages (
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

-- ------------------------------------------------------------------
-- Upgrade path (applied by the runner script, guarded by information_schema
-- checks rather than the ALTER clauses below): an EARLIER, simpler version
-- of this chat feature was already deployed to this database directly from
-- a prior session (conversations/messages existed without the columns
-- below, and without the one-row-per-pair UNIQUE key), so the CREATE TABLE
-- IF NOT EXISTS statements above were a no-op against it.
-- ------------------------------------------------------------------
ALTER TABLE messages ADD COLUMN ip_address  VARCHAR(64) DEFAULT NULL AFTER content;
ALTER TABLE messages ADD COLUMN status      ENUM('SENT','BLOCKED','APPROVED','REJECTED') NOT NULL DEFAULT 'SENT' AFTER ip_address;
ALTER TABLE messages ADD COLUMN flag_reason VARCHAR(255) DEFAULT NULL AFTER status;
ALTER TABLE messages ADD COLUMN reviewed_by INT DEFAULT NULL AFTER flag_reason;
ALTER TABLE messages ADD COLUMN reviewed_at DATETIME DEFAULT NULL AFTER reviewed_by;
ALTER TABLE messages ADD INDEX idx_messages_status (status);
ALTER TABLE messages ADD CONSTRAINT fk_messages_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Normalize any pre-existing conversation rows to participant_one_id <
-- participant_two_id (the app always inserts this way; older rows may predate it).
UPDATE conversations SET participant_one_id = LEAST(participant_one_id, participant_two_id),
                          participant_two_id = GREATEST(participant_one_id, participant_two_id);

ALTER TABLE conversations ADD UNIQUE INDEX uniq_participant_pair (participant_one_id, participant_two_id);
