const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const pool    = require('./config/db');
const Routes  = require('./routes/Routes');
const { initSocket } = require('./config/socket');

const app  = express();
const PORT = process.env.PORT || 5000;

//allows socket to share the server with express
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Mount auth/provider routes
app.use('/api/auth', Routes);

// Mount chat routes
const chatRoutes = require('./routes/ChatRoutes');
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => {
    res.send('Neighbourhood Booking App — API running');
});

// Test MySQL connection on startup, then start listening
pool.getConnection()
    .then(conn => {
        console.log('MySQL connected successfully');
        conn.release();

        // Attach the real-time chat layer to the same HTTP server.
        initSocket(server);

        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.error('MySQL connection failed:', err.message);
        console.error('Make sure MySQL is running and .env credentials are correct.');
        process.exit(1);
    });
