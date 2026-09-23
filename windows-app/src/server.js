const http = require('http');
const os = require('os');

class SignalServer {
  constructor() {
    this.server = null;
    this.port = 5000;
    this.actualPort = null;
    this.isRunning = false;
    this.lastSignal = null;
    this.signalHistory = [];
    this.onSignalCallback = null;
    this.activeMode = 'Application Mode'; // 'Application Mode' | 'Real Mode'
  }

  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
        if (net.family === familyV4Value && !net.internal) {
          addresses.push({
            name,
            address: net.address,
            isWifi: /wi-?fi|wlan|wireless/i.test(name),
            isEthernet: /ethernet|eth|lan/i.test(name)
          });
        }
      }
    }

    // Sort to prioritize Wi-Fi/Ethernet over virtual adapters
    addresses.sort((a, b) => {
      if (a.isWifi && !b.isWifi) return -1;
      if (!a.isWifi && b.isWifi) return 1;
      if (a.isEthernet && !b.isEthernet) return -1;
      if (!a.isEthernet && b.isEthernet) return 1;
      return 0;
    });

    const primaryIp = addresses.length > 0 ? addresses[0].address : '127.0.0.1';
    return {
      primaryIp,
      allInterfaces: addresses,
      endpointUrl: `http://${primaryIp}:${this.actualPort || this.port}/api/signal`,
      endpointDisplay: `${primaryIp}:${this.actualPort || this.port}`
    };
  }

  getZoneName(signal) {
    switch (Number(signal)) {
      case 0: return 'No Detection (Signal 0)';
      case 1: return 'Zone A';
      case 2: return 'Zone B';
      case 3: return 'Zone C';
      case 4: return 'Zone D';
      default: return `Unknown Signal (${signal})`;
    }
  }

  start(preferredPort = 5000, onSignal = null) {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        return resolve({
          port: this.actualPort,
          networkInfo: this.getNetworkInterfaces()
        });
      }

      this.port = preferredPort;
      this.onSignalCallback = onSignal;

      const tryPort = (p) => {
        const s = http.createServer((req, res) => this.handleRequest(req, res));

        s.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[SignalServer] Port ${p} is in use, trying ${p + 1}...`);
            if (p < preferredPort + 10) {
              tryPort(p + 1);
            } else {
              reject(new Error(`Unable to bind to any port between ${preferredPort} and ${p}`));
            }
          } else {
            reject(err);
          }
        });

        s.listen(p, '0.0.0.0', () => {
          this.server = s;
          this.actualPort = p;
          this.isRunning = true;
          console.log(`[SignalServer] HTTP Receiver listening on 0.0.0.0:${p}`);
          resolve({
            port: this.actualPort,
            networkInfo: this.getNetworkInterfaces()
          });
        });
      };

      tryPort(preferredPort);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.server = null;
          console.log('[SignalServer] Stopped.');
          resolve();
        });
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  setMode(mode) {
    this.activeMode = mode;
    console.log(`[SignalServer] Mode changed to: ${mode}`);
  }

  handleRequest(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1e6) {
          req.socket.destroy(); // Flood protection
        }
      });

      req.on('end', () => {
        let signal = null;
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.signal !== 'undefined') {
            signal = Number(parsed.signal);
          }
        } catch (e) {
          // Check regex fallback: {"signal": 1}
          const match = body.match(/"signal"\s*:\s*(\d+)/);
          if (match) {
            signal = Number(match[1]);
          }
        }

        if (signal === null || isNaN(signal)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: 'Invalid payload. Expected JSON: {"signal": <0|1|2|3|4>}',
            receivedBody: body
          }));
        }

        const zone = this.getZoneName(signal);
        const signalData = {
          signal,
          zone,
          mode: this.activeMode,
          timestamp: Date.now(),
          clientIp,
          formattedTime: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
        };

        this.lastSignal = signalData;
        this.signalHistory.unshift(signalData);
        if (this.signalHistory.length > 50) {
          this.signalHistory.pop();
        }

        console.log(`[SignalServer] Received Signal: ${signal} (${zone}) from ${clientIp}`);

        if (typeof this.onSignalCallback === 'function') {
          try {
            this.onSignalCallback(signalData);
          } catch (err) {
            console.error('[SignalServer] Callback error:', err);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          received: signal,
          zone,
          mode: this.activeMode,
          timestamp: signalData.timestamp
        }));
      });

    } else if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        service: 'Windows Zone Detection Signal Receiver',
        mode: this.activeMode,
        port: this.actualPort,
        networkInfo: this.getNetworkInterfaces(),
        lastSignal: this.lastSignal,
        historyCount: this.signalHistory.length
      }));
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
  }
}

module.exports = SignalServer;
