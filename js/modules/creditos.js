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
  document.getElementById('creditoDetalleSection').classList.remove('d-none');
  document.getElementById('abonoGeneralCliente').textContent = (cliente.nombre || '') + ' ' + (cliente.apellidoPaterno || '');

  await Promise.all([
    cargarCreditosCliente(id),
    cargarMovimientosCliente(id),
  ]);
}

async function cargarCreditosCliente(id) {
  try {
    state.creditos = await API.get('/creditos/clientes/' + id + '/creditos');
    renderCreditos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
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
    return `<tr>
      <td>${c.idCredito}</td>
      <td>#${c.folioVenta || c.idVenta}</td>
      <td class="text-end">$${(c.montoOriginal || 0).toFixed(2)}</td>
      <td class="text-end fw-semibold">$${(c.saldoPendiente || 0).toFixed(2)}</td>
      <td style="font-size:0.85rem">${c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString() : '-'}</td>
      <td><span class="badge ${estadoBadge}">${c.estado}</span></td>
      <td>
        ${c.estado === 'ACTIVO' ? '<button class="btn btn-sm btn-success abono-btn" data-id="' + c.idCredito + '"><i class="fas fa-money-bill-wave"></i></button>' : ''}
      </td>
    </tr>`;
  }).join('');
}

function handleCreditoClick(e) {
  const btn = e.target.closest('.abono-btn');
  if (btn) {
    const id = parseInt(btn.dataset.id);
    abrirAbonoModal(id);
  }
}

async function cargarMovimientosCliente(id) {
  try {
    state.movimientos = await API.get('/creditos/clientes/' + id + '/movimientos');
    renderMovimientos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderMovimientos() {
  const tbody = document.getElementById('tableMovimientosBody');
  if (!tbody) return;

  if (!state.movimientos || state.movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state py-2"><i class="fas fa-history"></i><p>Sin movimientos</p></div></td></tr>';
    return;
  }

  state.movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  tbody.innerHTML = state.movimientos.map(m => {
    const tipoClass = m.tipo === 'CARGO' ? 'text-danger' :
      m.tipo === 'ABONO' || m.tipo === 'LIQUIDACION' ? 'text-success' : 'text-muted';
    const tipoLabel = m.tipo === 'CARGO' ? 'Cargo' :
      m.tipo === 'ABONO' ? 'Abono' :
      m.tipo === 'LIQUIDACION' ? 'Liquidaci\u00f3n' : m.tipo;
    const metodoPago = (m.tipo === 'ABONO' || m.tipo === 'LIQUIDACION') && m.metodoPago
      ? Utils.esc(m.metodoPago) : '&mdash;';
    return `<tr>
      <td style="font-size:0.8rem">${m.fecha ? new Date(m.fecha).toLocaleString() : '-'}</td>
      <td><span class="${tipoClass} fw-semibold">${tipoLabel}</span></td>
      <td style="font-size:0.8rem">${metodoPago}</td>
      <td class="text-end ${tipoClass}">$${(m.monto || 0).toFixed(2)}</td>
      <td class="text-end">$${(m.saldoNuevo || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function cerrarDetalle() {
  state.selectedClienteId = null;
  state.creditos = [];
  state.movimientos = [];
  document.getElementById('creditoDetalleSection').classList.add('d-none');
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

  const movimientos = [...state.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const movRows = (movimientos || []).map(m => {
    const tipo = m.tipo === 'CARGO' ? 'Cargo'
      : m.tipo === 'ABONO' ? 'Abono'
      : m.tipo === 'LIQUIDACION' ? 'Liquidaci\u00f3n' : m.tipo;
    const pago = (m.tipo === 'ABONO' || m.tipo === 'LIQUIDACION') && m.metodoPago
      ? Utils.esc(m.metodoPago) : '-';
    return `<tr>
      <td>${m.fecha ? new Date(m.fecha).toLocaleString() : '-'}</td>
      <td>${tipo}</td>
      <td>${pago}</td>
      <td class="right">${m.tipo === 'CARGO' ? '' : '-'}$${(m.monto || 0).toFixed(2)}</td>
      <td class="right">$${(m.saldoNuevo || 0).toFixed(2)}</td>
    </tr>`;
  }).join('');

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
    <div class="info"><span><strong>Tel\u00e9fono:</strong> ${Utils.esc(cliente.telefono || '-')}</span><span><strong>Total pendiente:</strong> <span class="total">$${totalPendiente.toFixed(2)}</span></span></div>
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
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Pago</th><th class="right">Monto</th><th class="right">Saldo</th></tr></thead>
      <tbody>${movRows || '<tr><td colspan="5" style="text-align:center">Sin movimientos</td></tr>'}</tbody>
    </table>
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