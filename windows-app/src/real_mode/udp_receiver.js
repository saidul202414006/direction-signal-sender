/**
 * udp_receiver.js - Real-time UDP CSI Receiver & Hardware Ingestion Engine
 * 
 * Binds to UDP port 5555 and listens for broadcast datagrams from the 4 RX nodes:
 * - RX_S3_A (ESP32-S3, Zone A)
 * - RX_S3_B (ESP32-S3, Zone B)
 * - RX_AM_A (AM-036, Zone C)
 * - RX_AM_B (AM-036, Zone D)
 * 
 * Works over local 2.4 GHz MMA mobile hotspot with zero configuration.
 */

const dgram = require('dgram');
const CsiDspPipeline = require('./csi_dsp');
const ZoneClassifier = require('./zone_classifier');

class UdpCsiReceiver {
  constructor(options = {}) {
    this.port = options.port || 5555;
    this.host = options.host || '0.0.0.0';
    this.socket = null;
    this.isRunning = false;

    this.dsp = new CsiDspPipeline({ windowSize: 10 });
    this.classifier = new ZoneClassifier();

    // Node state tracking
    this.nodes = {
      'RX_S3_A': this.createNodeState('RX_S3_A', 'A'),
      'RX_S3_B': this.createNodeState('RX_S3_B', 'B'),
      'RX_AM_A': this.createNodeState('RX_AM_A', 'C'),
      'RX_AM_B': this.createNodeState('RX_AM_B', 'D')
    };

    this.totalPackets = 0;
    this.onDetectionCallback = null;
    this.onTelemetryCallback = null;
    this.onNodePacketCallback = null;

    this.evalTimer = null;
    this.rateTimer = null;
  }

  createNodeState(nodeId, zoneKey) {
    return {
      nodeId,
      zoneKey,
      isAlive: false,
      lastSeen: 0,
      packetCount: 0,
      packetsThisSecond: 0,
      packetRateHz: 0,
      rssi: -50,
      noiseFloor: -95,
      subCount: 64,
      windowHistory: [], // Sliding window of Float32Array amplitudes
      baselineAmps: null,
      latestAmps: null,
      variance: 0.05,
      meanAmp: 18.5,
      snr: 14.2,
      wander: 0.0
    };
  }

  start(onDetection = null, onTelemetry = null) {
    if (this.isRunning) return Promise.resolve(this.getStatus());

    this.onDetectionCallback = onDetection;
    this.onTelemetryCallback = onTelemetry;

    return new Promise((resolve, reject) => {
      try {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('error', (err) => {
          console.error('[UDP Receiver] Socket error:', err);
          if (!this.isRunning) reject(err);
        });

        this.socket.on('message', (msg, rinfo) => {
          this.handlePacket(msg, rinfo);
        });

        this.socket.on('listening', () => {
          this.isRunning = true;
          try {
            this.socket.setBroadcast(true);
          } catch (e) {
            console.warn('[UDP Receiver] Broadcast flag warning:', e.message);
          }
          const addr = this.socket.address();
          console.log(`[UDP Receiver] CSI Ingestion Engine listening on ${addr.address}:${addr.port}`);

          // Periodic rate calculator (every 1000ms)
          this.rateTimer = setInterval(() => this.calculateRates(), 1000);

          // Periodic classification evaluator (every 50ms)
          this.evalTimer = setInterval(() => this.evaluateClassification(), 50);

          resolve(this.getStatus());
        });

        this.socket.bind(this.port, this.host);
      } catch (err) {
        reject(err);
      }
    });
  }

  handlePacket(msg, rinfo) {
    this.totalPackets++;
    const str = msg.toString('utf8').trim();

    // Support both CSV format and JSON format
    if (str.startsWith('{')) {
      this.parseJsonPacket(str, rinfo);
    } else {
      this.parseCsvPacket(str, rinfo);
    }
  }

  parseCsvPacket(csvLine, rinfo) {
    // Format: NODE_ID,timestamp_ms,rssi,noise_floor,subcarrier_count,imag0,real0,imag1,real1,...
    const parts = csvLine.split(',');
    if (parts.length < 5) return;

    const rawNodeId = parts[0].trim();
    const nodeId = this.normalizeNodeId(rawNodeId);
    const nodeState = this.nodes[nodeId];
    if (!nodeState) return;

    const ts = parseInt(parts[1], 10) || Date.now();
    const rssi = parseInt(parts[2], 10) || -50;
    const noiseFloor = parseInt(parts[3], 10) || -95;
    const subCount = parseInt(parts[4], 10) || 64;

    const iqData = [];
    for (let i = 5; i < parts.length; i++) {
      const v = parseInt(parts[i], 10);
      if (!isNaN(v)) iqData.push(v);
    }

    if (iqData.length < subCount * 2) return;

    const amps = this.dsp.calculateAmplitudes(iqData, subCount);
    this.updateNodeWithAmps(nodeState, amps, rssi, noiseFloor, ts, rinfo.address);
  }

  parseJsonPacket(jsonStr, rinfo) {
    try {
      const data = JSON.parse(jsonStr);
      const nodeId = this.normalizeNodeId(data.node || data.nodeId || data.id);
      const nodeState = this.nodes[nodeId];
      if (!nodeState) return;

      let amps = null;
      if (Array.isArray(data.amps)) {
        amps = new Float32Array(data.amps);
      } else if (Array.isArray(data.iq)) {
        const subCount = data.sub_count || data.iq.length / 2;
        amps = this.dsp.calculateAmplitudes(data.iq, subCount);
      }

      if (!amps) return;

      const rssi = data.rssi || -50;
      const noise = data.noise || -95;
      const ts = data.ts || Date.now();

      this.updateNodeWithAmps(nodeState, amps, rssi, noise, ts, rinfo.address);
    } catch (e) {
      // Ignore malformed packets
    }
  }

