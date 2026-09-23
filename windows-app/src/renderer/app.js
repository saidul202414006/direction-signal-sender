// Zone Detection Application Renderer Logic

class WaveformChannel {
  constructor(canvasId, cardId, indicatorId, isInitiallyActive = false) {
    this.canvas = document.getElementById(canvasId);
    this.card = document.getElementById(cardId);
    this.indicator = document.getElementById(indicatorId);
    this.ctx = this.canvas.getContext('2d');
    this.isActive = isInitiallyActive;

    this.pointsCount = 140;
    this.data = new Array(this.pointsCount).fill(0.2);

    // Natural multi-octave noise state variables
    this.time = Math.random() * 1000;
    this.speed = 0.045;
    this.quietPhase = Math.random() * 10;
    this.burstPhase = Math.random() * 10;
    this.drift = 0.2;

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
    if (active) {
      this.card.classList.add('active');
      this.indicator.textContent = 'ABOVE THRESHOLD';
    } else {
      this.card.classList.remove('active');
      this.indicator.textContent = 'Below Threshold';
    }
  }

  // Generates natural non-repeating procedural fluctuations
  nextSample() {
    this.time += this.speed;
    this.quietPhase += 0.008;
    this.burstPhase += 0.015;

    // Layer 1: Slow organic baseline wandering
    const slowWander = Math.sin(this.time * 0.35) * 0.06 + Math.cos(this.time * 0.17) * 0.05;

    // Layer 2: Medium frequency ripples
    const midRipple = Math.sin(this.time * 1.8) * 0.04 + Math.sin(this.time * 3.7) * 0.025;

    // Layer 3: Organic high frequency jitter
    const jitter = (Math.random() - 0.5) * 0.045;

    // Layer 4: Occasional natural spikes / burst periods
    const burstEnvelope = Math.max(0, Math.sin(this.burstPhase) * 1.5 - 0.5);
    const spike = (Math.random() > 0.88 ? Math.random() * 0.12 : 0) * burstEnvelope;

    // Layer 5: Quiet periods modulation (sometimes calm, sometimes restless)
    const quietMod = 0.55 + 0.45 * Math.sin(this.quietPhase);

    if (this.isActive) {
      // ACTIVE ZONE: Fluctuate around and ABOVE the Presence Level (~0.64)
      const baseActiveLevel = 0.62;
      const activeFluctuation = (slowWander * 1.8 + midRipple * 2.2 + jitter * 2.0 + spike * 1.6) * quietMod;
      const rawVal = baseActiveLevel + activeFluctuation;
      return Math.min(0.96, Math.max(0.42, rawVal));
    } else {
      // INACTIVE ZONE: Stay strictly BELOW the Presence Level (< 0.55)
      const baseInactiveLevel = 0.22;
      const inactiveFluctuation = (slowWander * 0.8 + midRipple * 0.9 + jitter + spike * 0.5) * quietMod;
      const rawVal = baseInactiveLevel + inactiveFluctuation;
      return Math.min(0.50, Math.max(0.08, rawVal));
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

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.33); ctx.lineTo(w, h * 0.33);
    ctx.moveTo(0, h * 0.66); ctx.lineTo(w, h * 0.66);
    ctx.stroke();

    // Waveform path
    ctx.beginPath();
    const step = w / (this.pointsCount - 1);

    for (let i = 0; i < this.pointsCount; i++) {
      const x = i * step;
      // Invert Y coordinate so 0 = bottom, 1 = top
      const y = h - this.data[i] * h;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Smooth bezier curve between points
        const prevX = (i - 1) * step;
        const prevY = h - this.data[i - 1] * h;
        const midX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
      }
    }

