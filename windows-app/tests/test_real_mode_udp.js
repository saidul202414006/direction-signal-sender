/**
 * test_real_mode_udp.js - Unit and Integration Tests for Real Mode UDP Subsystem
 */

const assert = require('assert');
const dgram = require('dgram');
const RealModeController = require('../src/real_mode/real_mode_controller');

function sendUdpMessage(client, message, port = 5555) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(message);
    client.send(buf, 0, buf.length, port, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function generateMockCsiCsv(nodeId, disturbanceLevel = 0.05) {
  // NODE_ID,timestamp_ms,rssi,noise_floor,subcarrier_count,imag0,real0...
  const ts = Date.now();
  const rssi = -42;
  const noise = -95;
  const subCount = 32;
  const iq = [];

  for (let k = 0; k < subCount; k++) {
    // Generate realistic I/Q values with jitter
    const baseAmp = 20.0 + Math.sin(k * 0.4) * 8.0;
    const pert = (Math.random() - 0.5) * disturbanceLevel * 25.0;
    const amp = Math.max(1, baseAmp + pert);
    const phase = k * 0.2 + (Math.random() - 0.5) * 0.3;
    const real = Math.round(amp * Math.cos(phase));
    const imag = Math.round(amp * Math.sin(phase));
    iq.push(imag, real);
  }

  return `${nodeId},${ts},${rssi},${noise},${subCount},${iq.join(',')}`;
}

async function runTests() {
  console.log('=== Running Real Mode UDP & DSP Integration Tests ===');

  const controller = new RealModeController();
  const receivedDetections = [];
  const receivedTelemetry = [];

  await controller.activate({
    onSignal: (detection) => {
      receivedDetections.push(detection);
    },
    onTelemetry: (telemetry) => {
      receivedTelemetry.push(telemetry);
    }
  });

  console.log('[PASS] RealModeController activated on UDP port 5555');

  const sender = dgram.createSocket('udp4');

  // Test 1: Send baseline packets for all 4 nodes (No Detection expected)
  console.log('[Test 1] Emitting baseline undisturbed packets across all 4 nodes...');
  for (let i = 0; i < 15; i++) {
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_A', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_B', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_A', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_B', 0.02));
    await new Promise(r => setTimeout(r, 10));
  }

  const status1 = controller.getStatus();
  assert.strictEqual(status1.isActive, true);
  assert.strictEqual(status1.udpStatus.activeNodesCount, 4);
  console.log('[PASS] All 4 hardware nodes successfully discovered and registered over UDP');

  // Test 2: Induce high disturbance on RX_S3_A (Zone A should trigger)
  console.log('[Test 2] Inducing physical disturbance on RX_S3_A (Zone A)...');
  for (let i = 0; i < 20; i++) {
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_A', 1.8)); // High disturbance
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_B', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_A', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_B', 0.02));
    await new Promise(r => setTimeout(r, 10));
  }

  // Trigger evaluation
  controller.receiver.evaluateClassification();

  assert.ok(receivedDetections.length > 0, 'Detections should be emitted');
  const lastDet = receivedDetections[receivedDetections.length - 1];
  console.log(`[PASS] Detection triggered: Signal ${lastDet.signal} (${lastDet.zone}) with confidence ${(lastDet.confidence * 100).toFixed(1)}%`);
  assert.strictEqual(lastDet.signal, 1, 'Zone A (Signal 1) should be detected');

  // Test 3: Induce disturbance on RX_AM_A (Zone C should trigger)
  console.log('[Test 3] Inducing physical disturbance on RX_AM_A (Zone C)...');
  for (let i = 0; i < 20; i++) {
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_A', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_S3_B', 0.02));
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_A', 2.0)); // High disturbance on Zone C
    await sendUdpMessage(sender, generateMockCsiCsv('RX_AM_B', 0.02));
    await new Promise(r => setTimeout(r, 10));
  }

  controller.receiver.evaluateClassification();
  const lastDetC = receivedDetections[receivedDetections.length - 1];
  console.log(`[PASS] Detection triggered: Signal ${lastDetC.signal} (${lastDetC.zone})`);
  assert.strictEqual(lastDetC.signal, 3, 'Zone C (Signal 3) should be detected');

  sender.close();
  await controller.deactivate();
  console.log('[PASS] RealModeController stopped cleanly');
  console.log('=== All Real Mode UDP & DSP Tests PASSED! ===');
}

runTests().catch(err => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
