const DEFAULT_STATE = {
  settings: { businessName: 'My Business', businessType: 'General retail', currency: 'PKR', taxRate: 0, receiptFooter: 'Thank you for your business' },
  products: [], customers: [], sales: []
};
let state = structuredClone(DEFAULT_STATE);
let cart = [];
let noticeTimer;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency || 'PKR' }).format(Number(value) || 0);
const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value) || 0);
const today = () => new Date().toLocaleDateString();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function notify(message, type = 'success') {
  const box = $('#notice');
  box.textContent = message;
  box.className = `notice show ${type}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { box.className = 'notice'; }, 3500);
}

async function persist() {
  try {
    await window.posAPI.save(state);
    return true;
  } catch (error) {
    notify(`Could not save data: ${error.message}`, 'error');
    return false;
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === name));
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  const labels = { dashboard: 'Overview', sales: 'Point of sale', products: 'Products & services', inventory: 'Inventory', customers: 'Customers', history: 'Sales history', settings: 'Business settings' };
  $('#pageTitle').textContent = labels[name] || 'Overview';
  if (name === 'sales') renderCatalog();
}

function businessInfo() {
  $('#businessLabel').textContent = state.settings.businessType;
  $('#businessTypeHeading').textContent = `${state.settings.businessType.toUpperCase()} OVERVIEW`;
  $('#todayLabel').textContent = today();
}

function refresh() {
  businessInfo(); renderDashboard(); renderProducts(); renderInventory(); renderCustomers(); renderSalesHistory(); renderCustomerOptions(); renderCategories(); renderCart();
}

function renderDashboard() {
  const day = new Date().toISOString().slice(0, 10);
  const todays = state.sales.filter((sale) => sale.createdAt.slice(0, 10) === day);
  const revenue = todays.reduce((sum, sale) => sum + sale.total, 0);
  $('#metricRevenue').textContent = money(revenue);
  $('#metricOrders').textContent = String(todays.length);
  $('#metricProducts').textContent = String(state.products.filter((item) => item.active !== false).length);
  const low = state.products.filter((item) => item.trackStock && Number(item.stock) <= Number(item.reorderLevel));
  $('#metricLowStock').textContent = String(low.length);
  $('#recentSales').innerHTML = state.sales.length ? state.sales.slice(0, 6).map((sale) => `<div class="row"><div class="row-main"><b>Receipt ${esc(sale.receipt)}</b><small>${esc(new Date(sale.createdAt).toLocaleString())} · ${esc(sale.payment)}</small></div><span class="row-end">${money(sale.total)}</span></div>`).join('') : '<div class="empty">No sales yet. Start a transaction from Point of sale.</div>';
  $('#lowStockList').innerHTML = low.length ? low.slice(0, 6).map((item) => `<div class="row"><div class="row-main"><b>${esc(item.name)}</b><small>Reorder level ${number(item.reorderLevel)} ${esc(item.unit)}</small></div><span class="badge low">${number(item.stock)} left</span></div>`).join('') : '<div class="empty">No low-stock items. Inventory reminders appear here.</div>';
}

function renderCategories() {
  const select = $('#categoryFilter');
  const current = select.value;
  const categories = [...new Set(state.products.map((item) => item.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All categories</option>' + categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
  if (categories.includes(current)) select.value = current;
}

function renderCatalog() {
  const query = $('#productSearch').value.trim().toLowerCase();
  const category = $('#categoryFilter').value;
  const products = state.products.filter((item) => item.active !== false && (!category || item.category === category) && (!query || `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query)));
  $('#catalog').innerHTML = products.length ? products.map((item) => `<button class="catalog-item" data-add="${esc(item.id)}"><b>${esc(item.name)}</b><small>${esc(item.category || 'Uncategorized')} · ${esc(item.unit || 'each')}${item.trackStock ? ` · ${number(item.stock)} available` : ''}</small><strong>${money(item.price)}</strong></button>`).join('') : '<div class="empty">No matching catalog items. Add products or services in the catalog.</div>';
}

