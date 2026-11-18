const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const dataFile = () => path.join(app.getPath('userData'), 'pos-data.json');
const RECEIPT_PREVIEW_CSS = `
#receiptPreview[hidden]{display:none!important}
#receiptPreview{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#172033}
#receiptPreview .receipt-dialog{background:#f4f6fb;width:min(950px,96vw);height:min(90vh,920px);display:flex;flex-direction:column;border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}
#receiptPreview .receipt-modal-head{display:flex;flex-direction:column;align-items:flex-start;gap:22px;flex:none}
#receiptPreview .receipt-modal-head h2{margin:24px 0 0;font-size:30px;line-height:1.2;color:#10243f}
#receiptPreview .receipt-modal-head .button{min-height:48px;padding:0 18px;background:#fff;border:1px solid #e1e6ef;border-radius:12px;color:#42536b;font-weight:600}
#receiptPreview .receipt-paper{background:#fff;color:#111;overflow:auto;overscroll-behavior:contain;margin:16px 0 0;padding:20px 30px;width:100%;min-height:0;flex:1;font:16px Arial,sans-serif}
#receiptPreview .receipt-heading{text-align:center;line-height:1.45;color:#111}
#receiptPreview .receipt-heading h2{font-size:24px;margin:0 0 18px;color:#111}
#receiptPreview .receipt-heading hr{border:0;border-top:1px solid #aaa;margin:8px 0}
#receiptPreview .receipt-table{width:100%;border-collapse:collapse;margin:24px 0 20px;font-size:14px;color:#182f4e}
#receiptPreview .receipt-table thead{background:#f7f8fa}
#receiptPreview .receipt-table th,#receiptPreview .receipt-table td{padding:10px 6px;border-bottom:1px solid #d8d8d8;text-align:left;vertical-align:top}
#receiptPreview .receipt-table th:not(:first-child),#receiptPreview .receipt-table td:not(:first-child){text-align:left;white-space:nowrap}
#receiptPreview .receipt-table td:first-child{width:48%}
#receiptPreview .receipt-table small{display:block;color:#38506e;margin-top:3px;font-size:12px}
#receiptPreview .receipt-total-row{display:flex;justify-content:space-between;padding:7px 0;color:#111}
#receiptPreview .receipt-grand{border-top:2px solid #222;margin-top:4px;padding-top:10px;font-size:22px;font-weight:bold}
#receiptPreview .receipt-thanks{text-align:center;border-top:1px dashed #888;padding-top:18px;margin-top:26px;white-space:pre-wrap;color:#111}
#receiptPreview .receipt-actions{display:flex;align-items:center;justify-content:flex-end;gap:14px;margin-top:16px;flex:none}
#receiptPreview .receipt-actions button{min-height:48px;padding:0 20px;border-radius:11px;font-weight:700}
#receiptPreview #cancelReceipt{background:#fff;border:1px solid #e1e6ef;color:#42536b}
#receiptPreview #printReceiptButton{background:#117d70;border:1px solid #117d70;color:#fff}
#receiptPreview .receipt-actions button:disabled{opacity:.6;cursor:wait}
#receiptPreview .receipt-status{margin:8px 0 0;color:#a93226;font-size:13px}
@media(max-width:650px){#receiptPreview{padding:8px}#receiptPreview .receipt-dialog{width:100%;height:96vh;padding:14px;border-radius:14px}#receiptPreview .receipt-modal-head h2{font-size:24px;margin-top:8px}#receiptPreview .receipt-paper{padding:12px}#receiptPreview .receipt-table{font-size:12px}#receiptPreview .receipt-actions{gap:8px}#receiptPreview .receipt-actions button{padding:0 10px;font-size:12px}}
`;

async function writeData(data) {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporary, file);
}

