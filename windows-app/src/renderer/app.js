// Zone Detection Application Renderer Logic (v1.4.2)

class WaveformChannel {
  constructor(canvasId, cardId, indicatorId, ampId, varId, snrId, isInitiallyActive = false) {
    this.canvas = document.getElementById(canvasId);
    this.card = document.getElementById(cardId);
    this.indicator = document.getElementById(indicatorId);
    this.ampEl = document.getElementById(ampId);
    this.varEl = document.getElementById(varId);
    this.snrEl = document.getElementById(snrId);
    this.ctx = this.canvas.getContext('2d');
    this.isActive = isInitiallyActive;

    this.pointsCount = 140;

    // Physical baseline tracking (Continuous Smooth Attack / Decay)
    // Threshold is 0.72. Inactive target: ~0.25, Active target: ~0.82
    this.targetBase = isInitiallyActive ? 0.82 : 0.25;
    this.currentBase = this.targetBase;

    // Buffer initialized with gentle random noise
    this.data = new Array(this.pointsCount).fill(0).map(() => 0.24 + (Math.random() - 0.5) * 0.08);

    // Multi-harmonic inharmonic frequency seeds (irrational numbers guarantee non-repeating pattern)
    this.t = Math.random() * 500;
    this.speed = 0.026; // Slower, more natural RF cadence
    this.macroPhase = Math.random() * 100;
    this.variancePhase = Math.random() * 100;

    this.seed1 = 0.71828 + Math.random() * 0.4;
    this.seed2 = 1.41421 + Math.random() * 0.5;
    this.seed3 = 3.14159 + Math.random() * 0.8;
    this.seed4 = 5.67128 + Math.random() * 1.5;

    // Dynamic CSI Telemetry state
    this.currentAmp = isInitiallyActive ? 41.2 : 18.4;
    this.currentVar = isInitiallyActive ? 1.05 : 0.05;
    this.currentSNR = isInitiallyActive ? 28.4 : 14.2;

    this.targetAmp = this.currentAmp;
    this.targetVar = this.currentVar;
    this.targetSNR = this.currentSNR;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  setActive(active) {
    this.isActive = active;
    this.targetBase = active ? 0.82 : 0.25;

    if (active) {
      this.card.classList.add('active');
      this.indicator.textContent = 'ABOVE THRESHOLD';
    } else {
      this.card.classList.remove('active');
      this.indicator.textContent = 'Below Threshold';
    }
  }

  // Generates authentic, non-repeating RF / CSI fluctuations with natural hill/mountain transitions
  nextSample() {
    this.t += this.speed;
    this.macroPhase += 0.005;
    this.variancePhase += 0.008;

    // Smooth continuous baseline transition (creates a natural hill/mountain slope on transitions)
    const rate = this.isActive ? 0.042 : 0.032;
    this.currentBase += (this.targetBase - this.currentBase) * rate;

    // Organic macro wandering (simulates gentle room multipath drift)
    const macroWander = (Math.sin(this.macroPhase * 0.73) * 0.032 + Math.cos(this.macroPhase * 1.31) * 0.024);

    // Multi-harmonic RF synthesis (smooth curves, no sharp flat edges)
    const w1 = Math.sin(this.t * this.seed1 * 0.42);
    const w2 = Math.cos(this.t * this.seed2 * 0.95);
    const w3 = Math.sin(this.t * this.seed3 * 1.83);
    const w4 = Math.sin(this.t * this.seed4 * 3.41);

    // Gentle Gaussian-like RF micro-variation
    const rfJitter = ((Math.random() + Math.random()) - 1.0) * 0.022;

    if (this.isActive) {
      // ACTIVE ZONE: Natural hill cresting above 0.72 threshold with curved peaks & valleys
      const variation = (w1 * 0.034 + w2 * 0.028 + w3 * 0.020 + w4 * 0.012 + rfJitter);
      let val = this.currentBase + macroWander + variation;
      // Soft-knee bottom protection if fully active so it never looks flat-clipped
      if (this.currentBase > 0.75 && val < 0.732) {
        val = 0.732 + (val - 0.732) * 0.2;
      }
      return Math.min(0.96, Math.max(0.15, val));
    } else {
      // INACTIVE ZONE: Natural ambient baseline noise comfortably below 0.72 threshold
      const variation = (w1 * 0.022 + w2 * 0.018 + w3 * 0.012 + rfJitter * 0.8);
      let val = this.currentBase + macroWander * 0.25 + variation;
      return Math.min(0.48, Math.max(0.12, val));
    }
  }

  // Update dynamic CSI Telemetry metrics gradually (EMA low-pass filter)
  updateMetrics() {
    if (this.isActive) {
      // Elevated multipath amplitude, high variance, enhanced SNR with organic drift
      const wander = Math.sin(this.macroPhase * 1.2) * 2.5;
      this.targetAmp = 40.5 + wander + (Math.random() - 0.5) * 1.2;
      this.targetVar = 1.08 + Math.sin(this.variancePhase) * 0.25 + (Math.random() - 0.5) * 0.08;
      this.targetSNR = 28.5 + wander * 0.4 + (Math.random() - 0.5) * 0.6;
    } else {
      // Low ambient noise, minimal variance
      this.targetAmp = 18.4 + (Math.random() - 0.5) * 0.4;
      this.targetVar = 0.05 + (Math.random() - 0.5) * 0.015;
      this.targetSNR = 14.1 + (Math.random() - 0.5) * 0.3;
    }

    // Continuous smooth relaxation (alpha = 0.04)
    this.currentAmp += (this.targetAmp - this.currentAmp) * 0.04;
    this.currentVar += (this.targetVar - this.currentVar) * 0.04;
    this.currentSNR += (this.targetSNR - this.currentSNR) * 0.04;

    if (this.currentVar < 0.02) this.currentVar = 0.02;

    if (this.ampEl) this.ampEl.textContent = this.currentAmp.toFixed(1) + ' dB';
    if (this.varEl) this.varEl.textContent = this.currentVar.toFixed(2);
    if (this.snrEl) this.snrEl.textContent = this.currentSNR.toFixed(1) + ' dB';
  }

  setRealHardwareMetrics(meanAmp, variance, snr) {
    this.targetAmp = meanAmp;
    this.targetVar = variance;
    this.targetSNR = snr;
    this.currentAmp += (meanAmp - this.currentAmp) * 0.2;
    this.currentVar += (variance - this.currentVar) * 0.2;
    this.currentSNR += (snr - this.currentSNR) * 0.2;
    if (this.ampEl) this.ampEl.textContent = this.currentAmp.toFixed(1) + ' dB';
    if (this.varEl) this.varEl.textContent = this.currentVar.toFixed(2);
    if (this.snrEl) this.snrEl.textContent = this.currentSNR.toFixed(1) + ' dB';
  }

  update() {
    const val = this.nextSample();
    this.data.shift();
    this.data.push(val);
    this.updateMetrics();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);
    if (w <= 0 || h <= 0) return;

    // Draw subtle oscilloscope-style background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.33); ctx.lineTo(w, h * 0.33);
    ctx.moveTo(0, h * 0.66); ctx.lineTo(w, h * 0.66);
    ctx.stroke();

    // Waveform line path
    ctx.beginPath();
    const step = w / (this.pointsCount - 1);

    for (let i = 0; i < this.pointsCount; i++) {
      const x = i * step;
      // 0.0 at bottom, 1.0 at top
      const y = h - this.data[i] * h;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (this.isActive) {
      // Active Waveform Trace: Emerald Glow
      ctx.strokeStyle = '#00e5a3';
      ctx.lineWidth = 2.0;
      ctx.shadowColor = 'rgba(0, 229, 163, 0.55)';
      ctx.shadowBlur = 7;
      ctx.stroke();

      // Translucent energy fill under active curve
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, h * 0.2, 0, h);
      grad.addColorStop(0, 'rgba(0, 229, 163, 0.16)');
      grad.addColorStop(1, 'rgba(0, 229, 163, 0.00)');
      ctx.fillStyle = grad;
      ctx.shadowBlur = 0;
      ctx.fill();
    } else {
      // Inactive Waveform Trace: Muted RF Baseline
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
  }
}

// Main Application Controller
class ZoneDetectionApp {
  constructor() {
    this.currentSignal = 0;
    this.activeMode = 'Application Mode';
    this.channels = {};
    this.networkInfo = null;

    this.initWaveforms();
    this.initElements();
    this.initEventListeners();
    this.startAnimationLoop();
    this.fetchInitialStatus();
  }

