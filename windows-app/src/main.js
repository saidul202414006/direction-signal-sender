const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const SignalServer = require('./server');

let mainWindow = null;
const signalServer = new SignalServer();

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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('signal-received', signalData);
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
    lastSignal: signalServer.lastSignal
  };
});

ipcMain.handle('set-mode', (event, mode) => {
  signalServer.setMode(mode);
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
  await signalServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
