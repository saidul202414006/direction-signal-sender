/**
 * real_mode_controller.js - Real Mode Subsystem Orchestrator
 * 
 * Manages the lifecycle of Real Mode (UDP Receiver + DSP + Zone Classification)
 * with strict isolation from Application Mode.
 */

const UdpCsiReceiver = require('./udp_receiver');

class RealModeController {
  constructor() {
    this.receiver = new UdpCsiReceiver({ port: 5555 });
    this.isActive = false;
    this.onSignalCallback = null;
    this.onTelemetryCallback = null;
    this.onNodeDataCallback = null;
  }

  async activate(callbacks = {}) {
    if (this.isActive) return this.getStatus();

    this.onSignalCallback = callbacks.onSignal || null;
    this.onTelemetryCallback = callbacks.onTelemetry || null;
    this.onNodeDataCallback = callbacks.onNodeData || null;

    this.receiver.onNodePacketCallback = (nodeData) => {
      if (this.isActive && this.onNodeDataCallback) {
        this.onNodeDataCallback(nodeData);
      }
    };

    const status = await this.receiver.start(
      (detection) => {
        if (this.isActive && this.onSignalCallback) {
          this.onSignalCallback({
            signal: detection.signal,
            zone: detection.zone,
            confidence: detection.confidence,
            nodeScores: detection.nodeScores,
            mode: 'Real Mode',
            timestamp: detection.timestamp,
            clientIp: 'CSI UDP Broadcast (:5555)'
          });
        }
      },
      (telemetry) => {
        if (this.isActive && this.onTelemetryCallback) {
          this.onTelemetryCallback(telemetry);
        }
      }
    );

    this.isActive = true;
    console.log('[RealModeController] Real Mode ACTIVE.');
    return status;
  }

  async deactivate() {
    if (!this.isActive) return;

    this.isActive = false;
    await this.receiver.stop();
    console.log('[RealModeController] Real Mode DEACTIVATED.');
  }

  getStatus() {
    return {
      isActive: this.isActive,
      udpStatus: this.receiver.getStatus()
    };
  }
}

module.exports = RealModeController;
