/* ═══════════════════════════════════════════════════
   FacturaPro — script.js
   Full billing system logic
════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────── */
let state = {
  company: {
    name: 'Mi Empresa S.A.',
    rnc: '',
    address: 'Santo Domingo, D.N.',
    phone: '',
    email: '',
    website: '',
    logo: '',           // base64
    brandColor: '#6366F1',
    headerTextColor: '#FFFFFF',
    prefix: 'FAC',
    footerMessage: 'Gracias por su preferencia.',
  },
  invoices: [],
  nextNumber: 1,
  currentItems: [],
  editingId: null,
};

/* ─────────────────────────────────────────────────
   PERSISTENCE (localStorage)
───────────────────────────────────────────────── */
function saveState() {
  try { localStorage.setItem('facturapro_state', JSON.stringify(state)); } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('facturapro_state');
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) {}
}

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */
function fmt(amount, currency) {
  const symbols = { DOP: 'RD$', USD: '$', EUR: '€' };
  const sym = symbols[currency || el('invoiceCurrency')?.value || 'DOP'] || '$';
  return sym + Number(amount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${months[parseInt(m,10)-1]} ${y}`;
}

function padNum(n) { return String(n).padStart(5, '0'); }

function el(id) { return document.getElementById(id); }

function initials(name) {
  return (name || 'FP').split(' ').slice(0,2).map(w => w[0]?.toUpperCase()).join('');
}

/* ─────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  el('toastContainer').appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => t.remove(), 260);
  }, 3200);
}

/* ─────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────── */
let currentView = 'dashboard';

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = el(`view-${name}`);
  if (view) view.classList.add('active');
  document.querySelectorAll(`[data-view="${name}"]`).forEach(b => b.classList.add('active'));
  currentView = name;
  const titles = { dashboard: 'Dashboard', create: 'Nueva Factura', history: 'Historial de Facturas', settings: 'Configuración' };
  el('topbarTitle').textContent = titles[name] || name;
  closeSidebar();

  if (name === 'dashboard') renderDashboard();
  if (name === 'history') renderHistory();
  if (name === 'settings') loadSettingsForm();
  if (name === 'create' && !state.editingId) resetForm();
}

/* ─────────────────────────────────────────────────
   SIDEBAR TOGGLE
───────────────────────────────────────────────── */
function openSidebar() {
  el('sidebar').classList.add('open');
  el('overlay').classList.add('active');
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('overlay').classList.remove('active');
}

/* ─────────────────────────────────────────────────
   BRAND COLOR → CSS var
───────────────────────────────────────────────── */
function applyBrandColor(color, textColor) {
  document.documentElement.style.setProperty('--brand', color || '#6366F1');
  const dark = adjustColor(color || '#6366F1', -20);
  document.documentElement.style.setProperty('--brand-dark', dark);
  document.documentElement.style.setProperty('--brand-light', hexToLight(color || '#6366F1'));
}

function adjustColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function hexToLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff);
  const g = ((n >> 8) & 0xff);
  const b = (n & 0xff);
  return `rgba(${r},${g},${b},0.1)`;
}

/* ─────────────────────────────────────────────────
   INVOICE TEMPLATE
───────────────────────────────────────────────── */
function buildInvoiceHTML(inv, compact = false) {
  const co = inv.company || state.company;
  const items = inv.items || [];
  const tax = inv.taxRate || 0;
  const disc = inv.discountRate || 0;
  const currency = inv.currency || 'DOP';

  const subtotal = items.reduce((s, it) => s + (it.qty * it.price), 0);
  const discountAmt = subtotal * (disc / 100);
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * (tax / 100);
  const total = taxable + taxAmt;

  const logoHTML = co.logo
    ? `<img class="inv-logo-img" src="${co.logo}" alt="${co.name}" />`
    : `<div class="inv-logo-placeholder">${initials(co.name)}</div>`;

  const itemRows = items.map(it => {
    const lineTotal = it.qty * it.price;
    return `
      <tr>
        <td>${it.desc || '—'}</td>
        <td style="text-align:right">${fmt(it.price, currency)}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right;font-weight:600">${fmt(lineTotal, currency)}</td>
      </tr>`;
  }).join('');

  const notesHTML = inv.notes
    ? `<div class="inv-notes"><strong>Notas:</strong> ${inv.notes}</div>`
    : `<div class="inv-notes">${co.footerMessage || ''}</div>`;

  return `
<div class="inv-root">
  <div class="inv-header" style="background:${co.brandColor};color:${co.headerTextColor}">
    <div class="inv-logo-area">
      ${logoHTML}
      <div>
        <div class="inv-company-name">${co.name || 'Mi Empresa'}</div>
        <div class="inv-company-sub">
          ${co.rnc ? `RNC: ${co.rnc}<br>` : ''}
          ${co.address || ''}<br>
          ${co.phone || ''}${co.phone && co.email ? ' · ' : ''}${co.email || ''}
        </div>
      </div>
    </div>
    <div class="inv-title-block">
      <div class="inv-title">FACTURA</div>
      <div class="inv-meta">
        N° <strong>${inv.number}</strong><br>
        Fecha: ${fmtDate(inv.date)}<br>
        ${inv.due ? `Vence: ${fmtDate(inv.due)}` : ''}
      </div>
    </div>
  </div>

  <div class="inv-body">
    <div class="inv-two-col">
      <div>
        <div class="inv-client-label">Facturado a</div>
        <div class="inv-client-name">${inv.clientName || '—'}</div>
        <div class="inv-client-info">
          ${inv.clientRNC ? `RNC: ${inv.clientRNC}<br>` : ''}
          ${inv.clientEmail ? `${inv.clientEmail}<br>` : ''}
          ${inv.clientPhone ? `${inv.clientPhone}<br>` : ''}
          ${inv.clientAddress || ''}
        </div>
      </div>
      <div class="inv-details-right">
        <div class="inv-client-label">Detalles</div>
        <div class="inv-detail-row"><span>Moneda:</span><strong>${currency}</strong></div>
        ${co.website ? `<div class="inv-detail-row"><span>Web:</span><strong>${co.website}</strong></div>` : ''}
      </div>
    </div>

    <div class="inv-table-wrap">
      <table class="inv-table" style="--brand:${co.brandColor}">
        <thead>
          <tr>
            <th>Descripción</th>
            <th style="text-align:right">Precio Unit.</th>
            <th style="text-align:right">Cant.</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="4" style="text-align:center;color:#94A3B8;padding:20px">Sin ítems</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="inv-totals">
      <div class="inv-total-row"><span>Subtotal:</span><span>${fmt(subtotal, currency)}</span></div>
      ${disc > 0 ? `<div class="inv-total-row discount"><span>Descuento (${disc}%):</span><span>-${fmt(discountAmt, currency)}</span></div>` : ''}
      ${tax > 0 ? `<div class="inv-total-row"><span>ITBIS (${tax}%):</span><span>${fmt(taxAmt, currency)}</span></div>` : ''}
      <div class="inv-grand-total" style="background:${co.brandColor};color:${co.headerTextColor}">
        <span class="label">TOTAL</span>
        <span class="amount">${fmt(total, currency)}</span>
      </div>
    </div>
  </div>

  <div class="inv-footer">
    ${notesHTML}
    <div class="inv-footer-brand">FacturaPro</div>
  </div>
</div>`;
}

/* ─────────────────────────────────────────────────
   ITEMS
───────────────────────────────────────────────── */
function addItem(desc = '', price = '', qty = 1) {
  const id = Date.now();
  state.currentItems.push({ id, desc, price: parseFloat(price) || 0, qty: parseInt(qty) || 1 });
  renderItems();
  updatePreview();
}

function removeItem(id) {
  state.currentItems = state.currentItems.filter(it => it.id !== id);
  renderItems();
  updatePreview();
}

function renderItems() {
  const list = el('itemsList');
  list.innerHTML = '';
  state.currentItems.forEach(it => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <input type="text" class="form-input" placeholder="Descripción del servicio o producto" value="${it.desc}" data-field="desc" data-id="${it.id}" />
      <input type="number" class="form-input" placeholder="0.00" value="${it.price || ''}" min="0" step="0.01" data-field="price" data-id="${it.id}" />
      <input type="number" class="form-input" value="${it.qty}" min="1" data-field="qty" data-id="${it.id}" />
      <div class="item-total-display" id="itTotal_${it.id}">${fmt(it.qty * it.price)}</div>
      <button class="btn-icon danger" data-remove="${it.id}" title="Eliminar ítem">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/></svg>
      </button>`;

    row.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const item = state.currentItems.find(i => i.id === it.id);
        if (!item) return;
        const field = inp.dataset.field;
        if (field === 'desc') item.desc = inp.value;
        if (field === 'price') item.price = parseFloat(inp.value) || 0;
        if (field === 'qty') item.qty = parseInt(inp.value) || 1;
        const totalEl = el(`itTotal_${it.id}`);
        if (totalEl) totalEl.textContent = fmt(item.qty * item.price);
        updatePreview();
      });
    });

    row.querySelector('[data-remove]').addEventListener('click', () => removeItem(it.id));
    list.appendChild(row);
  });

  if (state.currentItems.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:.85rem">Sin ítems. Haz clic en "Agregar ítem" para empezar.</div>`;
  }
}

