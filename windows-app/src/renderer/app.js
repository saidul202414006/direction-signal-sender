// Zone Detection Application Renderer Logic (v1.4.1)

class WaveformChannel {
  constructor(canvasId, cardId, indicatorId, isInitiallyActive = false) {
    this.canvas = document.getElementById(canvasId);
    this.card = document.getElementById(cardId);
    this.indicator = document.getElementById(indicatorId);
    this.ctx = this.canvas.getContext('2d');
    this.isActive = isInitiallyActive;

    this.pointsCount = 140;
    // Inactive baseline is ~0.24 (strictly < 0.72 threshold)
    this.data = new Array(this.pointsCount).fill(0).map(() => 0.22 + (Math.random() - 0.5) * 0.08);

    // Multi-harmonic non-repeating noise seeds (irrational frequencies)
    this.t = Math.random() * 500;
    this.speed = 0.05;
    this.seed1 = 0.71828 + Math.random() * 0.4;
    this.seed2 = 1.41421 + Math.random() * 0.5;
    this.seed3 = 3.14159 + Math.random() * 0.8;
    this.seed4 = 5.67128 + Math.random() * 1.5;

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
    const wasActive = this.isActive;
    this.isActive = active;

    if (active) {
      this.card.classList.add('active');
      this.indicator.textContent = 'ABOVE THRESHOLD';

      // Instant excitation: Elevate existing buffer points immediately above threshold (0.72)
      // Eliminates the 2.3-second buffer crawl delay!
      if (!wasActive) {
        for (let i = 0; i < this.pointsCount; i++) {
          const jitter = (Math.random() - 0.5) * 0.12;
          const ripple = Math.sin(i * 0.28) * 0.05;
          let val = 0.81 + jitter + ripple;
          if (val < 0.74) val = 0.74 + Math.random() * 0.06;
          if (val > 0.96) val = 0.96;
          this.data[i] = val;
        }
      }
    } else {
      this.card.classList.remove('active');
      this.indicator.textContent = 'Below Threshold';

      // Instant relaxation: Drop existing buffer points immediately to baseline noise (< 0.72)
      if (wasActive) {
        for (let i = 0; i < this.pointsCount; i++) {
          const jitter = (Math.random() - 0.5) * 0.08;
          let val = 0.24 + jitter;
          if (val > 0.45) val = 0.42;
          this.data[i] = val;
        }
      }
    }
  }

  // Generates authentic, non-repeating RF / CSI subcarrier fluctuations
  nextSample() {
    this.t += this.speed;

    // Multi-frequency inharmonic synthesis prevents visible repetition
    const w1 = Math.sin(this.t * this.seed1 * 0.38);
    const w2 = Math.cos(this.t * this.seed2 * 0.89);
    const w3 = Math.sin(this.t * this.seed3 * 1.94);
    const w4 = Math.sin(this.t * this.seed4 * 4.12);

    // High-frequency Gaussian-distributed RF micro-jitter
    const rfJitter = ((Math.random() + Math.random() + Math.random()) - 1.5) * 0.045;

    // Occasional subcarrier multipath spike
    const multipathSpike = Math.random() > 0.94 ? (Math.random() - 0.5) * 0.07 : 0;

    if (this.isActive) {
      // ACTIVE ZONE: Fluctuates vigorously strictly ABOVE the 0.72 Threshold
      const baseLevel = 0.82;
      const variation = (w1 * 0.035 + w2 * 0.04 + w3 * 0.03 + w4 * 0.02 + rfJitter * 1.4 + multipathSpike);
      let val = baseLevel + variation;
      // Guarantee it stays strictly above the 0.72 threshold line
      return Math.min(0.97, Math.max(0.74, val));
    } else {
      // INACTIVE ZONE: Fluctuates with natural background noise strictly BELOW the 0.72 Threshold
      const baseLevel = 0.25;
      const variation = (w1 * 0.03 + w2 * 0.035 + w3 * 0.02 + rfJitter + multipathSpike * 0.4);
      let val = baseLevel + variation;
      // Guarantee it stays comfortably below the 0.72 threshold line
      return Math.min(0.48, Math.max(0.12, val));
    }
  }

  update() {
    const val = this.nextSample();
    this.data.shift();
    this.data.push(val);
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
        // Direct segment lines represent realistic digital signal oscilloscope traces
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
      1: new WaveformChannel('canvasA', 'cardSignalA', 'presenceA', false),
      2: new WaveformChannel('canvasB', 'cardSignalB', 'presenceB', false),
      3: new WaveformChannel('canvasC', 'cardSignalC', 'presenceC', false),
      4: new WaveformChannel('canvasD', 'cardSignalD', 'presenceD', false)
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

    // Subtle Diagnostics Link
    this.btnOpenConfigSubtle = document.getElementById('btnOpenConfigSubtle');

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
  }

  initEventListeners() {
    // Subtle Diagnostics trigger opens configuration modal
    if (this.btnOpenConfigSubtle) {
      this.btnOpenConfigSubtle.addEventListener('click', (e) => {
        e.preventDefault();
        this.openConfigModal();
      });
    }

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
      } else {
        if (this.radioRealMode) this.radioRealMode.checked = true;
        if (this.labelRealMode) this.labelRealMode.classList.add('active');
        if (this.labelAppMode) this.labelAppMode.classList.remove('active');
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

    // Update 4 Waveform Channels instantly
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
