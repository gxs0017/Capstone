// mappers/chatMapper.js
// Runtime DB row -> DTO mappers for chat, same pattern as mappers/userMapper.js.

const { ConversationDTO, MessageDTO, FlaggedMessageDTO, BookingOptionDTO } = require('../dtos/ChatDTO');

const toConversationDTO     = (row, viewerId) => ConversationDTO(row, viewerId);
const toConversationDTOList = (rows, viewerId) => rows.map((r) => toConversationDTO(r, viewerId));

const toMessageDTO     = (row, viewerId) => MessageDTO(row, viewerId);
const toMessageDTOList = (rows, viewerId) => rows.map((r) => toMessageDTO(r, viewerId));

const toFlaggedMessageDTO     = (row) => FlaggedMessageDTO(row);
const toFlaggedMessageDTOList = (rows) => rows.map((r) => toFlaggedMessageDTO(r));

const toBookingOptionDTO     = (row) => BookingOptionDTO(row);
const toBookingOptionDTOList = (rows) => rows.map((r) => toBookingOptionDTO(r));

module.exports = {
    toConversationDTO,
    toConversationDTOList,
    toMessageDTO,
    toMessageDTOList,
    toFlaggedMessageDTO,
    toFlaggedMessageDTOList,
    toBookingOptionDTO,
    toBookingOptionDTOList,
};
