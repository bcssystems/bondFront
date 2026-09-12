import { printRemisionVenta, printEstadoCuenta } from './printing.js';

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
    procesarIntentoCreditoCliente();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function procesarIntentoCreditoCliente() {
  const raw = localStorage.getItem('creditosParaCliente');
  if (!raw) return;
  localStorage.removeItem('creditosParaCliente');
  const id = parseInt(raw);
  if (!id) return;
  let cliente = state.clientes.find(c => c.idCliente === id);
  if (!cliente) {
    try { cliente = await API.get('/clientes/' + id); } catch (_) { cliente = null; }
  }
  if (cliente) {
    if (!state.clientes.some(c => c.idCliente === id)) {
      state.clientes.unshift(cliente);
      renderClientes();
    }
    seleccionarCliente(id);
  } else {
    Utils.showToast('No se encontr\u00f3 el cliente', 'warning');
  }
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
    return `<tr class="credito-cliente-row" data-id="${c.idCliente}">
      <td><span class="fw-semibold">${Utils.esc(c.nombre)} ${Utils.esc(c.apellidoPaterno || '')}</span></td>
      <td>${Utils.esc(c.telefono) || '-'}</td>
      <td class="text-end">$${(c.limiteCredito || 0).toFixed(2)}</td>
      <td class="text-end fw-semibold ${(c.saldoActual || 0) > 0 ? 'text-danger' : 'text-success'}">$${(c.saldoActual || 0).toFixed(2)}</td>
      <td class="text-end">$${Math.max(0, disponible).toFixed(2)}</td>
      <td>
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-outline-primary px-3 kebab-toggle-cliente" data-id="${c.idCliente}" title="Acciones">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.kebab-toggle-cliente').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const cliente = state.clientes.find(x => x.idCliente === id);
      const items = [
        { icon: 'fas fa-file-invoice', label: 'Estado de cuenta', action: 'estado-cuenta' },
        { icon: 'fas fa-list', label: 'Cr\u00e9ditos pendientes', action: 'creditos' },
        { icon: 'fas fa-money-bill-wave', label: 'Abonar', action: 'abonar' },
        { icon: 'fas fa-cash-register', label: 'Abonar en POS', action: 'abonar-pos' },
      ];
      Utils.abrirMenuKebab(btn, items.map(it => ({
        ...it,
        onClick: () => {
          if (it.action === 'estado-cuenta' || it.action === 'creditos') seleccionarCliente(id);
          else if (it.action === 'abonar') {
            state.selectedClienteId = id;
            abrirAbonoGeneralModal();
          } else if (it.action === 'abonar-pos') {
            localStorage.setItem('abonoParaPOS', JSON.stringify({
              idCliente: id,
              nombre: (cliente?.nombre || '') + ' ' + (cliente?.apellidoPaterno || ''),
            }));
            Utils.showToast('Abriendo POS para registrar el abono', 'info');
            document.querySelector('[data-view="pages/ventas.html"]')?.click();
          }
        },
      })));
    });
  });
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

async function imprimirRemision(venta) {
  let configs = {};
  let clienteInfo = null;
  try {
    const list = await API.get('/configuraciones');
    (list || []).forEach(c => { configs[c.clave] = c.valor; });
  } catch (_) {}
  if (venta.idCliente) {
    try { clienteInfo = await API.get('/clientes/' + venta.idCliente); } catch (_) {}
  }
  printRemisionVenta(venta, { configs, clienteInfo, copies: 1 });
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
  const tasaMora = detallesEstado.tasaInteresMora != null
    ? detallesEstado.tasaInteresMora
    : parseFloat(configs['tasaInteresMoraPagare']);

  const notas = (state.creditos || [])
    .map(c => ({ nota: (c.nota || '').trim(), fecha: c.fechaCreacion }))
    .filter(n => n.nota);

  printEstadoCuenta({
    cliente,
    configs,
    creditos: state.creditos || [],
    movimientos: state.movimientos || [],
    notas,
    totalPendiente,
    tasaMora,
  });
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