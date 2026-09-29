#!/usr/bin/env node
const http = require('http');

async function loginAsAdmin() {
  return new Promise((resolve, reject) => {
    const postData = 'username=admin&password=' + (process.env.ADMIN_PASSWORD || 'admin123');
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let cookies = res.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        const sessionCookie = cookies.find(c => c.startsWith('connect.sid='));
        if (sessionCookie) {
          const cookieValue = sessionCookie.split(';')[0];
          resolve(cookieValue);
          return;
        }
      }
      reject(new Error('Login failed - no session cookie'));
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function analyzeAllSongs(sessionCookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/admin/songs/analyze-all',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      timeout: 600000
    };
    
    console.log('Sending analysis request to server...');
    console.log('This may take several minutes. Please wait...\n');
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error('Invalid response: ' + data.substring(0, 200)));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timed out')));
    req.end();
  });
}

async function main() {
  console.log('===========================================');
  console.log('  Audio Analysis Script');
  console.log('===========================================\n');
  
  try {
    console.log('Step 1: Logging in as admin...');
    const sessionCookie = await loginAsAdmin();
    console.log('Logged in successfully!\n');
    
    console.log('Step 2: Running audio analysis on all songs...');
    const result = await analyzeAllSongs(sessionCookie);
    
    console.log('\n===========================================');
    console.log('  Analysis Complete!');
    console.log('===========================================');
    console.log(`  Analyzed: ${result.analyzed || 0} songs`);
    console.log(`  Failed: ${result.failed || 0} songs`);
    console.log('===========================================\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
