// controllers/postController.js
// Community Board: a neighbourhood feed alongside the normal search/book flow.
// Anyone can browse and read the comments; logged-in requesters/providers can
// post, comment, reply and like; admins moderate (delete posts and comments)
// but don't take part themselves.

const pool = require('../config/db');
const { emitToBoard, emitToPost } = require('../config/socket');
const Post = require('../models/Post');
const { POST_TYPES } = require('../utils/postTypes');
const { toPostDTO, toPostDTOList, toCommentDTO, toCommentDTOList } = require('../mappers/postMapper');
const { logAction } = require('../models/AuditLog');

// Live like/comment counts for everyone watching the board or that post
const emitStats = async (postId) => {
    try {
        const post = await Post.getPostById(postId);
        if (!post) return;
        const stats = { postId: post.post_id, likeCount: Number(post.like_count) || 0, commentCount: Number(post.comment_count) || 0 };
        emitToBoard('post:stats', stats);
        emitToPost(postId, 'post:stats', stats);
    } catch (err) {
        console.error('emitStats failed:', err.message);
    }
};

// ----------------------------------------------------------------
// GET /posts — public board feed (signed-in viewers also get likedByMe)
// Query: type, search, city, page, limit
// ----------------------------------------------------------------
const getPosts = async (req, res) => {
    try {
        const { type, search, city, scope, page, limit } = req.query;
        if (type && !POST_TYPES.includes(type)) {
            return res.status(400).json({ message: 'Unknown post category.' });
        }
        // scope=neighbourhood narrows the feed to the signed-in viewer's own neighbourhood
        let neighbourhoodId = null;
        if (scope === 'neighbourhood' && req.user) {
            const [rows] = await pool.execute('SELECT neighbourhood_id FROM users WHERE user_id = ?', [req.user.id]);
            neighbourhoodId = rows[0] ? rows[0].neighbourhood_id : null;
        }
        const result = await Post.listPosts({ type, search, city, neighbourhoodId }, page, limit, req.user ? req.user.id : null);
        return res.json({ ...result, data: toPostDTOList(result.data) });
    } catch (err) {
        console.error('getPosts error:', err);
        return res.status(500).json({ message: 'Error loading posts.' });
    }
};

// ----------------------------------------------------------------
// GET /posts/mine — the current user's own posts (any status)
// ----------------------------------------------------------------
const getMyPosts = async (req, res) => {
    try {
        const rows = await Post.listPostsByUser(req.user.id);
        return res.json(toPostDTOList(rows));
    } catch (err) {
        console.error('getMyPosts error:', err);
        return res.status(500).json({ message: 'Error loading your posts.' });
    }
};

// ----------------------------------------------------------------
// GET /posts/:id — one post (public; closed posts stay viewable by link)
// ----------------------------------------------------------------
const getPost = async (req, res) => {
    try {
        const post = await Post.getPostById(req.params.id, req.user ? req.user.id : null);
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        return res.json(toPostDTO(post));
    } catch (err) {
        console.error('getPost error:', err);
        return res.status(500).json({ message: 'Error loading the post.' });
    }
};

// ----------------------------------------------------------------
// POST /posts — create a post
// Body: { type, title, description, price?, city? }
// A post with no city is tagged with the poster's own city so area filtering works.
// ----------------------------------------------------------------
const createPost = async (req, res) => {
    try {
        const { type, title, description, price, city } = req.body;

        // Posts are tagged with the poster's city and neighbourhood (from their profile)
        const [[poster]] = await pool.execute('SELECT city, neighbourhood_id FROM users WHERE user_id = ?', [req.user.id]);
        let postCity = city ? String(city).trim().slice(0, 50) : null;
        if (!postCity) postCity = poster ? poster.city : null;

        const post = await Post.createPost({
            userId: req.user.id,
            type,
            title: title.trim().slice(0, 150),
            description: description.trim().slice(0, 2000),
            price: price != null && price !== '' ? Number(price) : null,
            city: postCity,
            neighbourhoodId: poster ? poster.neighbourhood_id : null,
        });

        logAction(req.user.id, 'POST_CREATED', `post: ${post.post_id}, type: ${type}`, req.ip);
        emitToBoard('post:new', { ...toPostDTO(post), likedByMe: false });
        return res.status(201).json(toPostDTO(post));
    } catch (err) {
        console.error('createPost error:', err);
        return res.status(500).json({ message: 'Error creating post.' });
    }
};

