// Test script for sorting feature verification
// This will be deleted after testing is complete

const http = require('http');

const BASE_URL = 'http://localhost:5000';

function makeRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('=== Sorting Feature Test ===\n');
    
    // Step 1: Login to get JWT token
    console.log('Step 1: Logging in...');
    const loginRes = await makeRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email: 'test@example.com', password: 'password123' });
    
    if (loginRes.status !== 200) {
        console.log('Login failed. Trying to register first...');
        const regRes = await makeRequest({
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { 
            first_name: 'Test', 
            last_name: 'User', 
            email: 'test@example.com', 
            password: 'password123',
            city: 'Toronto'
        });
        console.log('Registration response:', regRes.status);
        
        const loginRes2 = await makeRequest({
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { email: 'test@example.com', password: 'password123' });
        
        if (loginRes2.status !== 200) {
            console.error('Failed to login:', loginRes2.data);
            process.exit(1);
        }
        console.log('Logged in successfully!');
        const token = loginRes2.data.token;
        console.log('Token obtained.');
        
        // Step 2: Test sorting by first_name ascending
        console.log('\nStep 2: Testing sort by first_name (ASC)...');
        const sortRes = await makeRequest({
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/providers?sort=first_name&order=asc',
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (sortRes.status !== 200) {
            console.error('Sort request failed:', sortRes.data);
            process.exit(1);
        }
        
        const providers = sortRes.data.providers.slice(0, 10);
        console.log('\nFirst 10 providers sorted by first_name (ASC):');
        console.log('-'.repeat(50));
        
        let isSorted = true;
        for (let i = 0; i < providers.length; i++) {
            const p = providers[i];
            if (i > 0) {
                if (p.first_name.localeCompare(providers[i-1].first_name) < 0) {
                    isSorted = false;
                }
            }
            console.log(`${i+1}. ${p.first_name} ${p.last_name} - City: ${p.city}`);
        }
        
        console.log('-'.repeat(50));
        console.log(`\n✅ Sorting verification: ${isSorted ? 'PASSED' : 'FAILED'}`);
        console.log('Test completed successfully!');
    } else {
        console.log('Logged in successfully!');
        const token = loginRes.data.token;
        console.log('Token obtained.');
        
        // Step 2: Test sorting by first_name ascending
        console.log('\nStep 2: Testing sort by first_name (ASC)...');
        const sortRes = await makeRequest({
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/providers?sort=first_name&order=asc',
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (sortRes.status !== 200) {
            console.error('Sort request failed:', sortRes.data);
            process.exit(1);
        }
        
        const providers = sortRes.data.providers.slice(0, 10);
        console.log('\nFirst 10 providers sorted by first_name (ASC):');
        console.log('-'.repeat(50));
        
        let isSorted = true;
        for (let i = 0; i < providers.length; i++) {
            const p = providers[i];
            if (i > 0) {
                if (p.first_name.localeCompare(providers[i-1].first_name) < 0) {
                    isSorted = false;
                }
            }
            console.log(`${i+1}. ${p.first_name} ${p.last_name} - City: ${p.city}`);
        }
        
        console.log('-'.repeat(50));
        console.log(`\n✅ Sorting verification: ${isSorted ? 'PASSED' : 'FAILED'}`);
        console.log('Test completed successfully!');
    }
}

main().catch(console.error);