  normalizeNodeId(rawId) {
    if (!rawId) return '';
    const upper = String(rawId).toUpperCase();
    if (upper.includes('S3_A') || upper.includes('ZONE_A') || upper === 'RX_A') return 'RX_S3_A';
    if (upper.includes('S3_B') || upper.includes('ZONE_B') || upper === 'RX_B') return 'RX_S3_B';
    if (upper.includes('AM_A') || upper.includes('ZONE_C') || upper === 'RX_C') return 'RX_AM_A';
    if (upper.includes('AM_B') || upper.includes('ZONE_D') || upper === 'RX_D') return 'RX_AM_B';
    return upper;
  }

  updateNodeWithAmps(nodeState, amps, rssi, noiseFloor, ts, clientIp) {
    nodeState.isAlive = true;
    nodeState.lastSeen = Date.now();
    nodeState.clientIp = clientIp;
    nodeState.packetCount++;
    nodeState.packetsThisSecond++;
    nodeState.rssi = rssi;
    nodeState.noiseFloor = noiseFloor;
    nodeState.subCount = amps.length;
    nodeState.latestAmps = amps;

    // Baseline initialization
    if (!nodeState.baselineAmps) {
      nodeState.baselineAmps = new Float32Array(amps);
    } else {
      // Slow EMA update of baseline when undisturbed
      if (nodeState.variance < 0.25) {
        for (let i = 0; i < amps.length; i++) {
          nodeState.baselineAmps[i] += (amps[i] - nodeState.baselineAmps[i]) * 0.02;
        }
      }
    }

    // Sliding window for temporal variance
    nodeState.windowHistory.push(amps);
    if (nodeState.windowHistory.length > 10) {
      nodeState.windowHistory.shift();
    }

    // Compute DSP statistics
    const stats = this.dsp.computeWindowStatistics(nodeState.windowHistory);
    nodeState.meanAmp = stats.meanAmp;
    nodeState.variance = stats.temporalVariance;
    nodeState.snr = stats.snrEstimate;
    nodeState.wander = this.dsp.computeCosineWander(amps, nodeState.baselineAmps);

    if (this.onNodePacketCallback) {
      this.onNodePacketCallback({
        nodeId: nodeState.nodeId,
        zoneKey: nodeState.zoneKey,
        variance: nodeState.variance,
        meanAmp: nodeState.meanAmp,
        snr: nodeState.snr,
        rssi: nodeState.rssi,
        wander: nodeState.wander,
        amps: Array.from(amps.slice(0, 32)) // preview array
      });
    }
  }

  calculateRates() {
    const now = Date.now();
    for (const node of Object.values(this.nodes)) {
      node.packetRateHz = node.packetsThisSecond;
      node.packetsThisSecond = 0;
      // Mark node dead if no packets for > 2.5s
      if (now - node.lastSeen > 2500) {
        node.isAlive = false;
        node.packetRateHz = 0;
      }
    }

    if (this.onTelemetryCallback) {
      this.onTelemetryCallback(this.getStatus());
    }
  }

  evaluateClassification() {
    if (!this.isRunning) return;

    // Check if any node is alive
    const hasAliveNode = Object.values(this.nodes).some(n => n.isAlive);
    if (!hasAliveNode) return;

    const classification = this.classifier.classify(this.nodes);

    if (this.onDetectionCallback) {
      this.onDetectionCallback(classification);
    }
  }

  getStatus() {
    const activeNodes = [];
    const nodeStatus = {};

    for (const [id, node] of Object.entries(this.nodes)) {
      nodeStatus[id] = {
        zoneKey: node.zoneKey,
        isAlive: node.isAlive,
        packetRateHz: node.packetRateHz,
        totalPackets: node.packetCount,
        variance: Number(node.variance.toFixed(2)),
        meanAmp: Number(node.meanAmp.toFixed(1)),
        snr: Number(node.snr.toFixed(1)),
        clientIp: node.clientIp || null
      };
      if (node.isAlive) activeNodes.push(id);
    }

    return {
      isRunning: this.isRunning,
      port: this.port,
      activeNodesCount: activeNodes.length,
      activeNodes,
      totalPackets: this.totalPackets,
      nodes: nodeStatus
    };
  }

  stop() {
    if (!this.isRunning) return Promise.resolve();

    this.isRunning = false;
    if (this.evalTimer) { clearInterval(this.evalTimer); this.evalTimer = null; }
    if (this.rateTimer) { clearInterval(this.rateTimer); this.rateTimer = null; }

    this.classifier.reset();
    for (const node of Object.values(this.nodes)) {
      node.isAlive = false;
      node.packetRateHz = 0;
    }

    return new Promise((resolve) => {
      if (this.socket) {
        try {
          this.socket.close(() => {
            this.socket = null;
            console.log('[UDP Receiver] Stopped cleanly.');
            resolve();
          });
        } catch (e) {
          this.socket = null;
          resolve();
        }
      } else {
        resolve();
      }
    });
  }
}

module.exports = UdpCsiReceiver;
