const assert = require('assert');
const http = require('http');
const SignalServer = require('../src/server');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Running SignalServer Unit Tests ===');
  const server = new SignalServer();
  const receivedSignals = [];

  const startRes = await server.start(5999, (sig) => {
    receivedSignals.push(sig);
  });

  const port = startRes.port;
  console.log(`[PASS] Server started on port ${port}`);

  // Test 1: GET /api/status
  const statusRes = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/status',
    method: 'GET'
  });
  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.data.status, 'online');
  console.log('[PASS] GET /api/status returned online status');

  // Test 2: POST /api/signal with Signal 1 (Zone A)
  const post1 = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/signal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { signal: 1 });
  assert.strictEqual(post1.status, 200);
  assert.strictEqual(post1.data.received, 1);
  assert.strictEqual(post1.data.zone, 'Zone A');
  console.log('[PASS] POST Signal 1 verified: Zone A');

  // Test 3: POST /api/signal with Signal 0 (No Detection)
  const post0 = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/signal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { signal: 0 });
  assert.strictEqual(post0.status, 200);
  assert.strictEqual(post0.data.received, 0);
  assert.ok(post0.data.zone.includes('No Detection'));
  console.log('[PASS] POST Signal 0 verified: No Detection');

  // Test 4: Signals 2, 3, 4
  const post2 = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/signal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { signal: 2 });
  assert.strictEqual(post2.data.zone, 'Zone B');

  const post3 = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/signal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { signal: 3 });
  assert.strictEqual(post3.data.zone, 'Zone C');

  const post4 = await makeRequest({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/signal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { signal: 4 });
  assert.strictEqual(post4.data.zone, 'Zone D');
  console.log('[PASS] POST Signals 2, 3, 4 verified: Zone B, Zone C, Zone D');

  // Verify received signals callback
  assert.strictEqual(receivedSignals.length, 5);
  console.log('[PASS] All 5 signals intercepted by callback in real time');

  // Stop server
  await server.stop();
  console.log('[PASS] Server stopped cleanly');
  console.log('=== All Server Unit Tests PASSED! ===');
}

runTests().catch(err => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