function renderCart() {
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  $('#cartCount').textContent = count ? `${number(count)} item${count === 1 ? '' : 's'}` : 'No items yet';
  $('#cartLines').innerHTML = cart.length ? cart.map((line) => `<div class="cart-line"><div><div class="cart-name">${esc(line.name)}</div><div class="cart-meta">${money(line.price)} · ${esc(line.unit)}</div></div><div class="quantity"><button data-qty="-1" data-id="${esc(line.id)}" aria-label="Decrease">−</button><b>${number(line.quantity)}</b><button data-qty="1" data-id="${esc(line.id)}" aria-label="Increase">+</button><button class="icon-button" data-remove="${esc(line.id)}" aria-label="Remove">×</button></div></div>`).join('') : '<div class="empty">Choose a catalog item to add it to this sale.</div>';
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('#discountInput').value) || 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * Math.max(0, Number(state.settings.taxRate) || 0) / 100;
  $('#subtotal').textContent = money(subtotal);
  $('#taxTotal').textContent = money(tax);
  $('#grandTotal').textContent = money(taxable + tax);
  $('#discountCurrency').textContent = state.settings.currency;
}

function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const line = cart.find((item) => item.id === id);
  const next = (line?.quantity || 0) + 1;
  if (product.trackStock && next > Number(product.stock)) return notify(`Only ${number(product.stock)} ${product.unit} in stock.`, 'error');
  if (line) line.quantity = next;
  else cart.push({ id, name: product.name, price: Number(product.price), unit: product.unit || 'each', quantity: 1 });
  renderCart();
}

