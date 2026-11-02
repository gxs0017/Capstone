// dtos/PostDTO.js
// Community Board DTOs — same pattern as dtos/UserDTO.js / ChatDTO.js.

const PostDTO = (row) => ({
    postId:       row.post_id,
    type:         row.type,
    title:        row.title,
    description:  row.description,
    price:        row.price === null || row.price === undefined ? null : Number(row.price),
    city:         row.city,
    neighbourhood: row.neighbourhood ?? null,
    status:       row.status,
    moderationReason: row.moderation_reason ?? null,
    createdAt:    row.created_at,
    likeCount:    Number(row.like_count) || 0,
    commentCount: Number(row.comment_count) || 0,
    likedByMe:    Number(row.liked_by_me) > 0,
    poster: {
        id:        row.user_id,
        firstName: row.poster_first,
        lastName:  row.poster_last,
        role:      row.poster_role,
    },
});

const CommentDTO = (row) => ({
    commentId: row.comment_id,
    postId:    row.post_id,
    parentId:  row.parent_id,
    content:   row.content,
    createdAt: row.created_at,
    author: {
        id:        row.user_id,
        firstName: row.author_first,
        lastName:  row.author_last,
        role:      row.author_role,
    },
});

module.exports = { PostDTO, CommentDTO };
