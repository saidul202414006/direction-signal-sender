const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSignalReceived: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('signal-received', subscription);
    return () => ipcRenderer.removeListener('signal-received', subscription);
  },
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  simulateSignal: (signal) => ipcRenderer.invoke('simulate-signal', signal)
});
