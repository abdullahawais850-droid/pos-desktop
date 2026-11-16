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
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid POS data');
  }

  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });

  const temporaryFile = `${file}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporaryFile, file);

  return true;
});

ipcMain.handle('receipt:print', async (event, sale, settings = {}) => {
  if (!sale || !Array.isArray(sale.items)) {
    throw new Error('Invalid receipt data');
  }

  const parent = BrowserWindow.fromWebContents(event.sender);
  const prompt = await dialog.showMessageBox(parent || undefined, {
    type: 'question',
    title: 'Print bill slip?',
    message: `Print the bill slip for sale ${String(sale.receipt || '')}?`,
    buttons: ['Print', 'Cancel sale'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (prompt.response !== 0) return false;

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const currencyCode = /^[A-Z]{3}$/.test(String(settings.currency || ''))
    ? settings.currency
    : 'PKR';

  const money = (value) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode
    }).format(Number(value) || 0);

  const itemRows = sale.items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;

    return `
      <tr>
        <td>
          ${escapeHtml(item.name)}
          <small>${quantity} ${escapeHtml(item.unit || 'each')} × ${money(price)}</small>
        </td>
        <td class="amount">${money(quantity * price)}</td>
      </tr>
    `;
  }).join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt ${escapeHtml(sale.receipt)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      width: 72mm;
      margin: 0 auto;
      padding: 4mm 0;
      color: #111;
      font: 12px Arial, sans-serif;
    }
    header {
      text-align: center;
      border-bottom: 1px dashed #555;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    h1 { font-size: 18px; margin: 0 0 5px; }
    p { margin: 5px 0; }
    .meta { font-size: 10px; color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 5px 0; vertical-align: top; text-align: left; }
    th:last-child, .amount { text-align: right; white-space: nowrap; }
    td small { display: block; color: #444; margin-top: 3px; }
    .totals { border-top: 1px dashed #555; margin-top: 8px; padding-top: 7px; }
    .totals p { display: flex; justify-content: space-between; }
    .total { font-weight: bold; font-size: 14px; }
    .footer {
      text-align: center;
      border-top: 1px dashed #555;
      margin-top: 12px;
      padding-top: 10px;
      font-size: 10px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(settings.businessName || 'My Business')}</h1>
    <p>${escapeHtml(settings.businessType || '')}</p>
  </header>

  <p class="meta">Receipt: ${escapeHtml(sale.receipt)}</p>
  <p class="meta">Date: ${escapeHtml(new Date(sale.createdAt || Date.now()).toLocaleString())}</p>
  <p class="meta">Buyer: ${escapeHtml(sale.customerName || 'Walk-in customer')}</p>
  <p class="meta">Payment: ${escapeHtml(sale.payment || '')}</p>

  <table>
    <thead>
      <tr><th>Item / quantity</th><th>Amount</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <p><span>Subtotal</span><span>${money(sale.subtotal)}</span></p>
    <p><span>Discount</span><span>−${money(sale.discount)}</span></p>
    <p><span>Tax</span><span>${money(sale.tax)}</span></p>
    <p class="total"><span>TOTAL</span><span>${money(sale.total)}</span></p>
  </div>

  <div class="footer">${escapeHtml(settings.receiptFooter || 'Thank you for your business')}</div>
</body>
</html>`;

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 700,
    autoHideMenuBar: true,
    parent,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );

    return await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => {
          if (!success && failureReason) {
            console.error('Receipt printing failed:', failureReason);
          }
          resolve(Boolean(success));
        }
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
});

ipcMain.handle('report:export', async (_event, report) => {
  const result = await dialog.showSaveDialog({
    title: 'Export POS data',
    defaultPath: `pos-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) return false;

  await fs.writeFile(
    result.filePath,
    JSON.stringify(report, null, 2),
    'utf8'
  );

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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
