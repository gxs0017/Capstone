// config/db.js
// Creates a reusable MySQL connection pool.
// Using a pool (not a single connection) so concurrent requests
// don't block each other and dropped connections are auto-retried.

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'bookingapp_db',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
});

module.exports = pool;
