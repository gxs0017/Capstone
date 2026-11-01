// models/Post.js
// MySQL query functions for the Community Board: posts, comments and likes.

const pool = require('../config/db');

// Every post query carries the poster plus like/comment counts and whether
// the (optional) viewer has liked it, so list and detail views share one shape.
const postSelect = (withViewer) => `
    SELECT p.*, u.first_name AS poster_first, u.last_name AS poster_last, u.role AS poster_role,
           (SELECT nb.name FROM neighbourhoods nb WHERE nb.neighbourhood_id = p.neighbourhood_id) AS neighbourhood,
           (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)    AS like_count,
           (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.post_id) AS comment_count,
           ${withViewer
               ? '(SELECT COUNT(*) FROM post_likes lm WHERE lm.post_id = p.post_id AND lm.user_id = ?)'
               : '0'} AS liked_by_me
    FROM posts p
    JOIN users u ON p.user_id = u.user_id`;

/**
 * Paginated, filterable board feed (open posts only), newest first.
 * filters: { type, search, city } — all optional.
 */
const listPosts = async ({ type, search, city, neighbourhoodId } = {}, page = 1, limit = 12, viewerId = null) => {
    const safePage  = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const offset    = (safePage - 1) * safeLimit;

    let where = "WHERE p.status = 'OPEN'";
    const filterParams = [];
    if (type) {
        where += ' AND p.type = ?';
        filterParams.push(type);
    }
    if (neighbourhoodId) {
        where += ' AND p.neighbourhood_id = ?';
        filterParams.push(neighbourhoodId);
    } else if (city) {
        where += ' AND LOWER(p.city) = LOWER(?)';
        filterParams.push(city);
    }
    if (search) {
        where += ' AND (p.title LIKE ? OR p.description LIKE ?)';
        const term = `%${search}%`;
        filterParams.push(term, term);
    }

    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM posts p ${where}`, filterParams);

    const params = viewerId ? [viewerId, ...filterParams] : filterParams;
    const [rows] = await pool.execute(
        `${postSelect(!!viewerId)} ${where}
         ORDER BY p.created_at DESC, p.post_id DESC
         LIMIT ${safeLimit} OFFSET ${offset}`,
        params
    );

    return { data: rows, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
};

/** A user's own posts, any status — for "My Posts". */
const listPostsByUser = async (userId) => {
    const [rows] = await pool.execute(
        `${postSelect(true)} WHERE p.user_id = ? ORDER BY p.created_at DESC`,
        [userId, userId]
    );
    return rows;
};

const getPostById = async (postId, viewerId = null) => {
    const [rows] = await pool.execute(
        `${postSelect(!!viewerId)} WHERE p.post_id = ?`,
        viewerId ? [viewerId, postId] : [postId]
    );
    return rows[0] || null;
};

const createPost = async ({ userId, type, title, description, price, city, neighbourhoodId }) => {
    const [result] = await pool.execute(
        `INSERT INTO posts (user_id, type, title, description, price, city, neighbourhood_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, type, title, description, price ?? null, city || null, neighbourhoodId || null]
    );
    return getPostById(result.insertId, userId);
};

/** Poster closes their own post (marks fulfilled, hides it from the board). */
const closePost = async (postId, userId) => {
    const [result] = await pool.execute(
        "UPDATE posts SET status = 'CLOSED' WHERE post_id = ? AND user_id = ?",
        [postId, userId]
    );
    return result.affectedRows > 0;
};

/** Admin-only hard delete (moderation). Comments and likes go with it. */
const deletePost = async (postId) => {
    const [result] = await pool.execute('DELETE FROM posts WHERE post_id = ?', [postId]);
    return result.affectedRows > 0;
};

// ── Comments ──────────────────────────────────────────────────────────────────

/** Every comment on a post, oldest first (the UI nests replies under their parent). */
const listComments = async (postId) => {
    const [rows] = await pool.execute(
        `SELECT c.*, u.first_name AS author_first, u.last_name AS author_last, u.role AS author_role
         FROM post_comments c
         JOIN users u ON c.user_id = u.user_id
         WHERE c.post_id = ?
         ORDER BY c.created_at ASC, c.comment_id ASC`,
        [postId]
    );
    return rows;
};

const getComment = async (commentId) => {
    const [rows] = await pool.execute(
        `SELECT c.*, u.first_name AS author_first, u.last_name AS author_last, u.role AS author_role
         FROM post_comments c
         JOIN users u ON c.user_id = u.user_id
         WHERE c.comment_id = ?`,
        [commentId]
    );
    return rows[0] || null;
};

const addComment = async ({ postId, userId, parentId, content }) => {
    const [result] = await pool.execute(
        'INSERT INTO post_comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)',
        [postId, userId, parentId || null, content]
    );
    return getComment(result.insertId);
};

/** Deletes a comment and (by cascade) any replies under it. */
const deleteComment = async (commentId) => {
    const [result] = await pool.execute('DELETE FROM post_comments WHERE comment_id = ?', [commentId]);
    return result.affectedRows > 0;
};

// ── Likes ─────────────────────────────────────────────────────────────────────

/** Like if not liked, unlike if already liked. Returns the new state + count. */
const toggleLike = async (postId, userId) => {
    const [existing] = await pool.execute(
        'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]
    );
    if (existing.length > 0) {
        await pool.execute('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
    } else {
        await pool.execute('INSERT IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
    }
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM post_likes WHERE post_id = ?', [postId]);
    return { liked: existing.length === 0, likeCount: Number(total) };
};

module.exports = {
    listPosts, listPostsByUser, getPostById, createPost, closePost, deletePost,
    listComments, getComment, addComment, deleteComment, toggleLike,
};
