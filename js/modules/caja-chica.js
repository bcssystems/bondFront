let state = {
  caja: null,
  movimientos: [],
  gastos: [],
  filtroMov: 'todos'
};

export function init() {
  bindEvents();
  cargarCajaChica();
}

function bindEvents() {
  document.getElementById('btnIngresarChica')?.addEventListener('click', () => abrirMovimientoModal());
  if (Utils.hasPermiso('GASTOS_CREAR')) {
    document.getElementById('btnGastoChica')?.addEventListener('click', abrirGastoModal);
    document.getElementById('btnSolicitarGastoChica')?.addEventListener('click', solicitarGasto);
  } else {
    const b1 = document.getElementById('btnGastoChica');
    if (b1) b1.style.display = 'none';
    const b2 = document.getElementById('btnSolicitarGastoChica');
    if (b2) b2.style.display = 'none';
  }
  document.getElementById('btnConfirmarMovChica')?.addEventListener('click', confirmarMovimiento);
  document.getElementById('btnRealizarCorteChica')?.addEventListener('click', realizarCorte);
  document.getElementById('btnAbrirChica')?.addEventListener('click', abrirCaja);
  document.getElementById('btnCerrarChica')?.addEventListener('click', cerrarCaja);
  document.getElementById('btnCorteChica')?.addEventListener('click', previewCorte);
  document.getElementById('btnExportMovPDF')?.addEventListener('click', () => exportarMovimientos('pdf'));
  document.getElementById('btnExportMovExcel')?.addEventListener('click', () => exportarMovimientos('excel'));

  document.querySelectorAll('input[name="filtroChicaMov"]').forEach(r => {
    r.addEventListener('change', e => {
      state.filtroMov = e.target.value;
      renderMovimientos();
    });
  });
  document.getElementById('tableChicaMovBody')?.addEventListener('click', handleGastosClick);
}

