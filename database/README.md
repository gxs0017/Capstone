# MySQL connection
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=[change to use your password]
DB_NAME=bookingapp_db

# JWT
JWT_SECRET=nbapp_jwt_secret_change_me
JWT_EXPIRES_IN=7d

# Server
PORT=5000


## Scripts

- `TableSchema.sql` — the full, current schema (use this for a fresh database).
- `MockData.sql` — sample data.
- `import-neighbourhoods.js` — refreshes the neighbourhood list from OpenStreetMap: `cd database && node import-neighbourhoods.js`.
