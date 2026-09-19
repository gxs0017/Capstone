const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const pool    = require('./config/db');
const Routes  = require('./routes/Routes');

const app  = express();
const PORT = process.env.PORT || 5000;

// Security headers
app.use(helmet());
// Lock CORS to the frontend origin(s); add your deployed URL to CORS_ORIGINS in .env (comma-separated)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Mount auth/provider routes
app.use('/api/auth', Routes);

app.get('/', (req, res) => {
    res.send('Neighbourhood Booking App — API running');
});

// Test MySQL connection on startup, then start listening
pool.getConnection()
    .then(conn => {
        console.log('MySQL connected successfully');
        conn.release();
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.error('MySQL connection failed:', err.message);
        console.error('Make sure MySQL is running and .env credentials are correct.');
        process.exit(1);
    });
