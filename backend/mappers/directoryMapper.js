// mappers/directoryMapper.js
const { DirectoryDTO } = require('../dtos/DirectoryDTO');

const toDirectoryDTOList = (rows) => rows.map((r) => DirectoryDTO(r));

module.exports = { toDirectoryDTOList };
