// mappers/userMapper.js
// Node.js equivalent of Spring Boot's MapStruct.
// Instead of compile-time code generation (like MapStruct annotations),
// we use runtime mapper functions that convert DB entities → DTOs.
//
// Why this pattern?
// - Keeps controllers thin: controller calls mapper, returns DTO.
// - Single source of truth for field mapping logic.
// - Easy to test: pure functions, no side effects.
// - Prevents accidental data leaks (password hash never leaves the mapper).

const { ProviderDTO, RequesterDTO, AdminUserDTO, ProfileDTO, BookingDTO } = require('../dtos/UserDTO');

// ── Single-entity mappers ────────────────────────────────────────────────────

const toProviderDTO   = (user, services = []) => ProviderDTO(user, services);
const toRequesterDTO  = (user)                => RequesterDTO(user);
const toAdminUserDTO  = (user)                => AdminUserDTO(user);
const toProfileDTO    = (user, services = []) => ProfileDTO(user, services);
const toBookingDTO    = (row)                 => BookingDTO(row);

// ── Collection mappers ───────────────────────────────────────────────────────

const toProviderDTOList  = (users)    => users.map(u => toProviderDTO(u, u.services || []));
const toAdminUserDTOList = (users)    => users.map(u => toAdminUserDTO(u));
const toBookingDTOList   = (rows)     => rows.map(r => toBookingDTO(r));

// ── Role-aware profile mapper ────────────────────────────────────────────────
// Picks the right DTO based on the user's role, similar to how you'd use
// @Mapping(target = "...") conditional logic in a MapStruct decorator.

const toRoleBasedProfile = (user, services = []) => {
    switch (user.role) {
        case 'PROVIDER':
            return toProfileDTO(user, services);
        case 'ADMIN':
            return toProfileDTO(user, []);
        case 'REQUESTER':
        default:
            return toProfileDTO(user, []);
    }
};

module.exports = {
    toProviderDTO,
    toRequesterDTO,
    toAdminUserDTO,
    toProfileDTO,
    toBookingDTO,
    toProviderDTOList,
    toAdminUserDTOList,
    toBookingDTOList,
    toRoleBasedProfile,
};