function renderProducts() {
  $('#productsTable').innerHTML = state.products.length ? state.products.map((item) => `<tr><td><b>${esc(item.name)}</b><br><span class="muted">${esc(item.unit || 'each')}</span></td><td>${esc(item.category || '—')}</td><td>${esc(item.sku || '—')}</td><td>${money(item.price)}</td><td>${item.trackStock ? number(item.stock) : 'Not tracked'}</td><td><button class="button quiet" data-delete-product="${esc(item.id)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Catalog is empty. Add your first product or service above.</td></tr>';
}

function renderInventory() {
  const items = state.products.filter((item) => item.trackStock);
  $('#inventoryTable').innerHTML = items.length ? items.map((item) => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.category || '—')}</td><td>${number(item.stock)} ${esc(item.unit)}</td><td>${number(item.reorderLevel)}</td><td><span class="badge ${Number(item.stock) <= Number(item.reorderLevel) ? 'low' : 'ok'}">${Number(item.stock) <= Number(item.reorderLevel) ? 'Reorder' : 'In stock'}</span></td><td><div class="stock-adjust"><input type="number" step="0.001" min="0" placeholder="Qty" data-stock-value="${esc(item.id)}"><button data-stock="${esc(item.id)}" data-delta="1">Add</button><button data-stock="${esc(item.id)}" data-delta="-1">Remove</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No products are currently tracked for stock.</td></tr>';
}

function renderCustomers() {
  $('#customersList').innerHTML = state.customers.length ? state.customers.map((customer) => `<div class="row"><div class="row-main"><b>${esc(customer.name)}</b><small>${esc(customer.phone || 'No phone')} · ${esc(customer.email || 'No email')}</small></div><button class="button quiet" data-delete-customer="${esc(customer.id)}">Remove</button></div>`).join('') : '<div class="empty">No saved customers. Walk-in sales do not require a customer record.</div>';
}

function renderCustomerOptions() {
  const select = $('#saleCustomer');
  const current = select.value;
  select.innerHTML = '<option value="">Walk-in customer</option>' + state.customers.map((customer) => `<option value="${esc(customer.id)}">${esc(customer.name)}</option>`).join('');
  if (state.customers.some((customer) => customer.id === current)) select.value = current;
}

function renderSalesHistory() {
  $('#salesTable').innerHTML = state.sales.length ? state.sales.map((sale) => `<tr><td>${esc(sale.receipt)}</td><td>${esc(new Date(sale.createdAt).toLocaleString())}</td><td>${esc(sale.customerName || 'Walk-in')}</td><td>${esc(sale.payment)}</td><td>${number(sale.items.reduce((sum, item) => sum + item.quantity, 0))}</td><td><b>${money(sale.total)}</b></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No completed sales yet.</td></tr>';
}

async function completeSale() {
  if (!cart.length) {
    return notify('Add at least one item before completing a sale.', 'error');
  }

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, Number($('#discountInput').value) || 0));
  const tax = (subtotal - discount) * Math.max(0, Number(state.settings.taxRate) || 0) / 100;
  const customer = state.customers.find((item) => item.id === $('#saleCustomer').value);

  for (const line of cart) {
    const product = state.products.find((item) => item.id === line.id);
    if (product?.trackStock && line.quantity > Number(product.stock)) {
      return notify(`Insufficient stock for ${product.name}.`, 'error');
    }
  }

  const sale = {
    receipt: `R-${Date.now().toString().slice(-8)}`,
    createdAt: new Date().toISOString(),
    customerName: customer?.name || '',
    payment: $('#paymentMethod').value,
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax,
    items: cart.map((line) => ({ ...line }))
  };

  $('#completeSale').disabled = true;

  try {
    const printed = await window.posAPI.printReceipt(sale, state.settings);
    if (!printed) {
      notify('Printing was cancelled or failed. Sale was not recorded.', 'error');
      return;
    }

    const originalStocks = new Map(state.products.map((product) => [product.id, product.stock]));

    for (const line of cart) {
      const product = state.products.find((item) => item.id === line.id);
      if (product?.trackStock) {
        product.stock = Number(product.stock) - line.quantity;
      }
    }

    state.sales.unshift(sale);
    const saved = await persist();
    if (!saved) {
      state.sales = state.sales.filter((item) => item.receipt !== sale.receipt);
      for (const product of state.products) product.stock = originalStocks.get(product.id);
      return;
    }

    cart = [];
    $('#discountInput').value = '0';
    $('#saleCustomer').value = '';
    refresh();
    notify(`Bill printed and sale ${sale.receipt} recorded.`);
  } catch (error) {
    notify(`Printing failed; sale was not recorded: ${error.message}`, 'error');
  } finally {
    $('#completeSale').disabled = false;
  }
}

function loadSettingsForm() {
  const form = $('#settingsForm');
  for (const key of ['businessName', 'businessType', 'currency', 'taxRate', 'receiptFooter']) form.elements[key].value = state.settings[key] ?? '';
}