ipcMain.handle('data:load', async () => {
  try { return JSON.parse(await fs.readFile(dataFile(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
ipcMain.handle('data:save', async (_event, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid POS data');
  await writeData(data);
  return true;
});

// The renderer preview already asks whether to print. This IPC handler only prints;
// it deliberately does not show a second native confirmation dialog.
ipcMain.handle('receipt:print', async (event, sale, settings = {}) => {
  if (!sale || !Array.isArray(sale.items)) throw new Error('Invalid receipt data');
  const parent = BrowserWindow.fromWebContents(event.sender);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const currency = /^[A-Z]{3}$/.test(String(settings.currency || '')) ? settings.currency : 'PKR';
  const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value) || 0);
  const rows = sale.items.map((item) => `<tr><td>${escapeHtml(item.name)}<small>${escapeHtml(item.barcode || item.sku || '—')}</small></td><td>${Number(item.quantity) || 0}</td><td>${money(item.price)}</td><td>${money((Number(item.quantity) || 0) * (Number(item.price) || 0))}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;padding:4mm 0;color:#111;font:12px Arial,sans-serif}
    header{text-align:center;border-bottom:1px dashed #555;padding-bottom:8px;margin-bottom:8px}h1{font-size:18px;margin:0 0 5px}p{margin:5px 0}.meta{font-size:10px;color:#444}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;padding:5px 2px;vertical-align:top}td small{display:block;color:#444;margin-top:3px}.right{text-align:right}
    .totals{border-top:1px dashed #555;margin-top:8px;padding-top:6px}.totals p{display:flex;justify-content:space-between}.total{font-weight:bold;font-size:14px}.footer{text-align:center;border-top:1px dashed #555;margin-top:12px;padding-top:10px;font-size:10px;white-space:pre-wrap}
    </style></head><body><header><h1>${escapeHtml(settings.businessName || 'My Business')}</h1><p>${escapeHtml(settings.businessType || '')}</p></header>
    <p class="meta">Receipt: ${escapeHtml(sale.receipt)}</p><p class="meta">Date: ${escapeHtml(new Date(sale.createdAt || Date.now()).toLocaleString())}</p>
    <p class="meta">Customer: ${escapeHtml(sale.customerName || 'Walk-in customer')}</p><p class="meta">Payment: ${escapeHtml(sale.payment || '')}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><p><span>Subtotal</span><span>${money(sale.subtotal)}</span></p><p><span>Discount</span><span>−${money(sale.discount)}</span></p><p><span>Tax</span><span>${money(sale.tax)}</span></p><p class="total"><span>Total</span><span>${money(sale.total)}</span></p></div>
    <div class="footer">${escapeHtml(settings.receiptFooter || 'Thank you for your business')}</div></body></html>`;
  const printWindow = new BrowserWindow({ show: false, width: 420, height: 700, autoHideMenuBar: true, ...(parent ? { parent } : {}), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      if (!success && reason) console.error('Receipt print failed:', reason);
      resolve(Boolean(success));
    }));
  } finally { if (!printWindow.isDestroyed()) printWindow.close(); }
});

ipcMain.handle('report:export', async (_event, report) => {
  const result = await dialog.showSaveDialog({ title: 'Export POS data', defaultPath: `pos-export-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf8');
  return true;
});

function installSalePreview(win) {
  win.webContents.insertCSS(RECEIPT_PREVIEW_CSS).then(() => win.webContents.executeJavaScript(`(() => {
    if (window.__posSalePreviewInstalled) return;
    window.__posSalePreviewInstalled = true;
    const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));
    const money = (v, code) => { try { return new Intl.NumberFormat(undefined,{style:'currency',currency:code || 'PKR'}).format(Number(v)||0); } catch { return (code || 'PKR') + ' ' + (Number(v)||0).toFixed(2); } };
    const modal = document.createElement('div');
    modal.id = 'receiptPreview'; modal.hidden = true;
    modal.innerHTML = '<div class="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receiptPreviewTitle"><div class="receipt-modal-head"><h2 id="receiptPreviewTitle">Bill slip preview</h2><button type="button" class="button" id="closeReceiptPreview">Close</button></div><div id="receiptPreviewContent" class="receipt-paper"></div><p id="receiptPreviewStatus" class="receipt-status" aria-live="polite"></p><div class="receipt-actions"><button type="button" class="button" id="cancelReceipt">Cancel sale</button><button type="button" class="button" id="printReceiptButton">Print slip &amp; complete sale</button></div></div>';
    document.body.appendChild(modal);
    let pending = null;
    const close = () => { pending = null; modal.hidden = true; document.getElementById('receiptPreviewContent').innerHTML = ''; document.getElementById('receiptPreviewStatus').textContent = ''; };
    document.getElementById('closeReceiptPreview').addEventListener('click', close);
    document.getElementById('cancelReceipt').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.addEventListener('click', async (event) => {
      const completeButton = event.target.closest('#completeSale');
      if (!completeButton) return;
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const saved = await window.posAPI.load() || {settings:{},products:[],customers:[],sales:[]};
        const lines = [...document.querySelectorAll('#cartLines .cart-line')];
        if (!lines.length) { const notice = document.getElementById('notice'); if (notice) { notice.textContent = 'Add at least one item before completing a sale.'; notice.className = 'notice show error'; } return; }
        const items = lines.map(row => {
          const idButton = row.querySelector('[data-id]');
          const id = idButton?.dataset.id;
          const product = (saved.products || []).find(p => String(p.id) === String(id));
          const qty = Number(row.querySelector('.quantity b')?.textContent || 1);
          if (!product) throw new Error('A cart item was not found in the saved catalog.');
          return {id:product.id,name:product.name,sku:product.sku || '',barcode:product.barcode || product.sku || '',unit:product.unit || 'each',price:Number(product.price)||0,quantity:qty};
        });
        for (const item of items) { const product = saved.products.find(p => p.id === item.id); if (product.trackStock && item.quantity > Number(product.stock)) throw new Error('Not enough stock for ' + item.name + '.'); }
        const subtotal = items.reduce((sum,item) => sum + item.price * item.quantity,0);
        const discount = Math.min(subtotal,Math.max(0,Number(document.getElementById('discountInput')?.value)||0));
        const tax = (subtotal-discount)*Math.max(0,Number(saved.settings?.taxRate)||0)/100;
        const selectedCustomer = (saved.customers || []).find(c => c.id === document.getElementById('saleCustomer')?.value);
        pending = {receipt:'R-'+Date.now().toString().slice(-8),createdAt:new Date().toISOString(),customerName:selectedCustomer?.name||'',payment:document.getElementById('paymentMethod')?.value||'Cash',subtotal,discount,tax,total:subtotal-discount+tax,items};
        const settings = saved.settings || {};
        const rows = items.map(item => '<tr><td>'+esc(item.name)+'<small>'+esc(item.barcode || item.sku || '—')+'</small></td><td>'+item.quantity+'</td><td>'+money(item.price,settings.currency)+'</td><td>'+money(item.price*item.quantity,settings.currency)+'</td></tr>').join('');
        document.getElementById('receiptPreviewContent').innerHTML = '<div class="receipt-heading"><h2>'+esc(settings.businessName || 'My Business')+'</h2><div>'+esc(settings.businessType || '')+'</div><hr><div>Receipt: '+esc(pending.receipt)+'</div><div>'+esc(new Date(pending.createdAt).toLocaleString())+'</div><div>Customer: '+esc(pending.customerName || 'Walk-in customer')+'</div><div>Payment: '+esc(pending.payment)+'</div></div><table class="receipt-table"><thead><tr><th>Item / barcode</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><div class="receipt-total-row"><span>Subtotal</span><b>'+money(subtotal,settings.currency)+'</b></div><div class="receipt-total-row"><span>Discount</span><b>−'+money(discount,settings.currency)+'</b></div><div class="receipt-total-row"><span>Tax</span><b>'+money(tax,settings.currency)+'</b></div><div class="receipt-total-row receipt-grand"><span>Total</span><b>'+money(pending.total,settings.currency)+'</b></div><div class="receipt-thanks">'+esc(settings.receiptFooter || 'Thank you for your business')+'</div>';
        document.getElementById('receiptPreviewStatus').textContent = '';
        modal.hidden = false;
        document.getElementById('printReceiptButton').focus();
      } catch (error) {
        const notice = document.getElementById('notice'); if (notice) { notice.textContent = error.message; notice.className = 'notice show error'; }
      }
    }, true);

    document.getElementById('printReceiptButton').addEventListener('click', async event => {
      if (!pending) return;
      const button = event.currentTarget; button.disabled = true;
      try {
        const sale = pending;
        const printed = await window.posAPI.printReceipt(sale, (await window.posAPI.load())?.settings || {});
        if (!printed) { document.getElementById('receiptPreviewStatus').textContent = 'Printing was cancelled; sale was not recorded. You can try printing again or cancel the sale.'; return; }
        const saved = await window.posAPI.load() || {settings:{},products:[],customers:[],sales:[]};
        for (const item of sale.items) { const product = saved.products.find(p => p.id === item.id); if (product?.trackStock) product.stock = Number(product.stock) - item.quantity; }
        saved.sales = Array.isArray(saved.sales) ? saved.sales : [];
        saved.sales.unshift(sale);
        await window.posAPI.save(saved);
        close(); window.location.reload();
      } catch (error) {
        document.getElementById('receiptPreviewStatus').textContent = 'Could not complete sale: ' + error.message;
      } finally { button.disabled = false; }
    });
  })();`)).catch(error => console.error('Could not install packaged bill slip preview:', error));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1050, minHeight: 700,
    title: 'Universal POS', backgroundColor: '#f4f6fb',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.on('did-finish-load', () => installSalePreview(win));
  win.loadFile(path.join(__dirname, 'index.html'));
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
