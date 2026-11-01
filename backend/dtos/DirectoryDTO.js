// dtos/DirectoryDTO.js
// One directory listing — service providers only. No entry ever carries an
// email, phone number or street address.

const PROXIMITY = ['SAME_NEIGHBOURHOOD', 'SAME_CITY', 'SAME_PROVINCE', 'ELSEWHERE'];

const parseServices = (value) => {
    if (!value) return [];
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    return list.map((s) => ({ name: s.name, price: Number(s.price) }));
};

const DirectoryDTO = (row) => {
    return {
        id:          row.id,
        firstName:   row.first_name,
        lastName:    row.last_name,
        role:        row.role,
        city:        row.city,
        province:    row.province,
        neighbourhood: row.neighbourhood || null,
        bio:         row.bio || null,
        proximity:   PROXIMITY[Number(row.proximity)] || 'ELSEWHERE',
        memberSince: row.created_at,
        avgRating:   row.avgRating !== null && row.avgRating !== undefined ? Number(row.avgRating) : null,
        reviewCount: Number(row.reviewCount) || 0,
        completedJobs: Number(row.completedJobs) || 0,
        services:    parseServices(row.services),
    };
};

module.exports = { DirectoryDTO };