    if (this.isActive) {
      // Active Waveform Glow
      ctx.strokeStyle = '#00e5a3';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(0, 229, 163, 0.6)';
      ctx.shadowBlur = 8;
      ctx.stroke();

      // Subtle filled area under active curve
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0, 229, 163, 0.18)');
      grad.addColorStop(1, 'rgba(0, 229, 163, 0.00)');
      ctx.fillStyle = grad;
      ctx.shadowBlur = 0;
      ctx.fill();
    } else {
      // Inactive Waveform
      ctx.strokeStyle = '#5a6982';
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
    this.headerModeBadge = document.getElementById('headerModeBadge');
    this.headerSignalBadge = document.getElementById('headerSignalBadge');
    this.headerEndpointStatus = document.getElementById('headerEndpointStatus');
    this.quickEndpointText = document.getElementById('quickEndpointText');
    this.lastPingText = document.getElementById('lastPingText');

    this.quadrants = {
      1: { el: document.getElementById('quadrantA'), tag: document.getElementById('tagA'), ray: document.getElementById('rayA'), name: 'Zone A' },
      2: { el: document.getElementById('quadrantB'), tag: document.getElementById('tagB'), ray: document.getElementById('rayB'), name: 'Zone B' },
      3: { el: document.getElementById('quadrantC'), tag: document.getElementById('tagC'), ray: document.getElementById('rayC'), name: 'Zone C' },
      4: { el: document.getElementById('quadrantD'), tag: document.getElementById('tagD'), ray: document.getElementById('rayD'), name: 'Zone D' }
    };

    this.btnHelp = document.getElementById('btnHelp');
    this.helpPopover = document.getElementById('helpPopover');
    this.btnClosePopover = document.getElementById('btnClosePopover');
    this.linkOpenConfig = document.getElementById('linkOpenConfig');

    this.configModal = document.getElementById('configModal');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.btnSaveCloseModal = document.getElementById('btnSaveCloseModal');
    this.inputEndpointUrl = document.getElementById('inputEndpointUrl');
    this.btnCopyEndpoint = document.getElementById('btnCopyEndpoint');
    this.networkList = document.getElementById('networkList');

    this.radioAppMode = document.getElementById('radioAppMode');
    this.radioRealMode = document.getElementById('radioRealMode');
    this.labelAppMode = document.getElementById('labelAppMode');
    this.labelRealMode = document.getElementById('labelRealMode');
  }

  initEventListeners() {
    // Help Popover
    this.btnHelp.addEventListener('click', (e) => {
      e.stopPropagation();
      this.helpPopover.classList.toggle('hidden');
    });

    this.btnClosePopover.addEventListener('click', () => {
      this.helpPopover.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!this.helpPopover.contains(e.target) && e.target !== this.btnHelp) {
        this.helpPopover.classList.add('hidden');
      }
    });

    // Configuration Modal
    this.linkOpenConfig.addEventListener('click', (e) => {
      e.preventDefault();
      this.helpPopover.classList.add('hidden');
      this.openConfigModal();
    });

    this.btnCloseModal.addEventListener('click', () => this.closeConfigModal());
    this.btnSaveCloseModal.addEventListener('click', () => this.closeConfigModal());

    // Copy endpoint button
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

    // Mode Selector
    const onModeChange = (mode) => {
      this.activeMode = mode;
      if (mode === 'Application Mode') {
        this.radioAppMode.checked = true;
        this.labelAppMode.classList.add('active');
        this.labelRealMode.classList.remove('active');
      } else {
        this.radioRealMode.checked = true;
        this.labelRealMode.classList.add('active');
        this.labelAppMode.classList.remove('active');
      }
      this.headerModeBadge.textContent = mode.toUpperCase();
      if (window.electronAPI && window.electronAPI.setMode) {
        window.electronAPI.setMode(mode);
      }
    };

    this.radioAppMode.addEventListener('change', () => onModeChange('Application Mode'));
    this.radioRealMode.addEventListener('change', () => onModeChange('Real Mode'));

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
            clientIp: '127.0.0.1 (Local Test)',
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

    console.log('[App] Applying Signal:', sig, signalData.zone);

    // Update Header Badges
    if (sig === 0) {
      this.headerSignalBadge.textContent = 'SIGNAL: 0 (NO DETECTION)';
      this.headerSignalBadge.classList.remove('active');
    } else {
      this.headerSignalBadge.textContent = `SIGNAL: ${sig} (${signalData.zone || this.getZoneName(sig)})`;
      this.headerSignalBadge.classList.add('active');
    }

    // Update Footer Status
    this.lastPingText.textContent = `Last Signal: ${sig} (${signalData.zone}) at ${signalData.formattedTime || 'Now'} [${signalData.clientIp || 'Network'}]`;

    // Update 4 Quadrants & CSI Rays
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

    // Update 4 Waveform Channels
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
    const display = networkInfo.endpointDisplay || `${networkInfo.primaryIp}:${port}`;

    this.headerEndpointStatus.textContent = `ENDPOINT: ${display}`;
    this.quickEndpointText.textContent = endpoint;
    this.inputEndpointUrl.value = endpoint;

    // Populate network adapters in modal
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

  async openConfigModal() {
    this.configModal.classList.remove('hidden');
    if (window.electronAPI && window.electronAPI.getNetworkInfo) {
      const info = await window.electronAPI.getNetworkInfo();
      this.updateNetworkUI(info);
    }
  }

  closeConfigModal() {
    this.configModal.classList.add('hidden');
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