  initWaveforms() {
    this.channels = {
      1: new WaveformChannel('canvasA', 'cardSignalA', 'presenceA', 'ampA', 'varA', 'snrA', false),
      2: new WaveformChannel('canvasB', 'cardSignalB', 'presenceB', 'ampB', 'varB', 'snrB', false),
      3: new WaveformChannel('canvasC', 'cardSignalC', 'presenceC', 'ampC', 'varC', 'snrC', false),
      4: new WaveformChannel('canvasD', 'cardSignalD', 'presenceD', 'ampD', 'varD', 'snrD', false)
    };
  }

  initElements() {
    this.headerSystemStatus = document.getElementById('headerSystemStatus');

    this.quadrants = {
      1: { el: document.getElementById('quadrantA'), tag: document.getElementById('tagA'), ray: document.getElementById('rayA'), name: 'Zone A' },
      2: { el: document.getElementById('quadrantB'), tag: document.getElementById('tagB'), ray: document.getElementById('rayB'), name: 'Zone B' },
      3: { el: document.getElementById('quadrantC'), tag: document.getElementById('tagC'), ray: document.getElementById('rayC'), name: 'Zone C' },
      4: { el: document.getElementById('quadrantD'), tag: document.getElementById('tagD'), ray: document.getElementById('rayD'), name: 'Zone D' }
    };

    // Help Button & Popover
    this.btnHelp = document.getElementById('btnHelp');
    this.helpPopover = document.getElementById('helpPopover');
    this.btnClosePopover = document.getElementById('btnClosePopover');
    this.linkOpenConfig = document.getElementById('linkOpenConfig');

    // Configuration Modal Elements
    this.configModal = document.getElementById('configModal');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.btnSaveCloseModal = document.getElementById('btnSaveCloseModal');
    this.inputEndpointUrl = document.getElementById('inputEndpointUrl');
    this.btnCopyEndpoint = document.getElementById('btnCopyEndpoint');
    this.networkList = document.getElementById('networkList');

    // Live Telemetry fields in Modal
    this.diagSignalCode = document.getElementById('diagSignalCode');
    this.diagZoneName = document.getElementById('diagZoneName');
    this.diagTimestamp = document.getElementById('diagTimestamp');
    this.diagClientIp = document.getElementById('diagClientIp');

    // Modes
    this.radioAppMode = document.getElementById('radioAppMode');
    this.radioRealMode = document.getElementById('radioRealMode');
    this.labelAppMode = document.getElementById('labelAppMode');
    this.labelRealMode = document.getElementById('labelRealMode');

    // Real Mode Hardware Telemetry
    this.realUdpStatusBadge = document.getElementById('realUdpStatusBadge');
    this.realNodes = {
      'RX_S3_A': {
        card: document.getElementById('cardNodeS3A'),
        dot: document.getElementById('dotS3A'),
        hz: document.getElementById('hzS3A'),
        v: document.getElementById('varNodeS3A'),
        a: document.getElementById('ampNodeS3A')
      },
      'RX_S3_B': {
        card: document.getElementById('cardNodeS3B'),
        dot: document.getElementById('dotS3B'),
        hz: document.getElementById('hzS3B'),
        v: document.getElementById('varNodeS3B'),
        a: document.getElementById('ampNodeS3B')
      },
      'RX_AM_A': {
        card: document.getElementById('cardNodeAMA'),
        dot: document.getElementById('dotAMA'),
        hz: document.getElementById('hzAMA'),
        v: document.getElementById('varNodeAMA'),
        a: document.getElementById('ampNodeAMA')
      },
      'RX_AM_B': {
        card: document.getElementById('cardNodeAMB'),
        dot: document.getElementById('dotAMB'),
        hz: document.getElementById('hzAMB'),
        v: document.getElementById('varNodeAMB'),
        a: document.getElementById('ampNodeAMB')
      }
    };
  }

