let state = {
  clientes: [],
  selectedClienteId: null,
  creditos: [],
  movimientos: [],
  filtro: 'pendientes',
};

export function init() {
  bindEvents();
  cargarClientesCredito();
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
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state py-2"><i class="fas fa-file-invoice"></i><p>Sin cr\u00e9ditos</p></div></td></tr>';
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
      <td>${c.plazoMeses || '-'} meses</td>
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
    return `<tr>
      <td style="font-size:0.8rem">${m.fecha ? new Date(m.fecha).toLocaleString() : '-'}</td>
      <td><span class="${tipoClass} fw-semibold">${tipoLabel}</span></td>
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
  document.getElementById('btnConfirmarAbono').dataset.creditoId = idCredito;
  new bootstrap.Modal(document.getElementById('abonoModal')).show();
}

async function confirmarAbono() {
  const idCredito = parseInt(document.getElementById('btnConfirmarAbono').dataset.creditoId);
  const monto = parseFloat(document.getElementById('abonoMonto').value);
  const tipo = document.getElementById('abonoTipo').value;

  if (!monto || monto <= 0) {
    Utils.showToast('Ingresa un monto v\u00e1lido', 'warning');
    return;
  }

  try {
    await API.post('/creditos/abonos', { idCredito, monto, tipo });
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
  new bootstrap.Modal(document.getElementById('abonoGeneralModal')).show();
}

async function confirmarAbonoGeneral() {
  const monto = parseFloat(document.getElementById('abonoGeneralMonto').value);

  if (!monto || monto <= 0) {
    Utils.showToast('Ingresa un monto v\u00e1lido', 'warning');
    return;
  }

  try {
    await API.post('/creditos/abonos/general', { idCliente: state.selectedClienteId, monto });
    Utils.showToast('Abono general registrado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('abonoGeneralModal'))?.hide();
    await Promise.all([
      cargarCreditosCliente(state.selectedClienteId),
      cargarMovimientosCliente(state.selectedClienteId),
    ]);
    cargarClientesCredito();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}