function bindEvents() {
  $('#navigation').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) showView(button.dataset.view);
  });

  document.body.addEventListener('click', (event) => {
    const goto = event.target.closest('[data-go]');
    if (goto) showView(goto.dataset.go);

    const add = event.target.closest('[data-add]');
    if (add) addToCart(add.dataset.add);

    const qty = event.target.closest('[data-qty]');
    if (qty) {
      const line = cart.find((item) => item.id === qty.dataset.id);
      if (!line) return;
      const product = state.products.find((item) => item.id === line.id);
      const next = line.quantity + Number(qty.dataset.qty);
      if (next > 0 && product?.trackStock && next > Number(product.stock)) return notify(`Only ${number(product.stock)} in stock.`, 'error');
      if (next <= 0) cart = cart.filter((item) => item !== line);
      else line.quantity = next;
      renderCart();
    }

    const remove = event.target.closest('[data-remove]');
    if (remove) { cart = cart.filter((item) => item.id !== remove.dataset.remove); renderCart(); }

    const delProduct = event.target.closest('[data-delete-product]');
    if (delProduct) { const id = delProduct.dataset.deleteProduct; state.products = state.products.filter((item) => item.id !== id); cart = cart.filter((item) => item.id !== id); persist().then(refresh); }

    const delCustomer = event.target.closest('[data-delete-customer]');
    if (delCustomer) { state.customers = state.customers.filter((item) => item.id !== delCustomer.dataset.deleteCustomer); persist().then(refresh); }

    const stock = event.target.closest('[data-stock]');
    if (stock) {
      const item = state.products.find((product) => product.id === stock.dataset.stock);
      const input = document.querySelector(`[data-stock-value="${CSS.escape(stock.dataset.stock)}"]`);
      const amount = Number(input.value);
      if (!item || !Number.isFinite(amount) || amount <= 0) return notify('Enter a stock quantity greater than zero.', 'error');
      item.stock = Math.max(0, Number(item.stock) + amount * Number(stock.dataset.delta));
      persist().then(refresh);
    }
  });

  $('#topNewSale').addEventListener('click', () => showView('sales'));
  $('#productSearch').addEventListener('input', renderCatalog);
  $('#categoryFilter').addEventListener('change', renderCatalog);
  $('#discountInput').addEventListener('input', renderCart);
  $('#clearCart').addEventListener('click', () => { cart = []; $('#discountInput').value = '0'; renderCart(); });
  $('#completeSale').addEventListener('click', completeSale);

  $('#productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const price = Number(data.get('price'));
    const cost = Number(data.get('cost') || 0);
    const trackStock = form.elements.trackStock.checked;
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0) return notify('Enter valid non-negative prices.', 'error');

    state.products.push({
      id: uid(),
      name: data.get('name').trim(),
      sku: data.get('sku').trim(),
      category: data.get('category').trim(),
      unit: data.get('unit').trim() || 'each',
      price,
      cost,
      trackStock,
      stock: trackStock ? Number(data.get('stock') || 0) : 0,
      reorderLevel: Number(data.get('reorderLevel') || 0),
      active: true
    });

    form.reset();
    form.elements.unit.value = 'each';
    form.elements.cost.value = '0';
    form.elements.reorderLevel.value = '5';
    form.elements.trackStock.checked = true;

    await persist();
    refresh();
    notify('Catalog entry added.');
  });

  $('#customerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.customers.push({
      id: uid(),
      name: data.get('name').trim(),
      phone: data.get('phone').trim(),
      email: data.get('email').trim()
    });

    event.currentTarget.reset();
    await persist();
    refresh();
    notify('Customer added.');
  });

  $('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.settings = {
      businessName: data.get('businessName').trim(),
      businessType: data.get('businessType'),
      currency: data.get('currency').trim().toUpperCase(),
      taxRate: Number(data.get('taxRate') || 0),
      receiptFooter: data.get('receiptFooter').trim()
    };

    if (!/^[A-Z]{3}$/.test(state.settings.currency)) {
      return notify('Currency must be a three-letter code, such as PKR or USD.', 'error');
    }

    await persist();
    refresh();
    renderCart();
    notify('Business settings saved.');
  });

  $('#exportButton').addEventListener('click', async () => {
    try {
      const success = await window.posAPI.export({ exportedAt: new Date().toISOString(), ...state });
      if (success) notify('Data export saved.');
    } catch (error) {
      notify(`Export failed: ${error.message}`, 'error');
    }
  });
}

async function init() {
  try {
    const saved = await window.posAPI.load();
    if (saved && typeof saved === 'object') {
      state = {
        ...structuredClone(DEFAULT_STATE),
        ...saved,
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        products: Array.isArray(saved.products) ? saved.products : [],
        customers: Array.isArray(saved.customers) ? saved.customers : [],
        sales: Array.isArray(saved.sales) ? saved.sales : []
      };
    }
  } catch (error) {
    notify(`Could not load saved data: ${error.message}`, 'error');
  }

  bindEvents();
  refresh();
  loadSettingsForm();
}

init();
