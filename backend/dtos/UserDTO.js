// dtos/UserDTO.js
// DTO shape definitions for the User entity.
// In Spring Boot you'd write separate Java classes annotated with @Data;
// in Node we define plain factory functions that enforce which fields
// are exposed for each audience (provider view, requester view, admin view, etc.).

/**
 * Public provider card — shown on the search page to any logged-in user.
 * Omits password, phone, address, date of birth.
 */
const ProviderDTO = (user, services = []) => ({
    id:          user.user_id ?? user.id,
    firstName:   user.first_name ?? user.firstName,
    lastName:    user.last_name  ?? user.lastName,
    email:       user.email,
    phoneNumber: user.phone_number ?? user.phoneNumber ?? null,
    city:        user.city,
    province:    user.province,
    role:        user.role,
    services,
});

/**
 * Requester profile — what a requester sees about themselves.
 */
const RequesterDTO = (user) => ({
    id:        user.user_id ?? user.id,
    firstName: user.first_name ?? user.firstName,
    lastName:  user.last_name  ?? user.lastName,
    email:     user.email,
    city:      user.city,
    province:  user.province,
    role:      user.role,
});

/**
 * Admin view of any user — everything except the password hash.
 * Respects privacy by not exposing raw password, but gives admins
 * the operational fields they need (blocked status, dates, address).
 */
const AdminUserDTO = (user) => ({
    id:          user.user_id ?? user.id,
    firstName:   user.first_name ?? user.firstName,
    lastName:    user.last_name  ?? user.lastName,
    email:       user.email,
    phoneNumber: user.phone_number ?? user.phoneNumber,
    city:        user.city,
    province:    user.province,
    postalCode:  user.postal_code ?? user.postalCode,
    role:        user.role,
    isBlocked:   !!(user.is_blocked ?? user.isBlocked),
    createdAt:   user.created_at ?? user.createdAt,
    updatedAt:   user.updated_at ?? user.updatedAt,
});

/**
 * Self-profile — what a logged-in user sees about themselves.
 * Includes address details and services (if provider).
 */
const ProfileDTO = (user, services = []) => ({
    id:          user.user_id ?? user.id,
    firstName:   user.first_name ?? user.firstName,
    lastName:    user.last_name  ?? user.lastName,
    email:       user.email,
    phoneNumber: user.phone_number ?? user.phoneNumber,
    dateOfBirth: user.date_of_birth ?? user.dateOfBirth,
    street:      user.street,
    city:        user.city,
    province:    user.province,
    postalCode:  user.postal_code ?? user.postalCode,
    role:        user.role,
    isBlocked:   !!(user.is_blocked ?? user.isBlocked),
    services,
    createdAt:   user.created_at ?? user.createdAt,
});

/**
 * Booking DTO — returned when listing bookings for a requester or provider.
 */
const BookingDTO = (row) => ({
    bookingId:     row.booking_id,
    status:        row.status,
    scheduledDate: row.scheduled_date,
    notes:         row.notes,
    bookingDate:   row.booking_date,
    service:       row.service_name,
    bookingType:   row.booking_type,
    batchId:       row.batch_id,
    sessionNumber: row.session_number,
    sessionsInBatch: row.sessions_in_batch,
    price:         row.price === null || row.price === undefined ? null : Number(row.price),
    discountPercent: row.discount_percent,
    paymentStatus: row.payment_status,
    declineReason: row.decline_reason,
    canCancel:     !!row.can_cancel,
    cancelDeadline: row.cancel_deadline ?? null,
    provider: {
        id:        row.provider_id,
        firstName: row.provider_first_name,
        lastName:  row.provider_last_name,
        city:      row.provider_city,
        province:  row.provider_province,
    },
    requester: {
        id:        row.requester_id,
        firstName: row.requester_first_name,
        lastName:  row.requester_last_name,
    },
    review: row.review_id ? {
        reviewId: row.review_id,
        rating:   row.review_rating,
        comment:  row.review_comment,
    } : null,
});

/**
 * Review DTO — a requester's rating/comment left against a completed booking.
 */
const ReviewDTO = (row) => ({
    reviewId:    row.review_id,
    bookingId:   row.booking_id,
    rating:      row.rating,
    comment:     row.comment,
    createdAt:   row.created_at,
    requester: {
        id:        row.requester_id,
        firstName: row.requester_first_name,
        lastName:  row.requester_last_name,
    },
});

/**
 * Availability DTO — one recurring weekly window a provider is bookable in.
 * Feeds the booking page's calendar (selectable days/times).
 */
const AvailabilityDTO = (row) => ({
    id:        row.availability_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime:   row.end_time,
});

module.exports = { ProviderDTO, RequesterDTO, AdminUserDTO, ProfileDTO, BookingDTO, ReviewDTO, AvailabilityDTO };
