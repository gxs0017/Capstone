// dtos/ChatDTO.js
// DTO shape definitions for chat entities, same pattern as dtos/UserDTO.js.
// MessageDTO is the one that matters most for privacy: it NEVER includes
// ip_address, flag_reason, reviewed_by or reviewed_at — those are admin-only
// and only ever surfaced through FlaggedMessageDTO (moderation queue).

/**
 * Conversation row as seen by one of its two participants.
 * `viewerId` picks out which side is "the other person".
 */
const ConversationDTO = (row, viewerId) => {
    const viewerIsOne = row.participant_one_id === viewerId;
    return {
        conversationId: row.conversation_id,
        otherParticipant: {
            id:        viewerIsOne ? row.participant_two_id : row.participant_one_id,
            firstName: viewerIsOne ? row.p2_first : row.p1_first,
            lastName:  viewerIsOne ? row.p2_last  : row.p1_last,
        },
        pinnedBookingId: row.booking_id,
        unreadCount:     row.unread_count !== undefined ? Number(row.unread_count) : 0,
        createdAt:       row.created_at,
        updatedAt:       row.updated_at,
    };
};

/**
 * Message row as seen by one of the conversation's participants.
 * A BLOCKED/REJECTED message carries no content for anyone but its own
 * sender, and even then only a placeholder — never raw content, ip, or
 * moderation metadata.
 */
const MessageDTO = (row, viewerId) => {
    const isMine = row.sender_id === viewerId;
    const held = row.status === 'BLOCKED' || row.status === 'REJECTED';
    return {
        messageId:      row.message_id,
        conversationId: row.conversation_id,
        senderId:       row.sender_id,
        status:         row.status,
        content:        held ? null : row.content,
        // The sender's own reference number for a held/rejected message —
        // deliberately just the message_id, nothing fancier.
        caseId:         held && isMine ? row.message_id : undefined,
        isRead:         !!row.is_read,
        createdAt:      row.created_at,
    };
};

/** Admin-only view of a held message: full content + IP + flag reason. */
const FlaggedMessageDTO = (row) => ({
    messageId:      row.message_id,
    conversationId: row.conversation_id,
    sender: {
        id:        row.sender_id,
        firstName: row.sender_first,
        lastName:  row.sender_last,
    },
    content:    row.content,
    ipAddress:  row.ip_address,
    flagReason: row.flag_reason,
    status:     row.status,
    createdAt:  row.created_at,
});

/** One of two users' shared bookings, offered as a "pin this booking" option. */
const BookingOptionDTO = (row) => ({
    bookingId:     row.booking_id,
    service:       row.service_name,
    status:        row.status,
    scheduledDate: row.scheduled_date,
    price:         row.price === null || row.price === undefined ? null : Number(row.price),
    paymentStatus: row.payment_status,
});

module.exports = { ConversationDTO, MessageDTO, FlaggedMessageDTO, BookingOptionDTO };
