// Quick check to see if .env is being loaded correctly
const fs = require('fs');
const path = require('path');

// Check if .env exists and read it directly
const envPath = path.join(__dirname, '.env');
console.log('.env file path:', envPath);
console.log('File exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('\nRaw .env contents:');
    console.log(content);
}

// Now try dotenv with explicit path
require('dotenv').config({ path: envPath });

console.log('\n--- After dotenv.load() ---');
console.log('Environment Variables:');
console.log('PORT:', process.env.PORT);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('\nRaw DB_PASSWORD value:', JSON.stringify(process.env.DB_PASSWORD));