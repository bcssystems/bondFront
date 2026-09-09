let state = {
  clientes: [],
  selectedClienteId: null,
  creditos: [],
  movimientos: [],
  tiposPago: [],
  filtro: 'pendientes',
};

export function init() {
  bindEvents();
  cargarClientesCredito();
  cargarTiposPago();
}

function bindEvents() {
  document.getElementById('btnBuscarCreditoCliente')?.addEventListener('click', () => cargarClientesCredito());
  document.getElementById('btnLimpiarCreditoCliente')?.addEventListener('click', limpiarBusqueda);
  document.getElementById('searchCreditoCliente')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') cargarClientesCredito();
  });
  document.querySelectorAll('input[name="filtroCredito"]').forEach(r => {
    r.addEventListener('change', e => {
      state.filtro = e.target.value;
      cargarClientesCredito();
    });
  });
  document.getElementById('tableCreditosClientesBody')?.addEventListener('click', handleClienteClick);
  document.getElementById('tableCreditosBody')?.addEventListener('click', handleCreditoClick);
  document.getElementById('btnCerrarDetalle')?.addEventListener('click', cerrarDetalle);
  document.getElementById('creditoDetalleModal')?.addEventListener('hidden.bs.modal', () => {
    state.selectedClienteId = null;
    state.creditos = [];
    state.movimientos = [];
  });
  document.getElementById('btnAbonarTodas')?.addEventListener('click', abrirAbonoGeneralModal);
  document.getElementById('btnImprimirEstadoCuenta')?.addEventListener('click', imprimirEstadoCuenta);
  document.getElementById('btnConfirmarAbono')?.addEventListener('click', confirmarAbono);
  document.getElementById('btnConfirmarAbonoGeneral')?.addEventListener('click', confirmarAbonoGeneral);
  document.getElementById('abonoTipo')?.addEventListener('change', function() {
    const montoInput = document.getElementById('abonoMonto');
    if (this.value === 'LIQUIDACION') {
      const saldoText = document.getElementById('abonoSaldoPendiente').textContent.replace('$', '');
      montoInput.value = parseFloat(saldoText) || 0;
    }
  });
}

