const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const dataFile = () => path.join(app.getPath('userData'), 'pos-data.json');
const DEFAULT_SETTINGS = {
  businessName: 'My Business',
  businessType: 'Glasses store',
  currency: 'PKR',
  taxRate: 0,
  receiptFooter: 'Thank you for your business'
};

// Electron inserts this trusted stylesheet through the WebContents API so the
// receipt preview works with the app's restrictive style-src 'self' CSP.
const RECEIPT_PREVIEW_CSS = `
#receiptPreview[hidden]{display:none!important}
#receiptPreview{position:fixed;inset:0;z-index:1000;background:rgba(17,17,17,.6);display:flex;align-items:center;justify-content:center;padding:20px}
#receiptPreview .receipt-dialog{background:#f4f6fb;width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:14px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
#receiptPreview .receipt-modal-head,#receiptPreview .receipt-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}
#receiptPreview .receipt-modal-head h2{margin:0}
#receiptPreview .receipt-paper{background:#fff;color:#111;overflow:auto;margin:14px auto;padding:24px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.12);font:14px Arial,sans-serif}
#receiptPreview .receipt-heading{text-align:center;line-height:1.55}
#receiptPreview .receipt-heading h2{margin:0}
#receiptPreview .receipt-table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px}
#receiptPreview .receipt-table th,#receiptPreview .receipt-table td{padding:8px 5px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
#receiptPreview .receipt-table th:not(:first-child),#receiptPreview .receipt-table td:not(:first-child){text-align:right;white-space:nowrap}
#receiptPreview .receipt-table small{display:block;color:#555;margin-top:3px}
#receiptPreview .receipt-total-row{display:flex;justify-content:space-between;padding:5px 0}
#receiptPreview .receipt-grand{border-top:2px solid #222;margin-top:5px;padding-top:10px;font-size:18px;font-weight:bold}
#receiptPreview .receipt-thanks{text-align:center;border-top:1px dashed #777;padding-top:14px;margin-top:18px;white-space:pre-wrap}
#receiptPreview .receipt-actions{justify-content:flex-end;margin-top:14px}
#receiptPreview .receipt-actions button:disabled{opacity:.6;cursor:wait}
@media(max-width:600px){#receiptPreview{padding:8px}#receiptPreview .receipt-dialog{width:100%;padding:12px}#receiptPreview .receipt-paper{padding:12px}}
`;

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
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid POS data');
  await writeData(data);
  return true;
});

ipcMain.handle('receipt:print', async (event, sale, settings = {}) => {
  if (!sale || !Array.isArray(sale.items)) throw new Error('Invalid receipt data');
  const parent = BrowserWindow.fromWebContents(event.sender);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const currency = /^[A-Z]{3}$/.test(String(settings.currency || '')) ? settings.currency : 'PKR';
  const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value) || 0);
  const rows = sale.items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return `<tr><td>${escapeHtml(item.name)}<small>Barcode/SKU: ${escapeHtml(item.sku || '—')} · ${quantity} ${escapeHtml(item.unit || 'each')} × ${money(price)}</small></td><td class="right">${money(quantity * price)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(sale.receipt)}</title><style>
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
    show: false, width: 420, height: 700, autoHideMenuBar: true,
    ...(parent ? { parent } : {}),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (!success && reason) console.error('Receipt print failed:', reason);
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
    width: 1440, height: 920, minWidth: 1050, minHeight: 700,
    title: 'Universal POS', backgroundColor: '#f4f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(RECEIPT_PREVIEW_CSS).catch((error) => {
      console.error('Could not install receipt preview styles:', error);
    });
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
