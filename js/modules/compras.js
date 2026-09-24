let state = { compras: [], productos: [], sucursales: [], proveedores: [], detalles: [] };
let productoModal = null;

export function init() {
  bindEvents();
  cargarStats();
  cargarCatalogo();
  cargarCompras();
}

function bindEvents() {
  document.getElementById('btnNuevaCompra')?.addEventListener('click', abrirModal);
  document.getElementById('btnGuardarCompra')?.addEventListener('click', guardar);
  document.getElementById('btnAgregarDetalle')?.addEventListener('click', () => agregarDetalle());
  document.getElementById('searchCompras')?.addEventListener('input', Utils.debounce(cargarCompras, 300));
  document.getElementById('filtroSucursalCompra')?.addEventListener('change', cargarCompras);
  document.getElementById('tableComprasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('modalCompra')?.addEventListener('shown.bs.modal', () => {
    document.getElementById('cmpSucursal')?.focus();
  });
}

async function cargarStats() {
  try {
    const stats = await API.get('/recepciones/stats');
    document.getElementById('statCompras').textContent = stats.totalRecepciones || 0;
    document.getElementById('statMetros').textContent = (Math.round((stats.totalMetros || 0) * 100) / 100) + ' m';
    document.getElementById('statRollos').textContent = stats.totalRollos || 0;
    document.getElementById('statMetros30').textContent = (Math.round((stats.metros30Dias || 0) * 100) / 100) + ' m';
  } catch (err) { /* silencioso */ }
}

async function cargarCatalogo() {
  try {
    state.sucursales = await API.get('/sucursales');
    state.sucursales = state.sucursales || [];
    const selSuc = document.getElementById('cmpSucursal');
    if (selSuc) selSuc.innerHTML = state.sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
    if (state.sucursales.length === 1 && selSuc) selSuc.value = state.sucursales[0].idSucursal;

    const selFiltro = document.getElementById('filtroSucursalCompra');
    if (selFiltro) selFiltro.innerHTML = '<option value="">Todas las sucursales</option>' +
      state.sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
  } catch (err) {
    state.sucursales = [];
    Utils.showToast('Error al cargar sucursales: ' + err.message, 'error');
  }

  try {
    const res = await API.get('/proveedores?size=200');
    state.proveedores = res.content || res || [];
    const selProv = document.getElementById('cmpProveedor');
    if (selProv) selProv.innerHTML = '<option value="">Sin proveedor</option>' +
      state.proveedores.map(p => `<option value="${p.idProveedor}">${Utils.esc(p.nombre)}</option>`).join('');
  } catch (err) {
    state.proveedores = [];
    Utils.showToast('Error al cargar proveedores: ' + err.message, 'error');
  }

  try {
    const page = await API.get('/productos?size=1000&activo=true');
    state.productos = page.content || page || [];
  } catch (err) {
    state.productos = [];
    Utils.showToast('Error al cargar el inventario: ' + err.message, 'error');
  }

  if (state.productos.length === 0) {
    Utils.showToast('No hay productos activos en el inventario', 'warning');
  }
}

async function cargarCompras() {
  const search = document.getElementById('searchCompras')?.value || '';
  const idSucursal = document.getElementById('filtroSucursalCompra')?.value || '';
  try {
    const q = new URLSearchParams({ search });
    if (idSucursal) q.set('idSucursal', idSucursal);
    state.compras = await API.get('/recepciones?' + q.toString());
    renderTable();
  } catch (err) {
    state.compras = [];
    renderTable();
  }
}

