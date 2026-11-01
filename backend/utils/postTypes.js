// utils/postTypes.js
// The Community Board's post categories (stored in posts.type). WANTED and
// OFFERING are the marketplace-style ads (a budget / a price); the rest mirror
// the everyday neighbourhood feed: general chat, for sale or free, lost & found, safety alerts, and events.

// RECOMMENDATION stays in the database enum (old rows, and the enum is never
// narrowed) but is no longer postable: recommendations are generated from
// ratings and distance instead (see directoryController.getRecommendations).
const POST_TYPES = ['GENERAL', 'WANTED', 'OFFERING', 'FOR_SALE', 'LOST_FOUND', 'SAFETY', 'EVENT'];

module.exports = { POST_TYPES };