async function cargarTiposPago() {
  try {
    state.tiposPago = await API.get('/tipos-pago');
    const optsHtml = state.tiposPago
      .map(t => `<option value="${t.idTipoPago}">${Utils.esc(t.nombre)}</option>`)
      .join('');
    document.getElementById('abonoTipoPago').innerHTML = optsHtml;
    document.getElementById('abonoGeneralTipoPago').innerHTML = optsHtml;
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function tipoPagoPorDefecto() {
  if (state.tiposPago.length === 0) return '';
  const porNombre = state.tiposPago.find(t => t.nombre.toUpperCase() === 'EFECTIVO');
  return porNombre ? porNombre.idTipoPago : state.tiposPago[0].idTipoPago;
}

async function cargarClientesCredito() {
  const search = document.getElementById('searchCreditoCliente')?.value?.trim() || '';
  try {
    const result = await API.get('/clientes?search=' + encodeURIComponent(search) + '&page=0&size=200');
    state.clientes = (result.content || []).filter(c => {
      if (!c.tieneCredito) return false;
      if (state.filtro === 'pendientes') return (c.saldoActual || 0) > 0;
      if (state.filtro === 'liquidados') return (c.saldoActual || 0) <= 0;
      return true;
    });
    renderClientes();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderClientes() {
  const tbody = document.getElementById('tableCreditosClientesBody');
  if (!tbody) return;

  if (state.clientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-credit-card"></i><p>No hay clientes con cr\u00e9dito</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.clientes.map(c => {
    const disponible = (c.limiteCredito || 0) - (c.saldoActual || 0);
    return `<tr class="credito-cliente-row" data-id="${c.idCliente}" style="cursor:pointer">
      <td><span class="fw-semibold">${Utils.esc(c.nombre)} ${Utils.esc(c.apellidoPaterno || '')}</span></td>
      <td>${Utils.esc(c.telefono) || '-'}</td>
      <td class="text-end">$${(c.limiteCredito || 0).toFixed(2)}</td>
      <td class="text-end fw-semibold ${(c.saldoActual || 0) > 0 ? 'text-danger' : 'text-success'}">$${(c.saldoActual || 0).toFixed(2)}</td>
      <td class="text-end">$${Math.max(0, disponible).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-outline-primary px-3 ver-creditos-btn" data-id="${c.idCliente}"><i class="fas fa-eye me-1"></i>Ver</button></td>
    </tr>`;
  }).join('');
}

function handleClienteClick(e) {
  const btn = e.target.closest('.ver-creditos-btn');
  const row = e.target.closest('.credito-cliente-row');
  const id = btn?.dataset?.id || row?.dataset?.id;
  if (id) seleccionarCliente(parseInt(id));
}

async function seleccionarCliente(id) {
  state.selectedClienteId = id;
  const cliente = state.clientes.find(c => c.idCliente === id);
  if (!cliente) return;

  document.getElementById('creditoClienteName').textContent = (cliente.nombre || '') + ' ' + (cliente.apellidoPaterno || '');
  document.getElementById('abonoGeneralCliente').textContent = (cliente.nombre || '') + ' ' + (cliente.apellidoPaterno || '');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('creditoDetalleModal')).show();

  await Promise.all([
    cargarCreditosCliente(id),
    cargarMovimientosCliente(id),
  ]);
}

async function cargarCreditosCliente(id) {
  try {
    state.creditos = await API.get('/creditos/clientes/' + id + '/creditos');
    renderDetalle();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderDetalle() {
  renderCreditos();
  renderNotas();
  renderMovimientos();
  actualizarDeudaTotal();
}

function actualizarDeudaTotal() {
  const el = document.getElementById('estadoDeudaTotal');
  if (!el) return;
  const total = (state.creditos || []).reduce((s, c) => s + (c.saldoPendiente || 0), 0);
  el.textContent = '$' + total.toFixed(2);
}

function renderCreditos() {
  const tbody = document.getElementById('tableCreditosBody');
  if (!tbody) return;

  if (!state.creditos || state.creditos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state py-2"><i class="fas fa-file-invoice"></i><p>Sin cr\u00e9ditos</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.creditos.map(c => {
    const estadoBadge = c.estado === 'ACTIVO' ? 'bg-warning text-dark' :
      c.estado === 'PAGADO' ? 'bg-success' :
      c.estado === 'VENCIDO' ? 'bg-danger' : 'bg-secondary';
    const abonoBtn = c.estado === 'ACTIVO'
      ? '<button class="btn btn-sm btn-success abono-btn" data-id="' + c.idCredito + '" title="Abonar"><i class="fas fa-money-bill-wave"></i></button>'
      : '';
    return `<tr>
      <td>${c.idCredito}</td>
      <td>#${c.folioVenta || c.idVenta}</td>
      <td class="text-end">$${(c.montoOriginal || 0).toFixed(2)}</td>
      <td class="text-end fw-semibold">$${(c.saldoPendiente || 0).toFixed(2)}</td>
      <td style="font-size:0.85rem">${c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString() : '-'}</td>
      <td><span class="badge ${estadoBadge}">${c.estado}</span></td>
      <td>
        <button class="btn-action" style="color:var(--primary)" data-id="${c.idCredito}" data-action="reprint" title="Reimprimir venta"><i class="fas fa-print"></i></button>
        <button class="btn-action" style="color:var(--info)" data-id="${c.idCredito}" data-action="ver-nota" title="Ver nota de la venta"><i class="fas fa-sticky-note"></i></button>
        ${abonoBtn}
      </td>
    </tr>`;
  }).join('');
}

function handleCreditoClick(e) {
  const id = e.target.closest('[data-id]')?.dataset?.id;
  if (!id) return;
  const credito = state.creditos.find(c => c.idCredito === parseInt(id));
  if (!credito) return;

  if (e.target.closest('.abono-btn')) {
    abrirAbonoModal(credito.idCredito);
    return;
  }
  const accion = e.target.closest('[data-action]')?.dataset?.action;
  if (accion === 'reprint') reimprimirVenta(credito.idVenta || credito.folioVenta);
  else if (accion === 'ver-nota') verNotaVenta(credito);
}

async function cargarMovimientosCliente(id) {
  try {
    state.movimientos = await API.get('/creditos/clientes/' + id + '/movimientos');
    renderDetalle();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function estadoCreditoInfo(c) {
  if (!c) return { text: '-', cls: 'bg-secondary' };
  if (c.estado === 'PAGADO') return { text: 'LIQUIDADA', cls: 'bg-success' };
  if (c.estado === 'CANCELADO') return { text: 'CANCELADO', cls: 'bg-secondary' };
  if (c.estado === 'VENCIDO') return { text: 'EN CURSO / VENCIDO', cls: 'bg-danger' };
  const tieneAbonos = (state.movimientos || []).some(m => m.idCredito === c.idCredito && (m.tipo === 'ABONO' || m.tipo === 'LIQUIDACION'));
  return tieneAbonos
    ? { text: 'EN CURSO', cls: 'bg-info' }
    : { text: 'PENDIENTE', cls: 'bg-warning text-dark' };
}

function renderMovimientos() {
  const tbody = document.getElementById('tableMovimientosBody');
  if (!tbody) return;

  if (!state.movimientos || state.movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state py-2"><i class="fas fa-file-invoice"></i><p>Sin movimientos</p></div></td></tr>';
    return;
  }

  const creditosById = {};
  (state.creditos || []).forEach(c => { creditosById[c.idCredito] = c; });

  const movs = [...state.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  tbody.innerHTML = movs.map(m => {
    const c = creditosById[m.idCredito];
    const estado = estadoCreditoInfo(c);
    const folio = c ? (c.folio || ('#' + c.idCredito)) : '&mdash;';
    const venta = c ? ('#' + (c.folioVenta || c.idVenta || '')) : '&mdash;';
    const tipoClass = m.tipo === 'CARGO' ? 'text-danger' :
      m.tipo === 'ABONO' || m.tipo === 'LIQUIDACION' ? 'text-success' : 'text-muted';
    const tipoLabel = m.tipo === 'CARGO' ? 'Cargo' :
      m.tipo === 'ABONO' ? 'Abono' :
      m.tipo === 'LIQUIDACION' ? 'Liquidaci\u00f3n' : m.tipo;
    return `<tr>
      <td style="font-size:0.8rem">${Utils.esc(folio)}</td>
      <td style="font-size:0.8rem">${Utils.esc(venta)}</td>
      <td style="font-size:0.8rem">${m.fecha ? new Date(m.fecha).toLocaleString() : '-'}</td>
      <td><span class="${tipoClass} fw-semibold">${tipoLabel}</span></td>
      <td class="text-end ${tipoClass}">$${(m.monto || 0).toFixed(2)}</td>
      <td><span class="badge ${estado.cls}">${estado.text}</span></td>
      <td class="text-end">$${(m.saldoNuevo || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function renderNotas() {
  const el = document.getElementById('notasVentasList');
  if (!el) return;

  const notas = (state.creditos || [])
    .map(c => ({ nota: (c.nota || '').trim(), idVenta: c.idVenta || c.folioVenta, fecha: c.fechaCreacion || c.fechaVencimiento }))
    .filter(n => n.nota)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (notas.length === 0) {
    el.innerHTML = '<p class="text-muted small mb-0">Sin notas de ventas</p>';
    return;
  }

  el.innerHTML = notas.map((n, i) =>
    '<div class="border-bottom py-1 small d-flex align-items-center gap-2">' +
    '<i class="fas fa-sticky-note text-muted"></i><span class="flex-grow-1">' + Utils.esc(n.nota) + '</span>' +
    (n.fecha ? '<span class="text-muted" style="font-size:0.75rem">' + Utils.formatDate(n.fecha) + '</span>' : '') +
    '<button class="btn-action" style="color:var(--primary)" data-nota-index="' + i + '" data-action="reprint-nota" title="Reimprimir venta"><i class="fas fa-print"></i></button>' +
    '</div>'
  ).join('');

  el.querySelectorAll('[data-action="reprint-nota"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = notas[parseInt(btn.dataset.notaIndex)];
      if (n && n.idVenta) reimprimirVenta(n.idVenta);
    });
  });
}

function cerrarDetalle() {
  state.selectedClienteId = null;
  state.creditos = [];
  state.movimientos = [];
  bootstrap.Modal.getOrCreateInstance(document.getElementById('creditoDetalleModal'))?.hide();
}

function limpiarBusqueda() {
  document.getElementById('searchCreditoCliente').value = '';
  const radio = document.getElementById('filtroCredPendientes');
  if (radio) { radio.checked = true; state.filtro = 'pendientes'; }
  cargarClientesCredito();
}

function abrirAbonoModal(idCredito) {
  const credito = state.creditos.find(c => c.idCredito === idCredito);
  if (!credito) return;

  document.getElementById('abonoCreditoInfo').textContent = 'Cr\u00e9dito #' + credito.idCredito + ' | Venta #' + (credito.folioVenta || credito.idVenta);
  document.getElementById('abonoSaldoPendiente').textContent = '$' + (credito.saldoPendiente || 0).toFixed(2);
  document.getElementById('abonoMonto').value = '';
  document.getElementById('abonoTipo').value = 'PARCIAL';
  document.getElementById('abonoTipoPago').value = tipoPagoPorDefecto();
  document.getElementById('btnConfirmarAbono').dataset.creditoId = idCredito;
  new bootstrap.Modal(document.getElementById('abonoModal')).show();
}

async function reimprimirVenta(idVenta) {
  if (!idVenta) { Utils.showToast('Venta no disponible', 'warning'); return; }
  try {
    const venta = await API.get('/ventas/' + idVenta);
    imprimirRemision(venta);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function imprimirRemision(venta) {
  const isCredit = venta.tipoVenta === 'CREDITO';
  const subtotal = venta.subtotal || 0;
  const descuento = venta.descuento || 0;
  const total = venta.total || 0;
  const detalles = (venta.detalles || []).map(d => {
    const unidad = (d.unidadMedida || 'UNIDAD').toLowerCase();
    return `<tr>
      <td>${Utils.esc(d.productoNombre || d.descripcion || '')}</td>
      <td class="center">${d.cantidad} ${Utils.esc(unidad)}</td>
      <td class="right">$${(d.precioUnitario || 0).toFixed(2)}</td>
      <td class="right">$${(d.subtotal || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const notaHtml = venta.nota
    ? `<div class="section"><div class="section-title">Nota de la venta</div><p>${Utils.esc(venta.nota)}</p></div>`
    : '';

  const creditHtml = isCredit ? `<div class="section">
    <div class="section-title">Pagar\u00e9 No. ${Utils.esc(venta.folioPagare || '—')}</div>
    <table class="totals">
      <tr><td>Plazo</td><td class="right">${venta.plazoMeses != null ? venta.plazoMeses + ' meses' : '—'}</td></tr>
      <tr><td>Inter\u00e9s</td><td class="right">${venta.porcentajeInteres || 0}%</td></tr>
      <tr><td>Total con inter\u00e9s</td><td class="right">$${((venta.total || 0) * (1 + (venta.porcentajeInteres || 0) / 100)).toFixed(2)}</td></tr>
    </table>
  </div>` : '';

  const html = `<html><head><meta charset="utf-8"><title>Remisi\u00f3n #${venta.idVenta}</title>
  <style>
    @page { size: letter; margin: 0.6in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #222; padding: 15px; }
    .header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #2563EB; margin-bottom: 14px; }
    .header h2 { font-size: 22pt; letter-spacing: 2px; margin-bottom: 6px; }
    .header h4 { font-size: 12pt; font-weight: normal; }
    .datos { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 10.5pt; }
    .line { border-top: 1px solid #999; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    table.remision th { background: #2563EB; color: #fff; padding: 6px 8px; font-size: 10pt; }
    table.remision td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
    table.remision tr:nth-child(even) td { background: #f5f8ff; }
    table.totals { width: 280px; float: right; margin-top: 8px; }
    table.totals tr td { padding: 3px 4px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .section { margin-top: 18px; padding-top: 10px; border-top: 1px solid #999; }
    .section-title { font-weight: bold; text-decoration: underline; margin-bottom: 6px; }
    .total-final { font-size: 15pt; font-weight: bold; color: #2563EB; }
    .footer { clear: both; text-align: center; margin-top: 28px; padding-top: 16px; border-top: 1px solid #999; }
    .firmas { display: flex; justify-content: space-between; margin-top: 50px; }
    .firma-espacio { width: 200px; text-align: center; }
    .firma-linea { border-top: 1px solid #222; margin-bottom: 4px; }
  </style></head><body>
    <div class="header">
      <h2>BONDS</h2>
      <h4>${Utils.esc(venta.sucursalNombre || '')}</h4>
      <div>Venta #${venta.idVenta} &mdash; Remisi\u00f3n ${venta.folio ? '(Folio: ' + Utils.esc(venta.folio) + ')' : ''}</div>
    </div>
    <div class="datos">
      <div><strong>Cliente:</strong> ${venta.clienteNombre ? Utils.esc(venta.clienteNombre) : 'Mostrador'}</div>
      <div><strong>Fecha:</strong> ${Utils.formatDateTime(venta.fecha)}</div>
    </div>
    <div class="datos">
      <div><strong>Caja:</strong> ${Utils.esc(venta.cajaNombre || '')}</div>
      <div><strong>Atendido por:</strong> ${Utils.esc(venta.usuario || '')}</div>
    </div>
    <div class="line"></div>
    <table class="remision">
      <thead><tr><th style="text-align:left">Producto</th><th class="center">Cantidad</th><th class="right">P/U</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${detalles}</tbody>
    </table>
    <div style="clear:both"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td class="right">$${subtotal.toFixed(2)}</td></tr>
      ${descuento > 0 ? `<tr><td>Descuento</td><td class="right">-$${descuento.toFixed(2)}</td></tr>` : ''}
      <tr><td class="total-final">TOTAL</td><td class="right total-final">$${total.toFixed(2)}</td></tr>
    </table>
    <div style="clear:both"></div>
    ${notaHtml}
    ${creditHtml}
    <div class="footer">
      <div class="firmas">
        <div class="firma-espacio"><div class="firma-linea"></div>Entreg\u00f3</div>
        <div class="firma-espacio"><div class="firma-linea"></div>Recibi\u00f3</div>
      </div>
    </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  } else {
    Utils.showToast('Bloqueador de popups activo. Permite las ventanas emergentes.', 'warning');
  }
}

function verNotaVenta(credito) {
  const nota = (credito?.nota || '').trim();
  if (!nota) {
    Utils.showToast('La venta #' + (credito?.idVenta || credito?.folioVenta || '') + ' no tiene nota', 'info');
    return;
  }
  Utils.showDialog('Nota de la venta #' + (credito?.idVenta || credito?.folioVenta || ''), '<p class="mb-0">' + Utils.esc(nota) + '</p>');
}

async function imprimirEstadoCuenta() {
  if (!state.selectedClienteId) return;
  const cliente = state.clientes.find(c => c.idCliente === state.selectedClienteId);
  if (!cliente) return;

  let configs = {};
  let detallesEstado = {};
  try {
    const list = await API.get('/configuraciones');
    (list || []).forEach(c => { configs[c.clave] = c.valor; });
    if (state.creditos.length > 0) {
      const ec = await API.get('/creditos/' + state.creditos[0].idCredito + '/estado-cuenta');
      detallesEstado = ec || {};
    }
  } catch (_) {}

  const totalPendiente = (state.creditos || []).reduce((s, c) => s + (c.saldoPendiente || 0), 0);

  const creditosRows = (state.creditos || []).map(c => `<tr>
    <td>${c.idCredito}</td>
    <td>#${c.folio || ''}</td>
    <td class="right">$${(c.montoOriginal || 0).toFixed(2)}</td>
    <td class="right">$${(c.saldoPendiente || 0).toFixed(2)}</td>
  </tr>`).join('');

  const creditosById = {};
  (state.creditos || []).forEach(c => { creditosById[c.idCredito] = c; });

  const movimientos = [...state.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const movRows = (movimientos || []).map(m => {
    const c = creditosById[m.idCredito];
    const estado = estadoCreditoInfo(c);
    const folio = c ? (c.folio || ('#' + c.idCredito)) : '&mdash;';
    const venta = c ? ('#' + (c?.folioVenta || c?.idVenta || '')) : '&mdash;';
    const tipo = m.tipo === 'CARGO' ? 'Cargo'
      : m.tipo === 'ABONO' ? 'Abono'
      : m.tipo === 'LIQUIDACION' ? 'Liquidaci\u00f3n' : m.tipo;
    return `<tr>
      <td>${Utils.esc(folio)}</td>
      <td>${Utils.esc(venta)}</td>
      <td>${m.fecha ? new Date(m.fecha).toLocaleString() : '-'}</td>
      <td>${tipo}</td>
      <td class="right">$${(m.monto || 0).toFixed(2)}</td>
      <td>${estado.text}</td>
      <td class="right">$${(m.saldoNuevo || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const notas = (state.creditos || [])
    .map(c => ({ nota: (c.nota || '').trim(), fecha: c.fechaCreacion }))
    .filter(n => n.nota)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const notasHtml = notas.length
    ? '<ol>' + notas.map(n => '<li>' + Utils.esc(n.nota) + '</li>').join('') + '</ol>'
    : '<div style="text-align:center;font-size:11px">Sin notas de ventas</div>';

  const html = `<html><head><meta charset="utf-8"><title>Estado de Cuenta</title>
  <style>
    body { font-family: 'Consolas', monospace; font-size: 12px; color: #222; width: 620px; margin: 0 auto; padding: 16px; }
    h2 { text-align: center; letter-spacing: 2px; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 11px; margin-bottom: 4px; }
    h3 { text-align: center; margin: 6px 0; }
    .line { border-top: 1px dashed #222; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; border: 1px solid #999; font-size: 11px; }
    th { background: #eee; text-align: center; }
    .right { text-align: right; }
    .info { display: flex; justify-content: space-between; margin: 4px 0; }
    .total { font-size: 14px; font-weight: bold; }
    .firma { margin-top: 60px; text-align: center; }
    @media print { body { width: auto; } }
  </style></head><body>
    <h2>BONDS</h2>
    <div class="sub">${Utils.esc(configs['descripcionEmpresa'] || '')}</div>
    <div class="sub">${Utils.esc(configs['direccionEmpresa'] || '')}</div>
    <div class="sub">Titular: ${Utils.esc(configs['titularPagare'] || '')}</div>
    <h3>ESTADO DE CUENTA</h3>
    <div class="line"></div>
    <div class="info"><span><strong>Cliente:</strong> ${Utils.esc(cliente.nombre + ' ' + (cliente.apellidoPaterno || ''))}</span></div>
    <div class="info"><span><strong>Tel\u00e9fono:</strong> ${Utils.esc(cliente.telefono || '-')}</span><span><strong>Deuda total:</strong> <span class="total">$${totalPendiente.toFixed(2)}</span></span></div>
    <div class="info"><span><strong>L\u00edmite de cr\u00e9dito:</strong> $${(cliente.limiteCredito || 0).toFixed(2)}</span><span><strong>Tasa de mora mensual:</strong> ${detallesEstado.tasaInteresMora != null ? detallesEstado.tasaInteresMora + '%' : configs['tasaInteresMoraPagare'] + '%'}</span></div>
    <div class="info"><span>Fecha: ${new Date().toLocaleDateString()}</span></div>
    <div class="line"></div>
    <h3 style="text-align:left;font-size:12px">Cr\u00e9ditos</h3>
    <table>
      <thead><tr><th>#</th><th>Pagar\u00e9</th><th class="right">Original</th><th class="right">Pendiente</th></tr></thead>
      <tbody>${creditosRows}</tbody>
    </table>
    <div class="line"></div>
    <h3 style="text-align:left;font-size:12px">Movimientos</h3>
    <table>
      <thead><tr><th>Folio</th><th>Venta</th><th>Fecha</th><th>Tipo de movimiento</th><th class="right">Cantidad</th><th>Estado</th><th class="right">Lo que falta</th></tr></thead>
      <tbody>${movRows || '<tr><td colspan="7" style="text-align:center">Sin movimientos</td></tr>'}</tbody>
    </table>
    <div class="line"></div>
    <h3 style="text-align:left;font-size:12px">Notas de ventas</h3>
    ${notasHtml}
    <div class="firma">____________________________________<br>Firma del cliente</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=680,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  } else {
    Utils.showToast('Bloqueador de popups activo. Permite las ventanas emergentes.', 'warning');
    return;
  }
  setTimeout(() => { win.print(); }, 300);
}

async function confirmarAbono() {
  const idCredito = parseInt(document.getElementById('btnConfirmarAbono').dataset.creditoId);
  const monto = parseFloat(document.getElementById('abonoMonto').value);
  const tipo = document.getElementById('abonoTipo').value;
  const idTipoPago = parseInt(document.getElementById('abonoTipoPago').value);

  if (!monto || monto <= 0) {
    Utils.showToast('Ingresa un monto v\u00e1lido', 'warning');
    return;
  }
  if (!idTipoPago) {
    Utils.showToast('Selecciona un m\u00e9todo de pago', 'warning');
    return;
  }

  try {
    await API.post('/creditos/abonos', { idCredito, monto, tipo, idTipoPago });
    Utils.showToast('Abono registrado exitosamente', 'success');
    bootstrap.Modal.getInstance(document.getElementById('abonoModal'))?.hide();
    await Promise.all([
      cargarCreditosCliente(state.selectedClienteId),
      cargarMovimientosCliente(state.selectedClienteId),
    ]);
    cargarClientesCredito();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function abrirAbonoGeneralModal() {
  const cliente = state.clientes.find(c => c.idCliente === state.selectedClienteId);
  if (!cliente) return;

  const deudaTotal = (state.creditos || [])
    .filter(c => c.estado === 'ACTIVO')
    .reduce((sum, c) => sum + (c.saldoPendiente || 0), 0);

  document.getElementById('abonoGeneralDeudaTotal').textContent = '$' + deudaTotal.toFixed(2);
  document.getElementById('abonoGeneralMonto').value = '';
  document.getElementById('abonoGeneralTipoPago').value = tipoPagoPorDefecto();
  new bootstrap.Modal(document.getElementById('abonoGeneralModal')).show();
}

async function confirmarAbonoGeneral() {
  const monto = parseFloat(document.getElementById('abonoGeneralMonto').value);
  const idTipoPago = parseInt(document.getElementById('abonoGeneralTipoPago').value);

  if (!monto || monto <= 0) {
    Utils.showToast('Ingresa un monto v\u00e1lido', 'warning');
    return;
  }
  if (!idTipoPago) {
    Utils.showToast('Selecciona un m\u00e9todo de pago', 'warning');
    return;
  }

  try {
    await API.post('/creditos/abonos/general', { idCliente: state.selectedClienteId, monto, idTipoPago });
    Utils.showToast('Abono general registrado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('abonoGeneralModal'))?.hide();
    await Promise.all([
      cargarCreditosCliente(state.selectedClienteId),
      cargarMovimientosCliente(state.selectedClienteId),
    ]);
    cargarClientesCredito();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}