// ----------------------------------------------------------------
// PATCH /posts/:id/close — poster marks their own post fulfilled/closed
// ----------------------------------------------------------------
const closePost = async (req, res) => {
    try {
        const closed = await Post.closePost(req.params.id, req.user.id);
        if (!closed) {
            return res.status(404).json({ message: 'Post not found, or it is not yours to close.' });
        }
        logAction(req.user.id, 'POST_CLOSED', `post: ${req.params.id}`, req.ip);
        emitToBoard('post:removed', { postId: Number(req.params.id) });
        return res.json({ message: 'Post closed.' });
    } catch (err) {
        console.error('closePost error:', err);
        return res.status(500).json({ message: 'Error closing post.' });
    }
};

// ----------------------------------------------------------------
// DELETE /admin/posts/:id — admin moderation
// ----------------------------------------------------------------
const deletePostAdmin = async (req, res) => {
    try {
        const deleted = await Post.deletePost(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: 'Post not found.' });
        }
        logAction(req.user.id, 'POST_DELETED_BY_ADMIN', `post: ${req.params.id}`, req.ip);
        emitToBoard('post:removed', { postId: Number(req.params.id) });
        return res.json({ message: 'Post deleted.' });
    } catch (err) {
        console.error('deletePostAdmin error:', err);
        return res.status(500).json({ message: 'Error deleting post.' });
    }
};

// ----------------------------------------------------------------
// GET /posts/:id/comments — public comment thread
// ----------------------------------------------------------------
const getComments = async (req, res) => {
    try {
        const post = await Post.getPostById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        const rows = await Post.listComments(req.params.id);
        return res.json(toCommentDTOList(rows));
    } catch (err) {
        console.error('getComments error:', err);
        return res.status(500).json({ message: 'Error loading comments.' });
    }
};

// ----------------------------------------------------------------
// POST /posts/:id/comments — comment on a post, or reply to a comment
// Body: { content, parentId? }   Replies nest one level deep: replying to a
// reply attaches to the same top-level comment.
// ----------------------------------------------------------------
const addComment = async (req, res) => {
    try {
        const post = await Post.getPostById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        if (post.status !== 'OPEN') {
            return res.status(400).json({ message: 'This post is closed, so it no longer accepts comments.' });
        }

        let parentId = null;
        if (req.body.parentId) {
            const parent = await Post.getComment(req.body.parentId);
            if (!parent || parent.post_id !== post.post_id) {
                return res.status(400).json({ message: 'The comment you are replying to no longer exists.' });
            }
            parentId = parent.parent_id || parent.comment_id;
        }

        const comment = await Post.addComment({
            postId: post.post_id,
            userId: req.user.id,
            parentId,
            content: req.body.content.trim(),
        });

        logAction(req.user.id, 'COMMENT_CREATED', `post: ${post.post_id}, comment: ${comment.comment_id}`, req.ip);
        emitToPost(post.post_id, 'comment:new', toCommentDTO(comment));
        await emitStats(post.post_id);
        return res.status(201).json(toCommentDTO(comment));
    } catch (err) {
        console.error('addComment error:', err);
        return res.status(500).json({ message: 'Error posting comment.' });
    }
};

// ----------------------------------------------------------------
// DELETE /posts/:id/comments/:commentId — the author, or an admin
// ----------------------------------------------------------------
const deleteComment = async (req, res) => {
    try {
        const comment = await Post.getComment(req.params.commentId);
        if (!comment || String(comment.post_id) !== String(req.params.id)) {
            return res.status(404).json({ message: 'Comment not found.' });
        }
        const isAdmin = req.user.role === 'ADMIN';
        if (comment.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ message: 'You can only delete your own comments.' });
        }
        await Post.deleteComment(comment.comment_id);
        emitToPost(comment.post_id, 'comment:removed', { postId: comment.post_id, commentId: comment.comment_id });
        await emitStats(comment.post_id);
        logAction(req.user.id, isAdmin && comment.user_id !== req.user.id ? 'COMMENT_DELETED_BY_ADMIN' : 'COMMENT_DELETED',
            `post: ${comment.post_id}, comment: ${comment.comment_id}`, req.ip);
        return res.json({ message: 'Comment deleted.' });
    } catch (err) {
        console.error('deleteComment error:', err);
        return res.status(500).json({ message: 'Error deleting comment.' });
    }
};

// ----------------------------------------------------------------
// POST /posts/:id/like — toggle your like on a post
// ----------------------------------------------------------------
const toggleLike = async (req, res) => {
    try {
        const post = await Post.getPostById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        const result = await Post.toggleLike(post.post_id, req.user.id);
        await emitStats(post.post_id);
        return res.json(result);
    } catch (err) {
        console.error('toggleLike error:', err);
        return res.status(500).json({ message: 'Error updating your like.' });
    }
};

module.exports = {
    getPosts, getMyPosts, getPost, createPost, closePost, deletePostAdmin,
    getComments, addComment, deleteComment, toggleLike,
};
