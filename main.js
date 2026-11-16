const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const dataFile = () => path.join(app.getPath('userData'), 'pos-data.json');
const DEFAULT_SETTINGS = {
  businessName: 'My Business',
  businessType: 'General retail',
  currency: 'PKR',
  taxRate: 0,
  receiptFooter: 'Thank you for your business'
};

async function writeData(data) {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporary, file);
}

ipcMain.handle('data:load', async () => {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('data:save', async (_event, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid POS data');
  }
  await writeData(data);
  return true;
});

// Clear products, customers, and sales, but keep business settings.
ipcMain.handle('data:clear-records', async () => {
  let saved = null;
  try {
    saved = JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await writeData({
    settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
    products: [],
    customers: [],
    sales: []
  });
  return true;
});

ipcMain.handle('receipt:print', async (event, sale, settings = {}) => {
  if (!sale || !Array.isArray(sale.items)) throw new Error('Invalid receipt data');

  const parent = BrowserWindow.fromWebContents(event.sender);
  const prompt = await dialog.showMessageBox(parent, {
    type: 'question',
    title: 'Print bill slip?',
    message: `Print bill slip for ${String(sale.receipt || '')}?`,
    buttons: ['Print', 'Cancel sale'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (prompt.response !== 0) return false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const currency = /^[A-Z]{3}$/.test(String(settings.currency || '')) ? settings.currency : 'PKR';
  const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value) || 0);
  const rows = sale.items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return `<tr><td>${escapeHtml(item.name)}<small>${quantity} ${escapeHtml(item.unit || 'each')} × ${money(price)}</small></td><td class="right">${money(quantity * price)}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;padding:4mm 0;color:#111;font:12px Arial,sans-serif}
    header{text-align:center;border-bottom:1px dashed #555;padding-bottom:8px;margin-bottom:8px}h1{font-size:18px;margin:0 0 5px}p{margin:5px 0}.meta{font-size:10px;color:#444}
    table{width:100%;border-collapse:collapse;font-size:11px}td{padding:5px 0;vertical-align:top}td small{display:block;color:#444;margin-top:3px}.right{text-align:right;white-space:nowrap}
    .totals{border-top:1px dashed #555;margin-top:8px;padding-top:6px}.totals p{display:flex;justify-content:space-between}.total{font-weight:bold;font-size:14px}.footer{text-align:center;border-top:1px dashed #555;margin-top:12px;padding-top:10px;font-size:10px;white-space:pre-wrap}
    </style></head><body><header><h1>${escapeHtml(settings.businessName || 'My Business')}</h1><p>${escapeHtml(settings.businessType || '')}</p></header>
    <p class="meta">Receipt: ${escapeHtml(sale.receipt)}</p><p class="meta">Date: ${escapeHtml(new Date(sale.createdAt || Date.now()).toLocaleString())}</p>
    <p class="meta">Buyer: ${escapeHtml(sale.customerName || 'Walk-in customer')}</p><p class="meta">Payment: ${escapeHtml(sale.payment || '')}</p>
    <table><thead><tr><th>Item / quantity</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><p><span>Subtotal</span><span>${money(sale.subtotal)}</span></p><p><span>Discount</span><span>−${money(sale.discount)}</span></p><p><span>Tax</span><span>${money(sale.tax)}</span></p><p class="total"><span>TOTAL</span><span>${money(sale.total)}</span></p></div>
    <div class="footer">${escapeHtml(settings.receiptFooter || 'Thank you for your business')}</div></body></html>`;

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 700,
    autoHideMenuBar: true,
    parent,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (!success && reason) console.error('Print failed:', reason);
        resolve(Boolean(success));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
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

  win.webContents.on('did-finish-load', () => {
    // Add the clear-records control to the dashboard without modifying the POS markup.
    win.webContents.executeJavaScript(`(() => {
      const dashboard = document.getElementById('dashboard');
      if (!dashboard || document.getElementById('clearAllRecords')) return;
      const button = document.createElement('button');
      button.id = 'clearAllRecords';
      button.type = 'button';
      button.className = 'button';
      button.textContent = 'Clear all records';
      button.style.cssText = 'display:block;margin:0 0 16px auto;color:#a93226;border-color:#e7b5b0';
      dashboard.prepend(button);
      button.addEventListener('click', async () => {
        const confirmed = window.confirm('Clear all products, customers, and sales? Business settings will be kept. This cannot be undone.');
        if (!confirmed) return;
        button.disabled = true;
        try {
          await window.posAPI.clearRecords();
          window.location.reload();
        } catch (error) {
          window.alert('Could not clear records: ' + error.message);
          button.disabled = false;
        }
      });
    })();`);
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