/* ─────────────────────────────────────────────────
   LIVE PREVIEW
───────────────────────────────────────────────── */
function gatherFormData() {
  return {
    number: `${state.company.prefix}-${padNum(state.nextNumber)}`,
    date: el('invoiceDate')?.value || today(),
    due: el('invoiceDue')?.value || '',
    currency: el('invoiceCurrency')?.value || 'DOP',
    clientName: el('clientName')?.value || '',
    clientRNC: el('clientRNC')?.value || '',
    clientEmail: el('clientEmail')?.value || '',
    clientPhone: el('clientPhone')?.value || '',
    clientAddress: el('clientAddress')?.value || '',
    taxRate: parseFloat(el('taxRate')?.value) || 0,
    discountRate: parseFloat(el('discountRate')?.value) || 0,
    notes: el('invoiceNotes')?.value || '',
    items: state.currentItems,
    company: { ...state.company },
  };
}

function updatePreview() {
  const inv = gatherFormData();
  const preview = el('invoicePreviewSmall');
  if (preview) preview.innerHTML = buildInvoiceHTML(inv, true);
  // Apply brand color to inv-table thead dynamically
  preview?.querySelectorAll('.inv-table thead th').forEach(th => {
    th.style.background = state.company.brandColor;
    th.style.color = state.company.headerTextColor;
  });
}

