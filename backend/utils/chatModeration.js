// utils/chatModeration.js
// Hook for automated message screening. Deliberately a no-op for now —
// detection rules (profanity + contact-info sharing) are a future task.
// chatController calls this before every send; swapping in real logic
// here is the only change needed to turn moderation on.

/** @returns {{ flagged: boolean, reason: string|null }} */
const moderateMessage = (_content) => {
    return { flagged: false, reason: null };
};

module.exports = { moderateMessage };