async function cargarCajaChica() {
  try {
    const cajas = await API.get('/cajas');
    const caja = (cajas || []).find(c => (c.tipo || 'NORMAL') === 'CHICA');
    if (!caja) {
      document.getElementById('chicaNombre').textContent = 'Sin caja chica';
      document.getElementById('chicaEstado').textContent = 'NO CONFIGURADA';
      document.getElementById('tableChicaMovBody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-coins"></i><p>No hay caja chica configurada. Crea una caja de tipo CHICA en Cajas.</p></div></td></tr>';
      return;
    }
    state.caja = caja;
    document.getElementById('chicaNombre').textContent = caja.nombre;
    document.getElementById('chicaSaldo').textContent = '$' + (caja.saldoActual || 0).toFixed(2);
    document.getElementById('chicaApertura').textContent = Utils.formatDateTime(caja.fechaApertura) || '--';

    const abierta = caja.estado === 'ABIERTA';
    const estadoEl = document.getElementById('chicaEstado');
    estadoEl.textContent = caja.estado;
    estadoEl.className = 'badge-status ' + (abierta ? 'badge-active' : 'badge-inactive');

    document.getElementById('btnAbrirChica').classList.toggle('d-none', abierta);
    document.getElementById('btnCerrarChica').classList.toggle('d-none', !abierta);
    document.getElementById('btnCorteChica').classList.toggle('d-none', !abierta);
    document.getElementById('btnIngresarChica').disabled = !abierta;
    document.getElementById('btnGastoChica').disabled = !abierta;

    await cargarMovimientos();
    await cargarGastos();
    renderMovimientos();

    if (!abierta) {
      await abrirCaja();
    }
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function enPeriodoActual(fechaStr) {
  if (!state.caja || state.caja.estado !== 'ABIERTA') return false;
  const apertura = state.caja.fechaApertura ? new Date(state.caja.fechaApertura).getTime() : null;
  if (apertura === null) return false;
  const fecha = new Date(fechaStr).getTime();
  return !isNaN(fecha) && fecha >= apertura;
}

async function cargarMovimientos() {
  if (!state.caja) return;
  try {
    const movs = await API.get('/cajas/' + state.caja.idCaja + '/movimientos');
    state.movimientos = (movs || []).filter(m => enPeriodoActual(m.fecha));
  } catch (_) { state.movimientos = []; }
}

async function cargarGastos() {
  if (!state.caja) return;
  try {
    const gastos = await API.get('/gastos/caja/' + state.caja.idCaja);
    state.gastos = (gastos || []).filter(g => enPeriodoActual(g.fechaCreacion));
  } catch (_) { state.gastos = []; }
}

function movimientosCombinados() {
  const movs = (state.movimientos || []).map(m => ({
    fecha: m.fecha,
    tipo: m.tipo,
    titulo: m.motivo || '',
    estado: null,
    monto: m.monto,
    idGasto: null
  }));
  const gas = (state.gastos || []).map(g => ({
    fecha: g.fechaCreacion,
    tipo: 'GASTO',
    titulo: g.descripcion,
    estado: g.estado,
    monto: g.monto,
    idGasto: g.idGasto
  }));
  return [...movs, ...gas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function renderMovimientos() {
  const body = document.getElementById('tableChicaMovBody');
  const list = movimientosCombinados().filter(r =>
    state.filtroMov === 'todos' || r.tipo === state.filtroMov);
  if (!list || list.length === 0) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-exchange-alt"></i><p>Sin movimientos</p></div></td></tr>';
    return;
  }
  const badgeClass = {
    'PENDIENTE': 'badge-warning',
    'AUTORIZADO': 'badge-active',
    'RECHAZADO': 'badge-inactive',
  };
  body.innerHTML = list.map(r => {
    const esIngreso = r.tipo === 'INGRESO';
    const esGasto = r.tipo === 'GASTO';
    const monto = (esIngreso ? '+' : '-') + '$' + r.monto.toFixed(2);
    const montoColor = esIngreso ? 'var(--success)' : 'var(--danger)';
    const estado = r.estado
      ? `<span class="badge-status ${badgeClass[r.estado] || 'badge-inactive'}">${r.estado}</span>`
      : '-';
    const acciones = (esGasto && r.estado === 'PENDIENTE')
      ? `<button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${r.idGasto}" title="Acciones" ${(Utils.hasPermiso('GASTOS_AUTORIZAR') || Utils.hasPermiso('GASTOS_RECHAZAR')) ? '' : 'disabled style="opacity:.4"'}><i class="fas fa-ellipsis-v"></i></button>`
      : '-';
    return `<tr>
      <td>${Utils.formatDateTime(r.fecha)}</td>
      <td><span class="badge-status ${esIngreso ? 'badge-active' : 'badge-inactive'}">${r.tipo}</span></td>
      <td>${Utils.esc(r.titulo) || '-'}</td>
      <td>${estado}</td>
      <td style="color:${montoColor};font-weight:600">${monto}</td>
      <td class="acciones-cell">${acciones}</td>
    </tr>`;
  }).join('');
}

function handleGastosClick(e) {
  const kebab = e.target.closest('.kebab-trigger');
  if (kebab) {
    e.preventDefault();
    if (kebab.disabled) return;
    const id = parseInt(kebab.dataset.id);
    const items = [];
    if (Utils.hasPermiso('GASTOS_AUTORIZAR')) items.push({ icon: 'fa-check', text: 'Autorizar', color: 'var(--success)', onClick: () => confirmarAccionGasto(id, 'autorizar') });
    if (Utils.hasPermiso('GASTOS_RECHAZAR')) items.push({ danger: true, icon: 'fa-times', text: 'Rechazar', onClick: () => confirmarAccionGasto(id, 'rechazar') });
    if (items.length > 0) Utils.abrirMenuKebab(kebab, items);
    return;
  }
}

async function confirmarAccionGasto(id, accion) {
  const msg = accion === 'autorizar' ? '\u00bfAutorizar este gasto?' : '\u00bfRechazar este gasto?';
  const confirmed = await Utils.confirmAction(msg, 'Confirmar', accion === 'autorizar' ? 'Autorizar' : 'Rechazar');
  if (!confirmed) return;
  try {
    await API.post('/gastos/' + id + '/' + accion, {});
    Utils.showToast('Gasto ' + (accion === 'autorizar' ? 'autorizado' : 'rechazado'), 'success');
    await cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function abrirMovimientoModal() {
  if (!state.caja) return;
  document.getElementById('formChicaMovimiento').reset();
  document.getElementById('chicaMovimientoTitle').textContent = 'Ingreso a Caja Chica';
  new bootstrap.Modal(document.getElementById('chicaMovimientoModal')).show();
}

async function confirmarMovimiento() {
  if (!state.caja) return;
  const monto = parseFloat(document.getElementById('chicaMovMonto').value);
  const motivo = document.getElementById('chicaMovMotivo').value.trim();
  if (isNaN(monto) || monto <= 0) { Utils.showToast('Monto inv\u00e1lido', 'warning'); return; }
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/ingresos', { monto, motivo });
    Utils.showToast('Movimiento registrado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('chicaMovimientoModal'))?.hide();
    cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function abrirGastoModal() {
  if (!state.caja) return;
  document.getElementById('formChicaGasto').reset();
  document.getElementById('chicaGastoCajaInfo').textContent = 'Caja: ' + state.caja.nombre;
  new bootstrap.Modal(document.getElementById('chicaGastoModal')).show();
}

async function solicitarGasto() {
  if (!state.caja) return;
  const descripcion = document.getElementById('chicaGastoDesc').value.trim();
  const monto = parseFloat(document.getElementById('chicaGastoMonto').value);
  if (!descripcion) { Utils.showToast('La descripci\u00f3n es obligatoria', 'warning'); return; }
  if (isNaN(monto) || monto <= 0) { Utils.showToast('Monto inv\u00e1lido', 'warning'); return; }
  try {
    await API.post('/gastos', { idCaja: state.caja.idCaja, descripcion, monto });
    Utils.showToast('Gasto solicitado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('chicaGastoModal'))?.hide();
    cargarGastos();
    renderMovimientos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function abrirCaja() {
  if (!state.caja) return;
  const saldo = await Utils.promptInput('Abrir Caja Chica', '\u00bfCon cu\u00e1nto efectivo comienzas?', '0');
  if (saldo === null) return;
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/apertura', { saldoInicial: parseFloat(saldo) || 0 });
    Utils.showToast('Caja chica abierta', 'success');
    cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cerrarCaja() {
  if (!state.caja) return;
  const confirmed = await Utils.confirmAction('\u00bfCerrar caja chica? Al cerrar se generar\u00e1 el corte del per\u00edodo.', 'Confirmar', 'Cerrar');
  if (!confirmed) return;
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/cierre', {});
    Utils.showToast('Caja chica cerrada y corte generado', 'success');
    state.movimientos = [];
    state.gastos = [];
    renderMovimientos();
    cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function previewCorte() {
  if (!state.caja) return;
  try {
    const corte = await API.get('/cajas/' + state.caja.idCaja + '/corte-preview');
    const gastos = corte.gastos || [];
    const gastosHtml = (gastos.length === 0)
      ? '<div class="text-center text-muted small py-2">No hubo gastos en este per\u00edodo</div>'
      : '<div class="table-responsive"><table class="table table-custom table-sm mb-0">' +
        '<thead><tr><th>Descripci\u00f3n</th><th>Monto</th><th>Solicit\u00f3</th><th>Estado</th></tr></thead>' +
        '<tbody>' + gastos.map(g => {
          const badge = { 'PENDIENTE': 'badge-warning', 'AUTORIZADO': 'badge-active', 'RECHAZADO': 'badge-inactive' }[g.estado] || 'badge-inactive';
          return '<tr><td>' + Utils.esc(g.descripcion) + '</td>' +
            '<td>' + '<strong>$' + g.monto.toFixed(2) + '</strong></td>' +
            '<td>' + Utils.esc(g.usuario || '-') + '</td>' +
            '<td><span class="badge-status ' + badge + '">' + g.estado + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';

    document.getElementById('chicaCorteBody').innerHTML = `
      <div class="row g-3">
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Saldo Inicial</small>
          <h4 class="mb-0">$${corte.saldoInicial.toFixed(2)}</h4>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Ingresos</small>
          <h5 class="mb-0 text-success">$${corte.totalIngresos.toFixed(2)}</h5>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Egresos</small>
          <h5 class="mb-0 text-danger">$${corte.totalEgresos.toFixed(2)}</h5>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Total Gastos</small>
          <h5 class="mb-0 text-danger">$${corte.totalGastos.toFixed(2)}</h5>
        </div></div>
      </div>
      <hr>
      <h6 class="fw-semibold mb-2"><i class="fas fa-money-bill-wave me-1" style="color:var(--primary)"></i>Gastos del per\u00edodo</h6>
      ${gastosHtml}
      <hr>
      <div class="text-center">
        <h5>Saldo Esperado</h5>
        <h3 class="fw-bold" style="color:var(--primary)">$${corte.saldoEsperado.toFixed(2)}</h3>
      </div>
    `;
    new bootstrap.Modal(document.getElementById('chicaCorteModal')).show();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function realizarCorte() {
  if (!state.caja) return;
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/corte', {});
    Utils.showToast('Corte realizado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('chicaCorteModal'))?.hide();
    state.movimientos = [];
    state.gastos = [];
    renderMovimientos();
    await cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function listaMovimientosFiltrados() {
  return movimientosCombinados().filter(r =>
    state.filtroMov === 'todos' || r.tipo === state.filtroMov);
}

function exportarMovimientos(formato) {
  const list = listaMovimientosFiltrados();
  if (list.length === 0) { Utils.showToast('No hay movimientos para exportar', 'warning'); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  const headers = ['Fecha', 'Tipo', 'Concepto', 'Estado', 'Monto'];
  const rows = list.map(r => [
    Utils.formatDateTime(r.fecha),
    r.tipo,
    r.titulo || '',
    r.estado || '',
    (r.tipo === 'INGRESO' ? '+' : '-') + r.monto.toFixed(2)
  ]);
  if (formato === 'pdf') {
    const trs = list.map(r =>
      `<tr><td>${Utils.esc(Utils.formatDateTime(r.fecha))}</td>` +
      `<td>${Utils.esc(r.tipo)}</td>` +
      `<td>${Utils.esc(r.titulo || '-')}</td>` +
      `<td>${Utils.esc(r.estado || '-')}</td>` +
      `<td class="right">${(r.tipo === 'INGRESO' ? '+' : '-')}$${r.monto.toFixed(2)}</td></tr>`).join('');
    Utils.openPrintWindow('Movimientos de Caja Chica',
      '<h2>BONDS</h2><h4>Movimientos de Caja Chica</h4>' +
      '<p style="text-align:center;color:#666;font-size:11px">Caja: ' + Utils.esc(state.caja ? state.caja.nombre : '-') + '</p>' +
      '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Estado</th><th class="right">Monto</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table>');
  } else {
    Utils.downloadXls('movimientos-caja-chica_' + fecha + '.xls', 'Movimientos', headers, rows);
  }
}