  initEventListeners() {
    // Subtle Help Popover toggle
    if (this.btnHelp) {
      this.btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.helpPopover) {
          this.helpPopover.classList.toggle('hidden');
        }
      });
    }

    if (this.btnClosePopover) {
      this.btnClosePopover.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.helpPopover) this.helpPopover.classList.add('hidden');
      });
    }

    // Embedded hyperlink inside description text opens configuration page
    if (this.linkOpenConfig) {
      this.linkOpenConfig.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.helpPopover) this.helpPopover.classList.add('hidden');
        this.openConfigModal();
      });
    }

    // Clicking anywhere outside popover closes it
    document.addEventListener('click', (e) => {
      if (this.helpPopover && !this.helpPopover.contains(e.target) && e.target !== this.btnHelp) {
        this.helpPopover.classList.add('hidden');
      }
    });

    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener('click', () => this.closeConfigModal());
    }

    if (this.btnSaveCloseModal) {
      this.btnSaveCloseModal.addEventListener('click', () => this.closeConfigModal());
    }

    // Close modal on clicking backdrop
    if (this.configModal) {
      this.configModal.addEventListener('click', (e) => {
        if (e.target === this.configModal) {
          this.closeConfigModal();
        }
      });
    }

    // Copy endpoint button
    if (this.btnCopyEndpoint) {
      this.btnCopyEndpoint.addEventListener('click', () => {
        const url = this.inputEndpointUrl.value;
        if (url && url !== 'Detecting...') {
          navigator.clipboard.writeText(url).then(() => {
            const original = this.btnCopyEndpoint.textContent;
            this.btnCopyEndpoint.textContent = 'Copied!';
            this.btnCopyEndpoint.style.background = '#00e5a3';
            this.btnCopyEndpoint.style.color = '#000';
            setTimeout(() => {
              this.btnCopyEndpoint.textContent = original;
              this.btnCopyEndpoint.style.background = '';
              this.btnCopyEndpoint.style.color = '';
            }, 1500);
          });
        }
      });
    }

    // Mode Selector
    const onModeChange = (mode) => {
      this.activeMode = mode;
      if (mode === 'Application Mode') {
        if (this.radioAppMode) this.radioAppMode.checked = true;
        if (this.labelAppMode) this.labelAppMode.classList.add('active');
        if (this.labelRealMode) this.labelRealMode.classList.remove('active');
        if (this.headerSystemStatus) this.headerSystemStatus.textContent = 'SYSTEM NORMAL';
        if (this.realUdpStatusBadge) {
          this.realUdpStatusBadge.textContent = 'STOPPED';
          this.realUdpStatusBadge.className = 'badge-status badge-offline';
        }
      } else {
        if (this.radioRealMode) this.radioRealMode.checked = true;
        if (this.labelRealMode) this.labelRealMode.classList.add('active');
        if (this.labelAppMode) this.labelAppMode.classList.remove('active');
        if (this.headerSystemStatus) this.headerSystemStatus.textContent = 'REAL MODE: UDP :5555 ACTIVE';
        if (this.realUdpStatusBadge) {
          this.realUdpStatusBadge.textContent = 'LISTENING (:5555)';
          this.realUdpStatusBadge.className = 'badge-status badge-online';
        }
      }
      if (window.electronAPI && window.electronAPI.setMode) {
        window.electronAPI.setMode(mode);
      }
    };

    if (this.radioAppMode) {
      this.radioAppMode.addEventListener('change', () => onModeChange('Application Mode'));
    }
    if (this.radioRealMode) {
      this.radioRealMode.addEventListener('change', () => onModeChange('Real Mode'));
    }

    // Manual Simulation buttons
    document.querySelectorAll('.btn-sim').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sig = Number(btn.getAttribute('data-signal'));
        if (window.electronAPI && window.electronAPI.simulateSignal) {
          window.electronAPI.simulateSignal(sig);
        } else {
          this.handleSignal({
            signal: sig,
            zone: this.getZoneName(sig),
            clientIp: '127.0.0.1 (Manual Test)',
            formattedTime: new Date().toLocaleTimeString()
          });
        }
      });
    });

    // Subscribe to IPC signals from Main process
    if (window.electronAPI && window.electronAPI.onSignalReceived) {
      window.electronAPI.onSignalReceived((signalData) => {
        this.handleSignal(signalData);
      });
    }

    // Subscribe to Real Mode Telemetry & Node Data
    if (window.electronAPI && window.electronAPI.onRealModeTelemetry) {
      window.electronAPI.onRealModeTelemetry((telemetry) => {
        this.handleRealModeTelemetry(telemetry);
      });
    }

    if (window.electronAPI && window.electronAPI.onRealModeNodeData) {
      window.electronAPI.onRealModeNodeData((nodeData) => {
        this.handleRealModeNodeData(nodeData);
      });
    }
  }

  handleRealModeNodeData(nodeData) {
    if (!nodeData || this.activeMode !== 'Real Mode') return;

    let channelKey = null;
    if (nodeData.zoneKey === 'A') channelKey = 1;
    else if (nodeData.zoneKey === 'B') channelKey = 2;
    else if (nodeData.zoneKey === 'C') channelKey = 3;
    else if (nodeData.zoneKey === 'D') channelKey = 4;

    if (channelKey && this.channels[channelKey]) {
      this.channels[channelKey].setRealHardwareMetrics(
        nodeData.meanAmp || 18.5,
        nodeData.variance || 0.05,
        nodeData.snr || 14.2
      );
    }
  }

  handleRealModeTelemetry(telemetry) {
    if (!telemetry) return;

    if (this.realUdpStatusBadge) {
      if (telemetry.isRunning) {
        this.realUdpStatusBadge.textContent = 'LISTENING (:5555)';
        this.realUdpStatusBadge.className = 'badge-status badge-online';
      } else {
        this.realUdpStatusBadge.textContent = 'STOPPED';
        this.realUdpStatusBadge.className = 'badge-status badge-offline';
      }
    }

    if (telemetry.nodes && this.realNodes) {
      let aliveCount = 0;
      for (const [nodeId, meta] of Object.entries(this.realNodes)) {
        const node = telemetry.nodes[nodeId];
        if (!node) continue;

        if (node.isAlive) aliveCount++;

        if (meta.card) {
          if (node.isAlive) meta.card.classList.add('online');
          else meta.card.classList.remove('online');
        }
        if (meta.dot) {
          meta.dot.className = 'node-status-dot ' + (node.isAlive ? 'dot-online' : 'dot-offline');
        }
        if (meta.hz) meta.hz.textContent = (node.packetRateHz || 0) + ' Hz';
        if (meta.v) meta.v.textContent = (node.variance || 0).toFixed(2);
        if (meta.a) meta.a.textContent = (node.meanAmp || 0).toFixed(1) + ' dB';
      }

      if (this.activeMode === 'Real Mode' && this.headerSystemStatus) {
        if (aliveCount > 0) {
          this.headerSystemStatus.textContent = `REAL MODE: ${aliveCount}/4 NODES ONLINE`;
        } else {
          this.headerSystemStatus.textContent = 'REAL MODE: UDP :5555 ACTIVE';
        }
      }
    }
  }

  getZoneName(signal) {
    switch (Number(signal)) {
      case 0: return 'No Detection';
      case 1: return 'Zone A';
      case 2: return 'Zone B';
      case 3: return 'Zone C';
      case 4: return 'Zone D';
      default: return `Signal ${signal}`;
    }
  }

  handleSignal(signalData) {
    const sig = Number(signalData.signal);
    this.currentSignal = sig;

    const zoneName = signalData.zone || this.getZoneName(sig);
    const timeStr = signalData.formattedTime || new Date().toLocaleTimeString();
    const clientStr = signalData.clientIp || 'Network Receiver';

    // Update Diagnostics telemetry in Modal
    if (this.diagSignalCode) this.diagSignalCode.textContent = sig;
    if (this.diagZoneName) this.diagZoneName.textContent = zoneName;
    if (this.diagTimestamp) this.diagTimestamp.textContent = timeStr;
    if (this.diagClientIp) this.diagClientIp.textContent = clientStr;

    // Update 4 Quadrants & CSI Rays instantly
    for (const [zoneId, quad] of Object.entries(this.quadrants)) {
      const isThisZoneActive = Number(zoneId) === sig;
      if (isThisZoneActive) {
        quad.el.classList.add('active');
        quad.tag.textContent = 'PRESENCE DETECTED';
        quad.ray.classList.add('active');
      } else {
        quad.el.classList.remove('active');
        quad.tag.textContent = 'INACTIVE';
        quad.ray.classList.remove('active');
      }
    }

    // Update 4 Waveform Channels smoothly
    for (const [zoneId, channel] of Object.entries(this.channels)) {
      const isThisZoneActive = Number(zoneId) === sig;
      channel.setActive(isThisZoneActive);
    }
  }

  async fetchInitialStatus() {
    if (window.electronAPI && window.electronAPI.getServerStatus) {
      try {
        const status = await window.electronAPI.getServerStatus();
        this.networkInfo = status.networkInfo;
        this.updateNetworkUI(status.networkInfo, status.port);
        if (status.lastSignal) {
          this.handleSignal(status.lastSignal);
        }
        if (status.mode) {
          this.activeMode = status.mode;
          if (this.activeMode === 'Real Mode') {
            if (this.radioRealMode) this.radioRealMode.checked = true;
            if (this.labelRealMode) this.labelRealMode.classList.add('active');
            if (this.labelAppMode) this.labelAppMode.classList.remove('active');
            if (this.headerSystemStatus) this.headerSystemStatus.textContent = 'REAL MODE: UDP :5555 ACTIVE';
            if (this.realUdpStatusBadge) {
              this.realUdpStatusBadge.textContent = 'LISTENING (:5555)';
              this.realUdpStatusBadge.className = 'badge-status badge-online';
            }
          }
        }
        if (status.realMode && status.realMode.udpStatus) {
          this.handleRealModeTelemetry(status.realMode.udpStatus);
        }
      } catch (e) {
        console.error('Failed to fetch server status:', e);
      }
    }
  }

  updateNetworkUI(networkInfo, port = 5000) {
    if (!networkInfo) return;
    const endpoint = networkInfo.endpointUrl || `http://${networkInfo.primaryIp}:${port}/api/signal`;

    if (this.inputEndpointUrl) {
      this.inputEndpointUrl.value = endpoint;
    }

    // Populate network adapters in modal
    if (this.networkList) {
      this.networkList.innerHTML = '';
      if (networkInfo.allInterfaces && networkInfo.allInterfaces.length > 0) {
        networkInfo.allInterfaces.forEach((iface, idx) => {
          const item = document.createElement('div');
          item.className = 'network-item' + (idx === 0 ? ' primary' : '');
          item.innerHTML = `
            <span class="network-name">${iface.name} ${iface.isWifi ? '(Wi-Fi)' : iface.isEthernet ? '(Ethernet)' : ''}</span>
            <span class="network-ip">${iface.address}:${port}</span>
          `;
          this.networkList.appendChild(item);
        });
      } else {
        this.networkList.innerHTML = `<div class="network-item"><span class="network-ip">${networkInfo.primaryIp}:${port}</span></div>`;
      }
    }
  }

  async openConfigModal() {
    if (this.configModal) {
      this.configModal.classList.remove('hidden');
    }
    if (window.electronAPI && window.electronAPI.getNetworkInfo) {
      const info = await window.electronAPI.getNetworkInfo();
      this.updateNetworkUI(info);
    }
  }

  closeConfigModal() {
    if (this.configModal) {
      this.configModal.classList.add('hidden');
    }
  }

  startAnimationLoop() {
    const loop = () => {
      for (const channel of Object.values(this.channels)) {
        channel.update();
        channel.draw();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// Start app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new ZoneDetectionApp();
});