function renderTable() {
  const tbody = document.getElementById('tableComprasBody');
  if (!tbody) return;
  if (!state.compras || state.compras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-truck-loading"></i><p>No hay compras</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = state.compras.map(r => `<tr>
    <td><span class="badge-status badge-active">${Utils.esc(r.folio)}</span></td>
    <td>${Utils.esc(r.proveedorNombre) || '-'}</td>
    <td>${Utils.esc(r.sucursalNombre)}</td>
    <td><strong>${Math.round(r.totalMetros * 100) / 100} m</strong></td>
    <td>${r.totalRollos}</td>
    <td>${Utils.esc(r.usuario) || '-'}</td>
    <td>${Utils.formatDateTime(r.fechaRecepcion)}</td>
    <td class="acciones-cell">
      <button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${r.idRecepcion}" data-action="menu" title="Acciones"><i class="fas fa-ellipsis-v"></i></button>
    </td>
  </tr>`).join('');
}

function handleTableClick(e) {
  const kebab = e.target.closest('.kebab-trigger');
  if (kebab) {
    e.preventDefault();
    const id = parseInt(kebab.dataset.id);
    Utils.abrirMenuKebab(kebab, [
      { icon: 'fa-eye', text: 'Ver detalle', color: 'var(--primary)', onClick: () => verCompra(id) },
      { icon: 'fa-print', text: 'Imprimir factura', color: 'var(--success)', onClick: () => imprimirFactura(id) },
      { danger: true, icon: 'fa-trash', text: 'Eliminar', onClick: () => eliminarCompra(id) },
    ]);
    return;
  }
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  e.preventDefault();
  const id = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'ver') verCompra(id);
  else if (action === 'imprimir') imprimirFactura(id);
  else if (action === 'eliminar') eliminarCompra(id);
}

async function verCompra(id) {
  try {
    const r = await API.get('/recepciones/' + id);
    const filas = (r.detalles || []).map(d => `<tr>
      <td>${Utils.esc(d.sku)}</td><td>${Utils.esc(d.productoNombre)}</td>
      <td>${d.metros} m</td><td>${d.rollos}</td>
      <td>$${d.precioCompra.toFixed(2)}</td><td>$${d.subtotal.toFixed(2)}</td>
    </tr>`).join('');
    const body = `
      <div class="mb-2"><strong>Folio:</strong> ${Utils.esc(r.folio)} &nbsp; <strong>Proveedor:</strong> ${Utils.esc(r.proveedorNombre) || '-'}</div>
      <div class="mb-2"><strong>Sucursal:</strong> ${Utils.esc(r.sucursalNombre)} &nbsp; <strong>Fecha:</strong> ${Utils.formatDateTime(r.fechaRecepcion)}</div>
      ${r.nota ? `<div class="mb-3"><strong>Nota:</strong> ${Utils.esc(r.nota)}</div>` : ''}
      <div class="table-responsive"><table class="table table-sm table-custom mb-2">
        <thead><tr><th>SKU</th><th>Producto</th><th>Metros</th><th>Rollos</th><th>P.Compra</th><th>Subtotal</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      <div class="d-flex justify-content-end gap-4"><div class="fw-bold">Total metros: ${Math.round(r.totalMetros * 100) / 100} m</div><div class="fw-bold">Total rollos: ${r.totalRollos}</div></div>`;
    Utils.showDialog('Compra ' + Utils.esc(r.folio), body);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function imprimirFactura(id) {
  try {
    const r = await API.get('/recepciones/' + id);
    imprimirTicket(r);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function imprimirTicket(r) {
  const filas = (r.detalles || []).map(d => `<tr>
    <td>${Utils.esc(d.productoNombre)}</td><td>${Utils.esc(d.sku)}</td>
    <td style="text-align:center">${d.metros}</td>
    <td style="text-align:center">${d.rollos}</td>
    <td style="text-align:right">${d.precioCompra.toFixed(2)}</td>
    <td style="text-align:right">${d.subtotal.toFixed(2)}</td>
  </tr>`).join('');
  const total = (r.detalles || []).reduce((s, d) => s + d.subtotal, 0);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Compra ${Utils.esc(r.folio)}</title>
    <style>
      body{font-family:Inter,Segoe UI,sans-serif;font-size:13px;color:#0f172a;margin:0;padding:24px}
      h1{margin:0;font-size:22px;color:#1e3a5f}
      .header{border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:14px}
      .row{display:flex;justify-content:space-between;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th{background:#eff6ff;color:#1e3a5f;text-align:left;padding:6px}
      td{padding:6px;border-bottom:1px solid #e2e8f0}
      .totales{margin-top:12px;display:flex;justify-content:flex-end;gap:30px;font-weight:700}
      .muted{color:#64748b;font-size:11px}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <h1>BONDS <span style="font-size:13px;font-weight:400;color:#64748b">— Nota de Compra / Factura</span></h1>
      <div class="muted">PRISCILA ARONG KIM LOPEZ</div>
    </div>
    <div class="row">
      <div><b>Folio:</b> ${Utils.esc(r.folio)}<br><b>Fecha:</b> ${Utils.formatDateTime(r.fechaRecepcion)}</div>
      <div style="text-align:right"><b>Proveedor:</b> ${Utils.esc(r.proveedorNombre) || 'Consignaci&oacute;n'}<br>
      ${r.proveedorRfc ? '<b>RFC:</b> ' + Utils.esc(r.proveedorRfc) + '<br>' : ''}<b>Usuario:</b> ${Utils.esc(r.usuario) || '-'}</div>
    </div>
    <div class="muted" style="margin-bottom:4px"><b>Sucursal:</b> ${Utils.esc(r.sucursalNombre)}${r.nota ? ' &nbsp;|&nbsp; <b>Nota:</b> ' + Utils.esc(r.nota) : ''}</div>
    <table>
      <thead><tr><th>Producto</th><th>SKU</th><th style="text-align:center">Metros</th><th style="text-align:center">Rollos</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="totales">
      <span>Total metros: ${Math.round(r.totalMetros * 100) / 100} m</span>
      <span>Total rollos: ${r.totalRollos}</span>
      <span>Total: $${total.toFixed(2)}</span>
    </div>
    <p class="muted" style="margin-top:24px">Documento generado por el sistema BONDS — Gracias por su preferencia.</p>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=820,height=600');
  if (!win) { Utils.showToast('Habilita las ventanas emergentes', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

async function eliminarCompra(id) {
  const confirmed = await Utils.confirm('Esta acci&oacute;n descontar&aacute; el stock de la compra. \u00bfContinuar?', 'Eliminar compra');
  if (!confirmed) return;
  try {
    await API.del('/recepciones/' + id);
    Utils.showToast('Compra eliminada', 'success');
    cargarStats();
    cargarCompras();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

const modal = document.getElementById('modalCompra');

function abrirModal() {
  state.detalles = [];
  document.getElementById('tableDetallesCompra').innerHTML = '';
  document.getElementById('cmpNota').value = '';
  actualizarTotales();
  if (!productoModal) productoModal = new bootstrap.Modal(modal, { backdrop: 'static' });
  productoModal.show();
}

function agregarDetalle(producto, metros, precio) {
  if (!state.productos || state.productos.length === 0) {
    Utils.showToast('No hay productos en el inventario para agregar', 'warning');
    return;
  }
  const opts = state.productos.map(p =>
    `<option value="${p.idProducto}" data-metros-por-rollo="${p.metrosPorRollo || 1}" data-nombre="${Utils.esc(p.nombre)}">${Utils.esc(p.sku)} - ${Utils.esc(p.nombre)}</option>`).join('');
  const fila = document.createElement('tr');
  fila.innerHTML = `
    <td>
      <select class="form-select form-select-sm det-producto">${opts}</select>
    </td>
    <td><input type="number" class="form-control form-control-sm det-metros" value="${metros || ''}" min="1" placeholder="m"></td>
    <td><input type="number" class="form-control form-control-sm det-precio" value="${precio || ''}" min="0" step="0.01" placeholder="$"></td>
    <td class="det-rollos text-center fw-semibold">0</td>
    <td class="det-subtotal text-end fw-semibold">$0.00</td>
    <td><button class="btn-action" style="color:var(--danger)" data-action="quitar"><i class="fas fa-times"></i></button></td>`;
  document.getElementById('tableDetallesCompra').appendChild(fila);
  const sel = fila.querySelector('.det-producto');
  if (producto && state.productos.find(p => p.idProducto === producto)) sel.value = producto;
  ['input', 'change'].forEach(ev => {
    fila.querySelector('.det-metros').addEventListener(ev, () => recalcularFila(fila));
    fila.querySelector('.det-precio').addEventListener(ev, () => recalcularFila(fila));
    sel.addEventListener(ev, () => recalcularFila(fila));
  });
  fila.querySelector('button[data-action="quitar"]').addEventListener('click', () => {
    fila.remove();
    actualizarTotales();
  });
  recalcularFila(fila);
}

function recalcularFila(fila) {
  const sel = fila.querySelector('.det-producto');
  const metros = parseFloat(fila.querySelector('.det-metros').value) || 0;
  const precio = parseFloat(fila.querySelector('.det-precio').value) || 0;
  const opt = sel.options[sel.selectedIndex];
  const metrosPorRollo = opt ? parseFloat(opt.dataset.metrosPorRollo) || 1 : 1;
  const rollos = Math.ceil(metros / metrosPorRollo);
  fila.querySelector('.det-rollos').textContent = rollos;
  fila.querySelector('.det-subtotal').textContent = '$' + (metros * precio).toFixed(2);
  actualizarTotales();
}

function actualizarTotales() {
  const filas = document.querySelectorAll('#tableDetallesCompra tr');
  let metros = 0, rollos = 0;
  filas.forEach(f => {
    metros += parseFloat(f.querySelector('.det-metros')?.value) || 0;
    rollos += parseInt(f.querySelector('.det-rollos')?.textContent) || 0;
  });
  document.getElementById('cmpTotalMetros').textContent = Math.round(metros * 100) / 100 + ' m';
  document.getElementById('cmpTotalRollos').textContent = rollos;
}

async function guardar() {
  const idSucursal = document.getElementById('cmpSucursal').value;
  const idProveedor = document.getElementById('cmpProveedor').value;
  const nota = document.getElementById('cmpNota').value;
  const detalles = [];
  const filas = document.querySelectorAll('#tableDetallesCompra tr');

  if (!idSucursal) { Utils.showToast('Selecciona una sucursal', 'warning'); return; }
  if (filas.length === 0) { Utils.showToast('Agrega al menos un producto', 'warning'); return; }

  for (const f of filas) {
    const idProducto = parseInt(f.querySelector('.det-producto').value);
    const metros = parseInt(f.querySelector('.det-metros').value);
    const precio = parseFloat(f.querySelector('.det-precio').value);
    if (!metros || metros <= 0) { Utils.showToast('Indica los metros de cada producto', 'warning'); return; }
    if (precio < 0) { Utils.showToast('Precio de compra inv&aacute;lido', 'warning'); return; }
    detalles.push({ idProducto, metros, precioCompra: precio });
  }

  try {
    await API.post('/recepciones', { idSucursal: parseInt(idSucursal), idProveedor: idProveedor ? parseInt(idProveedor) : null, nota, detalles });
    Utils.showToast('Compra registrada', 'success');
    productoModal.hide();
    cargarStats();
    cargarCompras();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}