/* ─────────────────────────────────────────────────
   FORM RESET
───────────────────────────────────────────────── */
function resetForm() {
  state.editingId = null;
  state.currentItems = [];
  if (el('invoiceNumber')) el('invoiceNumber').value = `${state.company.prefix}-${padNum(state.nextNumber)}`;
  if (el('invoiceDate')) el('invoiceDate').value = today();
  if (el('invoiceDue')) el('invoiceDue').value = addDays(today(), 30);
  if (el('invoiceCurrency')) el('invoiceCurrency').value = 'DOP';
  ['clientName','clientRNC','clientEmail','clientPhone','clientAddress','invoiceNotes'].forEach(id => {
    if (el(id)) el(id).value = '';
  });
  if (el('taxRate')) el('taxRate').value = '18';
  if (el('discountRate')) el('discountRate').value = '0';
  renderItems();
  addItem(); // start with one empty row
  updatePreview();
  clearValidationErrors();
}

function clearValidationErrors() {
  document.querySelectorAll('.is-invalid').forEach(e => e.classList.remove('is-invalid'));
  document.querySelectorAll('.field-error').forEach(e => e.remove());
}

/* ─────────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────────── */
function validateForm() {
  clearValidationErrors();
  let valid = true;
  const required = [
    { id: 'clientName', msg: 'El nombre del cliente es requerido.' },
  ];

  required.forEach(({ id, msg }) => {
    const input = el(id);
    if (!input || !input.value.trim()) {
      if (input) {
        input.classList.add('is-invalid');
        const err = document.createElement('div');
        err.className = 'field-error';
        err.textContent = msg;
        input.parentNode.insertBefore(err, input.nextSibling);
      }
      valid = false;
    }
  });

  if (state.currentItems.length === 0 || state.currentItems.every(i => !i.desc && !i.price)) {
    toast('Agrega al menos un producto o servicio con descripción.', 'error');
    valid = false;
  }

  return valid;
}

