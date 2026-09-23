const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const SignalServer = require('./server');
const RealModeController = require('./real_mode/real_mode_controller');

let mainWindow = null;
const signalServer = new SignalServer();
const realModeController = new RealModeController();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 880,
    minWidth: 860,
    minHeight: 740,
    backgroundColor: '#0d1117',
    title: 'Zone Detection Monitor - ESP32 CSI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Start embedded server and app
app.whenReady().then(async () => {
  createWindow();

  try {
    const info = await signalServer.start(5000, (signalData) => {
      // Application Mode guard: Only dispatch to UI if Application Mode is active
      if (signalServer.activeMode === 'Application Mode') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('signal-received', signalData);
        }
      }
    });
    console.log('[Main] Signal server running at:', info.networkInfo.endpointUrl);
  } catch (err) {
    console.error('[Main] Failed to start signal server:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC handlers
ipcMain.handle('get-network-info', () => {
  return signalServer.getNetworkInterfaces();
});

ipcMain.handle('get-server-status', () => {
  return {
    isRunning: signalServer.isRunning,
    port: signalServer.actualPort,
    mode: signalServer.activeMode,
    networkInfo: signalServer.getNetworkInterfaces(),
    lastSignal: signalServer.lastSignal,
    realMode: realModeController.getStatus()
  };
});

ipcMain.handle('set-mode', async (event, mode) => {
  signalServer.setMode(mode);

  if (mode === 'Real Mode') {
    console.log('[Main] Enabling Real Mode (Hardware UDP Stream)...');
    await realModeController.activate({
      onSignal: (signalData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('signal-received', signalData);
        }
      },
      onTelemetry: (telemetry) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('real-mode-telemetry', telemetry);
        }
      },
      onNodeData: (nodeData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('real-mode-node-data', nodeData);
        }
      }
    });
  } else {
    console.log('[Main] Enabling Application Mode (Mobile HTTP Stream)...');
    await realModeController.deactivate();
  }

  return { success: true, mode };
});

ipcMain.handle('simulate-signal', (event, signal) => {
  const signalNum = Number(signal);
  const zone = signalServer.getZoneName(signalNum);
  const signalData = {
    signal: signalNum,
    zone,
    mode: signalServer.activeMode,
    timestamp: Date.now(),
    clientIp: '127.0.0.1 (Manual Simulation)',
    formattedTime: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
  };

  signalServer.lastSignal = signalData;
  signalServer.signalHistory.unshift(signalData);
  if (signalServer.signalHistory.length > 50) signalServer.signalHistory.pop();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('signal-received', signalData);
  }
  return { success: true, signalData };
});

app.on('window-all-closed', async () => {
  await realModeController.deactivate();
  await signalServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
