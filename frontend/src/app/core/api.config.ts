// Central definition of the backend API base URL.
// Change this ONE line to point the whole app at a different backend.
export const API_BASE = 'http://localhost:5000/api/auth';

// Root origin of the backend — used for the Socket.IO connection,
// which attaches at the server root (not under /api/auth).
export const SOCKET_URL = 'http://localhost:5000';
