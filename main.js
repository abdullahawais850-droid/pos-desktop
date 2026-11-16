const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const dataFile = () => path.join(app.getPath('userData'), 'pos-data.json');

ipcMain.handle('data:load', async () => {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('data:save', async (_event, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid POS data');
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempFile, file);
  return true;
});

ipcMain.handle('report:export', async (_event, report) => {
  const result = await dialog.showSaveDialog({
    title: 'Export POS data',
    defaultPath: `pos-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf8');
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    title: 'Universal POS',
    backgroundColor: '#f4f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
