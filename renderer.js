const DEFAULT_STATE = {
  settings: {
    businessName: 'My Business', businessType: 'Glasses store', currency: 'PKR',
    taxRate: 0, receiptFooter: 'Thank you for your business',
    overviewCleared: false, demoGlassesSeeded: false, demoCustomersSeeded: false
  },
  products: [], customers: [], sales: []
};
let state = structuredClone(DEFAULT_STATE);
let cart = [];
let pendingSale = null;
let noticeTimer;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency || 'PKR' }).format(Number(value) || 0); }
  catch { return `PKR ${(Number(value) || 0).toFixed(2)}`; }
};
const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value) || 0);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function notify(message, type = 'success') {
  const box = $('#notice');
  if (!box) return;
  box.textContent = message;
  box.className = `notice show ${type}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { box.className = 'notice'; }, 4000);
}
async function persist() {
  try { await window.posAPI.save(state); return true; }
  catch (error) { notify(`Could not save data: ${error.message}`, 'error'); return false; }
}
function businessInfo() {
  const name = state.settings.businessName?.trim() || 'Universal POS';
  const type = state.settings.businessType || 'Business';
  const brandName = document.querySelector('.brand b');
  const logo = document.querySelector('.brand-icon');
  if (brandName) brandName.textContent = name;
  if (logo) logo.textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  $('#businessLabel').textContent = type;
  $('#businessTypeHeading').textContent = `${type.toUpperCase()} OVERVIEW`;
  document.title = name;
  $('#todayLabel').textContent = new Date().toLocaleDateString();
}
function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === name));
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  const labels = { dashboard: 'Overview', sales: 'Point of sale', products: 'Products & services', inventory: 'Inventory', customers: 'Customers', history: 'Sales history', settings: 'Business settings' };
  $('#pageTitle').textContent = labels[name] || 'Overview';
  if (name === 'sales') { renderCatalog(); setTimeout(() => $('#productSearch')?.focus(), 0); }
}
function ensureControls() {
  const typeSelect = $('#settingsForm')?.elements.businessType;
  if (typeSelect && ![...typeSelect.options].some((option) => option.value === 'Glasses store')) {
    typeSelect.add(new Option('Glasses store', 'Glasses store'));
  }
  const search = $('#productSearch');
  if (search) search.placeholder = 'Scan barcode or search by name / SKU, then press Enter';
  const sku = $('#productForm')?.elements.sku;
  if (sku) sku.placeholder = 'Scan or enter barcode / SKU';

  // Validate customer inputs in the UI as well as in the submit handler.
  const customerForm = $('#customerForm');
  if (customerForm) {
    const name = customerForm.elements.name;
    const phone = customerForm.elements.phone;
    const email = customerForm.elements.email;
    if (name) { name.required = true; name.minLength = 2; name.maxLength = 80; name.pattern = "[A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,79}"; name.title = 'Enter a name of 2–80 characters using letters, spaces, apostrophes, dots, or hyphens.'; }
    if (phone) { phone.required = true; phone.type = 'tel'; phone.minLength = 7; phone.maxLength = 20; phone.pattern = '[+]?[0-9 ()-]{7,20}'; phone.title = 'Enter a valid phone number (7–15 digits; spaces, +, hyphens, and parentheses are allowed).'; }
    if (email) { email.type = 'email'; email.required = true; email.maxLength = 254; email.placeholder = 'name@example.com'; }
  }
  if (!$('#receiptPreview')) {
    const modal = document.createElement('div');
    modal.id = 'receiptPreview'; modal.hidden = true;
    modal.innerHTML = `<style>
      #receiptPreview[hidden]{display:none!important}#receiptPreview{position:fixed;inset:0;z-index:1000;background:#1119;display:flex;align-items:center;justify-content:center;padding:20px}
      .receipt-dialog{background:#f4f6fb;width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:14px;padding:18px;box-shadow:0 20px 60px #0005}
      .receipt-modal-head,.receipt-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.receipt-modal-head h2{margin:0}
      .receipt-paper{background:white;color:#111;overflow:auto;margin:14px auto;padding:24px;width:100%;box-shadow:0 2px 12px #0002;font:14px Arial,sans-serif}
      .receipt-heading{text-align:center;line-height:1.55}.receipt-heading h2{margin:0}.receipt-table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px}
      .receipt-table th,.receipt-table td{padding:8px 5px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.receipt-table th:not(:first-child),.receipt-table td:not(:first-child){text-align:right;white-space:nowrap}.receipt-table small{display:block;color:#555;margin-top:3px}
      .receipt-total-row{display:flex;justify-content:space-between;padding:5px 0}.receipt-grand{border-top:2px solid #222;margin-top:5px;padding-top:10px;font-size:18px;font-weight:bold}.receipt-thanks{text-align:center;border-top:1px dashed #777;padding-top:14px;margin-top:18px;white-space:pre-wrap}.receipt-actions{justify-content:flex-end;margin-top:14px}
    </style><div class="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receiptPreviewTitle"><div class="receipt-modal-head"><h2 id="receiptPreviewTitle">Bill slip preview</h2><button type="button" class="button quiet" id="closeReceiptPreview">Close</button></div><div id="receiptPreviewContent" class="receipt-paper"></div><div class="receipt-actions"><button type="button" class="button quiet" id="cancelReceipt">Cancel sale</button><button type="button" class="button primary" id="printReceiptButton">Print slip &amp; complete sale</button></div></div>`;
    document.body.append(modal);
  }
}
function renderDashboard() {
  const cleared = Boolean(state.settings.overviewCleared);
  const day = new Date().toISOString().slice(0, 10);
  const todays = cleared ? [] : state.sales.filter((sale) => String(sale.createdAt || '').slice(0, 10) === day);
  $('#metricRevenue').textContent = money(todays.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
  $('#metricOrders').textContent = String(todays.length);
  $('#metricProducts').textContent = String(cleared ? 0 : state.products.filter((item) => item.active !== false).length);
  const low = cleared ? [] : state.products.filter((item) => item.trackStock && Number(item.stock) <= Number(item.reorderLevel));
  $('#metricLowStock').textContent = String(low.length);
  $('#recentSales').innerHTML = !cleared && state.sales.length ? state.sales.slice(0, 6).map((sale) => `<div class="row"><div class="row-main"><b>Receipt ${esc(sale.receipt)}</b><small>${esc(new Date(sale.createdAt).toLocaleString())} · ${esc(sale.payment)}</small></div><span class="row-end">${money(sale.total)}</span></div>`).join('') : '<div class="empty">Overview cleared or no recent sales. System records are preserved.</div>';
  $('#lowStockList').innerHTML = low.length ? low.slice(0, 6).map((item) => `<div class="row"><div class="row-main"><b>${esc(item.name)}</b><small>Reorder at ${number(item.reorderLevel)} ${esc(item.unit)}</small></div><span class="badge low">${number(item.stock)} left</span></div>`).join('') : '<div class="empty">No overview reminders to show.</div>';
  let button = $('#clearOverviewButton');
  if (!button) {
    button = document.createElement('button'); button.id = 'clearOverviewButton'; button.type = 'button'; button.className = 'button quiet'; button.style.cssText = 'display:block;margin:0 0 14px auto';
    $('#dashboard').prepend(button);
    button.addEventListener('click', async () => {
      state.settings.overviewCleared = !state.settings.overviewCleared;
      if (await persist()) { renderDashboard(); notify(state.settings.overviewCleared ? 'Overview cleared; all system records are preserved.' : 'Overview restored.'); }
    });
  }
  button.textContent = cleared ? 'Restore overview' : 'Clear overview only';
}
function renderCategories() {
  const select = $('#categoryFilter'); const current = select.value;
  const categories = [...new Set(state.products.map((item) => item.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All categories</option>' + categories.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if (categories.includes(current)) select.value = current;
}
function renderCatalog() {
  const query = $('#productSearch').value.trim().toLowerCase(); const category = $('#categoryFilter').value;
  const products = state.products.filter((item) => item.active !== false && (!category || item.category === category) && (!query || `${item.name} ${item.sku || ''} ${item.barcode || ''} ${item.category || ''}`.toLowerCase().includes(query)));
  $('#catalog').innerHTML = products.length ? products.map((item) => `<button class="catalog-item" data-add="${esc(item.id)}"><b>${esc(item.name)}</b><small>${esc(item.category || 'Uncategorized')} · ${esc(item.unit || 'each')} · Barcode ${esc(item.barcode || item.sku || '—')}${item.trackStock ? ` · ${number(item.stock)} available` : ''}</small><strong>${money(item.price)}</strong></button>`).join('') : '<div class="empty">No matching item. Scan its barcode or add it to the catalog.</div>';
}
function renderCart() {
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  $('#cartCount').textContent = count ? `${number(count)} item${count === 1 ? '' : 's'}` : 'No items yet';
  $('#cartLines').innerHTML = cart.length ? cart.map((line) => `<div class="cart-line"><div><div class="cart-name">${esc(line.name)}</div><div class="cart-meta">${money(line.price)} · ${esc(line.unit)} · ${esc(line.barcode || line.sku || '')}</div></div><div class="quantity"><button data-qty="-1" data-id="${esc(line.id)}" aria-label="Decrease">−</button><b>${number(line.quantity)}</b><button data-qty="1" data-id="${esc(line.id)}" aria-label="Increase">+</button><button class="icon-button" data-remove="${esc(line.id)}" aria-label="Remove">×</button></div></div>`).join('') : '<div class="empty">Choose or scan a catalog item to add it to this sale.</div>';
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('#discountInput').value) || 0));
  const tax = Math.max(0, subtotal - discount) * Math.max(0, Number(state.settings.taxRate) || 0) / 100;
  $('#subtotal').textContent = money(subtotal); $('#taxTotal').textContent = money(tax); $('#grandTotal').textContent = money(subtotal - discount + tax); $('#discountCurrency').textContent = state.settings.currency;
}
function addToCart(id) {
  const product = state.products.find((item) => item.id === id); if (!product) return;
  const line = cart.find((item) => item.id === id); const next = (line?.quantity || 0) + 1;
  if (product.trackStock && next > Number(product.stock)) return notify(`Only ${number(product.stock)} ${product.unit} in stock.`, 'error');
  if (line) line.quantity = next;
  else cart.push({ id, name: product.name, sku: product.sku || '', barcode: product.barcode || product.sku || '', price: Number(product.price), unit: product.unit || 'each', quantity: 1 });
  renderCart();
}
function findByBarcodeOrSku(value) {
  const code = String(value || '').trim().toLowerCase();
  return code ? state.products.find((product) => product.active !== false && [product.barcode, product.sku].some((candidate) => String(candidate || '').trim().toLowerCase() === code)) : null;
}
function scanIntoSale() {
  const input = $('#productSearch'); const value = input.value.trim(); if (!value) return;
  const product = findByBarcodeOrSku(value) || state.products.find((item) => item.active !== false && item.name.toLowerCase() === value.toLowerCase());
  if (!product) return notify(`No product found for barcode/SKU “${value}”.`, 'error');
  addToCart(product.id); input.value = ''; renderCatalog();
}
function renderProducts() {
  $('#productsTable').innerHTML = state.products.length ? state.products.map((item) => `<tr><td><b>${esc(item.name)}</b><br><span>${esc(item.unit || 'each')}</span></td><td>${esc(item.category || '—')}</td><td>${esc(item.barcode || item.sku || '—')}</td><td>${money(item.price)}</td><td>${item.trackStock ? number(item.stock) : 'Not tracked'}</td><td><button class="button quiet" data-delete-product="${esc(item.id)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Catalog is empty.</td></tr>';
}
function renderInventory() {
  const items = state.products.filter((item) => item.trackStock);
  $('#inventoryTable').innerHTML = items.length ? items.map((item) => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.category || '—')}</td><td>${number(item.stock)} ${esc(item.unit)}</td><td>${number(item.reorderLevel)}</td><td><span class="badge ${Number(item.stock) <= Number(item.reorderLevel) ? 'low' : 'ok'}">${Number(item.stock) <= Number(item.reorderLevel) ? 'Reorder' : 'In stock'}</span></td><td><div class="stock-adjust"><input type="number" step="0.001" min="0" placeholder="Qty" data-stock-value="${esc(item.id)}"><button data-stock="${esc(item.id)}" data-delta="1">Add</button><button data-stock="${esc(item.id)}" data-delta="-1">Remove</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No tracked inventory.</td></tr>';
}
function renderCustomers() {
  $('#customersList').innerHTML = state.customers.length ? state.customers.map((c) => `<div class="row"><div class="row-main"><b>${esc(c.name)}</b><small>${esc(c.phone || 'No phone')} · ${esc(c.email || 'No email')}${c.demo ? ' · Test customer' : ''}</small></div><button class="button quiet" data-delete-customer="${esc(c.id)}">Remove</button></div>`).join('') : '<div class="empty">No saved customers.</div>';
}
function renderCustomerOptions() {
  const select = $('#saleCustomer'); const current = select.value;
  select.innerHTML = '<option value="">Walk-in customer</option>' + state.customers.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  if (state.customers.some((c) => c.id === current)) select.value = current;
}
function renderSalesHistory() {
  $('#salesTable').innerHTML = state.sales.length ? state.sales.map((sale) => `<tr><td>${esc(sale.receipt)}</td><td>${esc(new Date(sale.createdAt).toLocaleString())}</td><td>${esc(sale.customerName || 'Walk-in')}</td><td>${esc(sale.payment)}</td><td>${number((sale.items || []).reduce((sum, item) => sum + item.quantity, 0))}</td><td><b>${money(sale.total)}</b></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No completed sales yet.</td></tr>';
}
function refresh() { businessInfo(); renderDashboard(); renderProducts(); renderInventory(); renderCustomers(); renderSalesHistory(); renderCustomerOptions(); renderCategories(); renderCart(); }
function receiptMarkup(sale) {
  return `<div class="receipt-heading"><h2>${esc(state.settings.businessName || 'My Business')}</h2><div>${esc(state.settings.businessType || '')}</div><hr><div>Receipt: ${esc(sale.receipt)}</div><div>${esc(new Date(sale.createdAt).toLocaleString())}</div><div>Customer: ${esc(sale.customerName || 'Walk-in customer')}</div><div>Payment: ${esc(sale.payment)}</div></div><table class="receipt-table"><thead><tr><th>Item / barcode</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${sale.items.map((item) => `<tr><td>${esc(item.name)}<small>${esc(item.barcode || item.sku || '—')}</small></td><td>${number(item.quantity)}</td><td>${money(item.price)}</td><td>${money(item.price * item.quantity)}</td></tr>`).join('')}</tbody></table><div class="receipt-total-row"><span>Subtotal</span><b>${money(sale.subtotal)}</b></div><div class="receipt-total-row"><span>Discount</span><b>−${money(sale.discount)}</b></div><div class="receipt-total-row"><span>Tax</span><b>${money(sale.tax)}</b></div><div class="receipt-total-row receipt-grand"><span>Total</span><b>${money(sale.total)}</b></div><div class="receipt-thanks">${esc(state.settings.receiptFooter || 'Thank you for your business')}</div>`;
}
function dismissReceipt() { pendingSale = null; $('#receiptPreview').hidden = true; $('#receiptPreviewContent').innerHTML = ''; }
async function printPendingSale() {
  if (!pendingSale) return;
  const sale = pendingSale; const button = $('#printReceiptButton'); button.disabled = true;
  try {
    const printed = await window.posAPI.printReceipt(sale, state.settings);
    if (!printed) return notify('Printing was cancelled or failed; sale was not recorded.', 'error');
    const oldStocks = new Map(state.products.map((p) => [p.id, p.stock]));
    for (const line of sale.items) { const product = state.products.find((p) => p.id === line.id); if (product?.trackStock) product.stock = Number(product.stock) - line.quantity; }
    state.sales.unshift(sale);
    if (!await persist()) { state.sales = state.sales.filter((item) => item.receipt !== sale.receipt); for (const product of state.products) product.stock = oldStocks.get(product.id); return; }
    cart = []; $('#discountInput').value = '0'; $('#saleCustomer').value = ''; dismissReceipt(); refresh(); notify(`Printed bill and recorded ${sale.receipt}.`);
  } catch (error) { notify(`Print failed; sale was not recorded: ${error.message}`, 'error'); }
  finally { button.disabled = false; }
}
function completeSale() {
  if (!cart.length) return notify('Add or scan at least one item before completing a sale.', 'error');
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('#discountInput').value) || 0));
  const tax = (subtotal - discount) * Math.max(0, Number(state.settings.taxRate) || 0) / 100;
  const customer = state.customers.find((item) => item.id === $('#saleCustomer').value);
  const items = cart.map((line) => ({ ...line }));
  for (const line of items) { const product = state.products.find((item) => item.id === line.id); if (product?.trackStock && line.quantity > Number(product.stock)) return notify(`Insufficient stock for ${product.name}.`, 'error'); }
  pendingSale = { receipt: `R-${Date.now().toString().slice(-8)}`, createdAt: new Date().toISOString(), customerName: customer?.name || '', payment: $('#paymentMethod').value, subtotal, discount, tax, total: subtotal - discount + tax, items };
  $('#receiptPreviewContent').innerHTML = receiptMarkup(pendingSale); $('#receiptPreview').hidden = false; $('#printReceiptButton').focus();
}
function loadSettingsForm() {
  const form = $('#settingsForm');
  for (const key of ['businessName', 'businessType', 'currency', 'taxRate', 'receiptFooter']) if (form.elements[key]) form.elements[key].value = state.settings[key] ?? '';
}
function seedDemoData() {
  let changed = false;
  if (!state.settings.demoGlassesSeeded) {
    const styles = ['Classic', 'Aviator', 'Wayfarer', 'Round', 'Square', 'Sport', 'Cat-eye', 'Rimless', 'Clubmaster', 'Oversized'];
    const colors = ['Black', 'Tortoise', 'Silver', 'Gold', 'Blue', 'Clear', 'Brown', 'Rose'];
    for (let i = 0; i < 100; i += 1) {
      const n = i + 1; const barcode = `890700${String(n).padStart(6, '0')}`;
      state.products.push({ id: `demo-glasses-${String(n).padStart(3, '0')}`, name: `${styles[i % styles.length]} ${colors[Math.floor(i / styles.length) % colors.length]} Glasses ${String(n).padStart(3, '0')}`, sku: barcode, barcode, category: i % 4 === 0 ? 'Sunglasses' : 'Eyeglasses', unit: 'each', price: 1500 + (i % 20) * 250, cost: 900 + (i % 15) * 120, trackStock: true, stock: 10 + (i % 31), reorderLevel: 3, active: true, demo: true });
    }
    state.settings.demoGlassesSeeded = true; changed = true;
  }
  if (!state.settings.demoCustomersSeeded) {
    const names = ['Ahmed Khan', 'Ayesha Malik', 'Hassan Ali', 'Fatima Noor', 'Usman Tariq', 'Zainab Raza', 'Bilal Sheikh', 'Sara Ahmed', 'Hamza Javed', 'Mariam Hussain', 'Ali Raza', 'Iqra Shah', 'Omar Farooq', 'Hira Iqbal', 'Daniyal Akhtar'];
    names.forEach((name, i) => {
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
      state.customers.push({ id: `demo-customer-${String(i + 1).padStart(2, '0')}`, name, phone: `0300${String(1000000 + i).slice(-7)}`, email: `${slug}@example.com`, demo: true });
    });
    state.settings.demoCustomersSeeded = true; changed = true;
  }
  return changed;
}
function bindEvents() {
  $('#navigation').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
  document.body.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]'); if (go) showView(go.dataset.go);
    const add = e.target.closest('[data-add]'); if (add) addToCart(add.dataset.add);
    const qty = e.target.closest('[data-qty]');
    if (qty) { const line = cart.find((x) => x.id === qty.dataset.id); if (!line) return; const product = state.products.find((x) => x.id === line.id); const next = line.quantity + Number(qty.dataset.qty); if (next > 0 && product?.trackStock && next > Number(product.stock)) return notify(`Only ${number(product.stock)} in stock.`, 'error'); if (next <= 0) cart = cart.filter((x) => x !== line); else line.quantity = next; renderCart(); }
    const remove = e.target.closest('[data-remove]'); if (remove) { cart = cart.filter((x) => x.id !== remove.dataset.remove); renderCart(); }
    const delProduct = e.target.closest('[data-delete-product]'); if (delProduct) { const id = delProduct.dataset.deleteProduct; state.products = state.products.filter((x) => x.id !== id); cart = cart.filter((x) => x.id !== id); persist().then(refresh); }
    const delCustomer = e.target.closest('[data-delete-customer]'); if (delCustomer) { state.customers = state.customers.filter((x) => x.id !== delCustomer.dataset.deleteCustomer); persist().then(refresh); }
    const stock = e.target.closest('[data-stock]');
    if (stock) { const p = state.products.find((x) => x.id === stock.dataset.stock); const input = document.querySelector(`[data-stock-value="${CSS.escape(stock.dataset.stock)}"]`); const amount = Number(input?.value); if (!p || !Number.isFinite(amount) || amount <= 0) return notify('Enter a stock quantity greater than zero.', 'error'); p.stock = Math.max(0, Number(p.stock) + amount * Number(stock.dataset.delta)); persist().then(refresh); }
  });
  $('#topNewSale').addEventListener('click', () => showView('sales'));
  $('#productSearch').addEventListener('input', renderCatalog);
  $('#productSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); scanIntoSale(); } });
  $('#categoryFilter').addEventListener('change', renderCatalog);
  $('#discountInput').addEventListener('input', renderCart);
  $('#clearCart').addEventListener('click', () => { cart = []; $('#discountInput').value = '0'; renderCart(); });
  $('#completeSale').addEventListener('click', completeSale);
  $('#closeReceiptPreview').addEventListener('click', dismissReceipt);
  $('#cancelReceipt').addEventListener('click', dismissReceipt);
  $('#printReceiptButton').addEventListener('click', printPendingSale);
  $('#receiptPreview').addEventListener('click', (e) => { if (e.target.id === 'receiptPreview') dismissReceipt(); });

  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
    const price = Number(data.get('price')); const cost = Number(data.get('cost') || 0); const trackStock = form.elements.trackStock.checked; const sku = String(data.get('sku') || '').trim();
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0) return notify('Enter valid non-negative prices.', 'error');
    if (sku && state.products.some((p) => [p.sku, p.barcode].some((code) => String(code || '').toLowerCase() === sku.toLowerCase()))) return notify('That barcode/SKU already belongs to another item.', 'error');
    state.products.push({ id: uid(), name: data.get('name').trim(), sku, barcode: sku, category: data.get('category').trim(), unit: data.get('unit').trim() || 'each', price, cost, trackStock, stock: trackStock ? Number(data.get('stock') || 0) : 0, reorderLevel: Number(data.get('reorderLevel') || 0), active: true });
    form.reset(); form.elements.unit.value = 'each'; form.elements.cost.value = '0'; form.elements.reorderLevel.value = '5'; form.elements.trackStock.checked = true;
    if (await persist()) { refresh(); notify('Catalog entry added.'); }
  });
  $('#customerForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form); const name = String(data.get('name') || '').trim(); const phone = String(data.get('phone') || '').trim(); const email = String(data.get('email') || '').trim();
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2 || !/^[A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,79}$/.test(name)) return notify('Enter a valid customer name (2–80 letters, spaces, apostrophes, dots, or hyphens).', 'error');
    if (digits.length < 7 || digits.length > 15) return notify('Phone number must contain 7 to 15 digits.', 'error');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return notify('Enter a valid email address, for example name@gmail.com.', 'error');
    if (state.customers.some((c) => c.email?.toLowerCase() === email.toLowerCase())) return notify('A customer with this email already exists.', 'error');
    state.customers.push({ id: uid(), name, phone, email }); form.reset();
    if (await persist()) { refresh(); notify('Customer added.'); }
  });
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    const next = { ...state.settings, businessName: d.get('businessName').trim(), businessType: d.get('businessType'), currency: d.get('currency').trim().toUpperCase(), taxRate: Number(d.get('taxRate') || 0), receiptFooter: d.get('receiptFooter').trim() };
    if (!/^[A-Z]{3}$/.test(next.currency)) return notify('Currency must be a three-letter code, such as PKR or USD.', 'error');
    state.settings = next;
    if (await persist()) { refresh(); loadSettingsForm(); notify('Business settings saved.'); }
  });
  $('#exportButton').addEventListener('click', async () => { try { if (await window.posAPI.export({ exportedAt: new Date().toISOString(), ...state })) notify('Data export saved.'); } catch (error) { notify(`Export failed: ${error.message}`, 'error'); } });
}
async function init() {
  ensureControls();
  try {
    const saved = await window.posAPI.load();
    if (saved && typeof saved === 'object') state = { ...structuredClone(DEFAULT_STATE), ...saved, settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) }, products: Array.isArray(saved.products) ? saved.products : [], customers: Array.isArray(saved.customers) ? saved.customers : [], sales: Array.isArray(saved.sales) ? saved.sales : [] };
  } catch (error) { notify(`Could not load saved data: ${error.message}`, 'error'); }
  bindEvents();
  refresh();
  loadSettingsForm();
  if (seedDemoData() && await persist()) { refresh(); notify('Added sample glasses and test customers.'); }
}
init();
