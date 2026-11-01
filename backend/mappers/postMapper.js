// mappers/postMapper.js
const { PostDTO, CommentDTO } = require('../dtos/PostDTO');

const toPostDTO         = (row) => PostDTO(row);
const toPostDTOList     = (rows) => rows.map((r) => toPostDTO(r));
const toCommentDTO      = (row) => CommentDTO(row);
const toCommentDTOList  = (rows) => rows.map((r) => toCommentDTO(r));

module.exports = { toPostDTO, toPostDTOList, toCommentDTO, toCommentDTOList };
