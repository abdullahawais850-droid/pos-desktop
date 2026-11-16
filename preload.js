const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posAPI', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  clearRecords: () => ipcRenderer.invoke('data:clear-records'),
  printReceipt: (sale, settings) => ipcRenderer.invoke('receipt:print', sale, settings),
  export: (report) => ipcRenderer.invoke('report:export', report)
});