/* ─────────────────────────────────────────────────
   SAVE INVOICE
───────────────────────────────────────────────── */
function saveInvoice() {
  if (!validateForm()) return;

  const data = gatherFormData();
  const subtotal = data.items.reduce((s, it) => s + it.qty * it.price, 0);
  const discAmt = subtotal * (data.discountRate / 100);
  const taxAmt = (subtotal - discAmt) * (data.taxRate / 100);
  data.total = subtotal - discAmt + taxAmt;
  data.subtotal = subtotal;
  data.id = state.editingId || Date.now();
  data.createdAt = new Date().toISOString();

  if (state.editingId) {
    const idx = state.invoices.findIndex(i => i.id === state.editingId);
    if (idx > -1) state.invoices[idx] = data;
  } else {
    state.invoices.unshift(data);
    state.nextNumber++;
  }

  saveState();
  toast(state.editingId ? 'Factura actualizada.' : 'Factura guardada correctamente.', 'success');
  state.editingId = null;
  resetForm();
  showView('history');
}

/* ─────────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────────── */
function renderDashboard() {
  const total = state.invoices.length;
  const amount = state.invoices.reduce((s, i) => s + (i.total || 0), 0);
  const clients = new Set(state.invoices.map(i => i.clientName?.toLowerCase())).size;
  const thisMonth = state.invoices.filter(i => i.date?.slice(0,7) === today().slice(0,7)).length;

  el('statTotal').textContent = total;
  el('statAmount').textContent = fmt(amount);
  el('statClients').textContent = clients;
  el('statMonth').textContent = thisMonth;

  const tbody = el('recentTableBody');
  const recent = state.invoices.slice(0, 5);

  if (!recent.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>No hay facturas aún.<br>¡Crea tu primera factura!</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(inv => `
    <tr>
      <td><span class="invoice-badge badge-num">${inv.number}</span></td>
      <td>${inv.clientName || '—'}</td>
      <td>${fmtDate(inv.date)}</td>
      <td><strong>${fmt(inv.total || 0, inv.currency)}</strong></td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Ver" onclick="openPreviewModal('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-icon" title="Descargar PDF" onclick="downloadPDF('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

/* ─────────────────────────────────────────────────
   HISTORY
───────────────────────────────────────────────── */
function renderHistory(filter = '') {
  const tbody = el('historyTableBody');
  let list = state.invoices;
  if (filter) {
    const f = filter.toLowerCase();
    list = list.filter(i => i.clientName?.toLowerCase().includes(f) || i.number?.toLowerCase().includes(f));
  }

  if (!list.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
      <p>${filter ? 'Sin resultados para la búsqueda.' : 'No hay facturas guardadas.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(inv => `
    <tr>
      <td><span class="invoice-badge badge-num">${inv.number}</span></td>
      <td>${inv.clientName || '—'}</td>
      <td>${fmtDate(inv.date)}</td>
      <td>${fmtDate(inv.due)}</td>
      <td><strong>${fmt(inv.total || 0, inv.currency)}</strong></td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Ver" onclick="openPreviewModal('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-icon" title="Editar" onclick="editInvoice('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" title="Descargar PDF" onclick="downloadPDF('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="btn-icon danger" title="Eliminar" onclick="deleteInvoice('${inv.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function deleteInvoice(id) {
  if (!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) return;
  state.invoices = state.invoices.filter(i => String(i.id) !== String(id));
  saveState();
  renderHistory();
  renderDashboard();
  toast('Factura eliminada.', 'info');
}

function editInvoice(id) {
  const inv = state.invoices.find(i => String(i.id) === String(id));
  if (!inv) return;
  state.editingId = inv.id;
  state.currentItems = inv.items.map(it => ({ ...it, id: it.id || Date.now() + Math.random() }));
  showView('create');

  setTimeout(() => {
    if (el('invoiceNumber')) el('invoiceNumber').value = inv.number;
    if (el('invoiceDate')) el('invoiceDate').value = inv.date;
    if (el('invoiceDue')) el('invoiceDue').value = inv.due || '';
    if (el('invoiceCurrency')) el('invoiceCurrency').value = inv.currency || 'DOP';
    if (el('clientName')) el('clientName').value = inv.clientName || '';
    if (el('clientRNC')) el('clientRNC').value = inv.clientRNC || '';
    if (el('clientEmail')) el('clientEmail').value = inv.clientEmail || '';
    if (el('clientPhone')) el('clientPhone').value = inv.clientPhone || '';
    if (el('clientAddress')) el('clientAddress').value = inv.clientAddress || '';
    if (el('taxRate')) el('taxRate').value = inv.taxRate ?? 18;
    if (el('discountRate')) el('discountRate').value = inv.discountRate ?? 0;
    if (el('invoiceNotes')) el('invoiceNotes').value = inv.notes || '';
    renderItems();
    updatePreview();
  }, 50);
}

/* ─────────────────────────────────────────────────
   MODAL PREVIEW
───────────────────────────────────────────────── */
let modalInvoiceId = null;

function openPreviewModal(id) {
  let inv;
  if (id === '__current__') {
    inv = gatherFormData();
  } else {
    inv = state.invoices.find(i => String(i.id) === String(id));
  }
  if (!inv) return;
  modalInvoiceId = String(id);
  el('invoiceFullPreview').innerHTML = buildInvoiceHTML(inv);
  el('invoiceFullPreview').querySelectorAll('.inv-table thead th').forEach(th => {
    th.style.background = (inv.company || state.company).brandColor;
    th.style.color = (inv.company || state.company).headerTextColor;
  });
  el('previewModal').classList.add('open');
}

function closeModal() {
  el('previewModal').classList.remove('open');
}

/* ─────────────────────────────────────────────────
   PDF DOWNLOAD
───────────────────────────────────────────────── */
async function downloadPDF(id) {
  let inv;
  if (id === '__current__') {
    inv = gatherFormData();
  } else {
    inv = state.invoices.find(i => String(i.id) === String(id));
  }
  if (!inv) return;

  // Ensure modal is open to capture
  const wasOpen = el('previewModal').classList.contains('open');
  if (!wasOpen) openPreviewModal(id);

  toast('Generando PDF…', 'info');

  const target = el('invoiceFullPreview');

  try {
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = Math.min(pageW / imgW, pageH / imgH);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, imgW * ratio, imgH * ratio);
    pdf.save(`${inv.number || 'Factura'}.pdf`);
    toast('PDF descargado correctamente.', 'success');
  } catch (e) {
    toast('Error al generar PDF. Intenta con el botón Imprimir.', 'error');
    console.error(e);
  }

  if (!wasOpen) closeModal();
}

/* ─────────────────────────────────────────────────
   SETTINGS
───────────────────────────────────────────────── */
function loadSettingsForm() {
  const co = state.company;
  el('companyName').value = co.name || '';
  el('companyRNC').value = co.rnc || '';
  el('companyAddress').value = co.address || '';
  el('companyPhone').value = co.phone || '';
  el('companyEmail').value = co.email || '';
  el('companyWebsite').value = co.website || '';
  el('invoicePrefix').value = co.prefix || 'FAC';
  el('footerMessage').value = co.footerMessage || '';
  el('brandColor').value = co.brandColor || '#6366F1';
  el('brandColorText').value = co.brandColor || '#6366F1';
  el('headerTextColor').value = co.headerTextColor || '#FFFFFF';
  el('headerTextColorText').value = co.headerTextColor || '#FFFFFF';

  if (co.logo) {
    el('logoPreviewImg').src = co.logo;
    el('logoPreviewImg').style.display = 'block';
    el('logoPlaceholder').style.display = 'none';
  }
}

function saveSettings() {
  const name = el('companyName').value.trim();
  if (!name) { toast('El nombre de la empresa es requerido.', 'error'); return; }

  state.company = {
    ...state.company,
    name,
    rnc: el('companyRNC').value.trim(),
    address: el('companyAddress').value.trim(),
    phone: el('companyPhone').value.trim(),
    email: el('companyEmail').value.trim(),
    website: el('companyWebsite').value.trim(),
    prefix: el('invoicePrefix').value.trim() || 'FAC',
    footerMessage: el('footerMessage').value.trim(),
    brandColor: el('brandColor').value,
    headerTextColor: el('headerTextColor').value,
  };

  applyBrandColor(state.company.brandColor, state.company.headerTextColor);
  updateSidebarCompany();
  saveState();
  toast('Configuración guardada.', 'success');
}

function updateSidebarCompany() {
  const co = state.company;
  el('companyMiniName').textContent = co.name || 'Mi Empresa';
  const avatar = el('companyMiniAvatar');
  if (co.logo) {
    avatar.innerHTML = `<img src="${co.logo}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />`;
  } else {
    avatar.textContent = initials(co.name);
    avatar.style.background = co.brandColor;
  }
}

/* ─────────────────────────────────────────────────
   LOGO UPLOAD
───────────────────────────────────────────────── */
function handleLogoUpload(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('El logo no debe superar 2 MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.company.logo = e.target.result;
    el('logoPreviewImg').src = e.target.result;
    el('logoPreviewImg').style.display = 'block';
    el('logoPlaceholder').style.display = 'none';
    updateSidebarCompany();
    updatePreview();
  };
  reader.readAsDataURL(file);
}

/* ─────────────────────────────────────────────────
   SHARE
───────────────────────────────────────────────── */
function shareInvoice() {
  const inv = modalInvoiceId === '__current__'
    ? gatherFormData()
    : state.invoices.find(i => String(i.id) === modalInvoiceId);

  if (!inv) return;

  const text = `Factura ${inv.number}\nCliente: ${inv.clientName}\nTotal: ${fmt(inv.total || 0, inv.currency)}\nFecha: ${fmtDate(inv.date)}`;

  if (navigator.share) {
    navigator.share({ title: `Factura ${inv.number}`, text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Información copiada al portapapeles.', 'success'));
  } else {
    toast('Tu navegador no soporta compartir.', 'info');
  }
}

/* ─────────────────────────────────────────────────
   EVENT LISTENERS
───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyBrandColor(state.company.brandColor, state.company.headerTextColor);
  updateSidebarCompany();
  showView('dashboard');

  // Nav items
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Sidebar toggle
  el('menuBtn').addEventListener('click', openSidebar);
  el('sidebarClose').addEventListener('click', closeSidebar);
  el('overlay').addEventListener('click', closeSidebar);

  // Quick create
  el('quickCreateBtn').addEventListener('click', () => {
    state.editingId = null;
    showView('create');
  });

  // Form items
  el('addItemBtn').addEventListener('click', () => addItem());

  // Live preview triggers
  ['clientName','clientRNC','clientEmail','clientPhone','clientAddress',
   'invoiceDate','invoiceDue','invoiceCurrency','taxRate','discountRate','invoiceNotes'].forEach(id => {
    el(id)?.addEventListener('input', updatePreview);
    el(id)?.addEventListener('change', updatePreview);
  });

  // Save invoice
  el('saveInvoiceBtn').addEventListener('click', saveInvoice);
  el('clearFormBtn').addEventListener('click', () => {
    if (confirm('¿Limpiar el formulario? Se perderán los datos actuales.')) {
      state.editingId = null;
      resetForm();
    }
  });

  // Preview button
  el('previewBtn').addEventListener('click', () => {
    if (!el('clientName').value.trim() && state.currentItems.length === 0) {
      toast('Completa el formulario antes de previsualizar.', 'info');
      return;
    }
    openPreviewModal('__current__');
  });

  // Modal
  el('closeModal').addEventListener('click', closeModal);
  el('previewModal').addEventListener('click', (e) => { if (e.target === el('previewModal')) closeModal(); });
  el('printBtn').addEventListener('click', () => window.print());
  el('downloadPdfBtn').addEventListener('click', () => downloadPDF(modalInvoiceId));
  el('shareBtn').addEventListener('click', shareInvoice);

  // History search
  el('historySearch').addEventListener('input', (e) => renderHistory(e.target.value));

  // Settings
  el('saveSettingsBtn').addEventListener('click', saveSettings);

  // Logo
  el('logoInput').addEventListener('change', (e) => handleLogoUpload(e.target.files[0]));
  el('logoUploadArea').addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target === el('logoInput')) return;
    el('logoInput').click();
  });

  // Color pickers sync
  el('brandColor').addEventListener('input', (e) => {
    el('brandColorText').value = e.target.value;
    applyBrandColor(e.target.value, el('headerTextColor').value);
  });
  el('brandColorText').addEventListener('input', (e) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
      el('brandColor').value = e.target.value;
      applyBrandColor(e.target.value, el('headerTextColor').value);
    }
  });
  el('headerTextColor').addEventListener('input', (e) => {
    el('headerTextColorText').value = e.target.value;
  });
  el('headerTextColorText').addEventListener('input', (e) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) el('headerTextColor').value = e.target.value;
  });

  // Swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      el('brandColor').value = color;
      el('brandColorText').value = color;
      applyBrandColor(color, el('headerTextColor').value);
    });
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});