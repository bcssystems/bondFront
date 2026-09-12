let state = {
  caja: null,
  movimientos: [],
  gastos: [],
  filtroMov: 'todos',
  filtroGasto: 'todos',
  fondo: 0
};

export function init() {
  bindEvents();
  cargarFondo();
  cargarCajaChica();
}

function bindEvents() {
  document.getElementById('btnIngresarChica')?.addEventListener('click', () => abrirMovimientoModal('INGRESO'));
  document.getElementById('btnEgresarChica')?.addEventListener('click', () => abrirMovimientoModal('EGRESO'));
  document.getElementById('btnGastoChica')?.addEventListener('click', abrirGastoModal);
  document.getElementById('btnConfirmarMovChica')?.addEventListener('click', confirmarMovimiento);
  document.getElementById('btnSolicitarGastoChica')?.addEventListener('click', solicitarGasto);
  document.getElementById('btnRealizarCorteChica')?.addEventListener('click', realizarCorte);
  document.getElementById('btnAbrirChica')?.addEventListener('click', abrirCaja);
  document.getElementById('btnCerrarChica')?.addEventListener('click', cerrarCaja);
  document.getElementById('btnCorteChica')?.addEventListener('click', previewCorte);
  document.getElementById('btnExportMovPDF')?.addEventListener('click', () => exportarMovimientos('pdf'));
  document.getElementById('btnExportMovExcel')?.addEventListener('click', () => exportarMovimientos('excel'));
  document.getElementById('btnExportGastoPDF')?.addEventListener('click', () => exportarGastos('pdf'));
  document.getElementById('btnExportGastoExcel')?.addEventListener('click', () => exportarGastos('excel'));

  document.querySelectorAll('input[name="filtroChicaMov"]').forEach(r => {
    r.addEventListener('change', e => {
      state.filtroMov = e.target.value;
      renderMovimientos();
    });
  });
  document.querySelectorAll('input[name="filtroChicaGasto"]').forEach(r => {
    r.addEventListener('change', e => {
      state.filtroGasto = e.target.value;
      renderGastos();
    });
  });
  document.getElementById('tableChicaGastoBody')?.addEventListener('click', handleGastosClick);
}

async function cargarFondo() {
  try {
    const list = await API.get('/configuraciones');
    const cfg = (list || []).find(c => c.clave === 'fondoCajaChica');
    state.fondo = cfg ? (parseFloat(cfg.valor) || 0) : 0;
  } catch (_) { state.fondo = 0; }
}

async function cargarCajaChica() {
  try {
    const cajas = await API.get('/cajas');
    const caja = (cajas || []).find(c => (c.tipo || 'NORMAL') === 'CHICA');
    if (!caja) {
      document.getElementById('chicaNombre').textContent = 'Sin caja chica';
      document.getElementById('chicaEstado').textContent = 'NO CONFIGURADA';
      document.getElementById('tableChicaMovBody').innerHTML =
        '<tr><td colspan="4"><div class="empty-state"><i class="fas fa-coins"></i><p>No hay caja chica configurada. Crea una caja de tipo CHICA en Cajas.</p></div></td></tr>';
      return;
    }
    state.caja = caja;
    document.getElementById('chicaNombre').textContent = caja.nombre;
    document.getElementById('chicaSaldo').textContent = '$' + (caja.saldoActual || 0).toFixed(2);
    document.getElementById('chicaFondo').textContent = '$' + state.fondo.toFixed(2);
    document.getElementById('chicaApertura').textContent = Utils.formatDateTime(caja.fechaApertura) || '--';

    const abierta = caja.estado === 'ABIERTA';
    const estadoEl = document.getElementById('chicaEstado');
    estadoEl.textContent = caja.estado;
    estadoEl.className = 'badge-status ' + (abierta ? 'badge-active' : 'badge-inactive');

    document.getElementById('btnAbrirChica').classList.toggle('d-none', abierta);
    document.getElementById('btnCerrarChica').classList.toggle('d-none', !abierta);
    document.getElementById('btnCorteChica').classList.toggle('d-none', !abierta);
    document.getElementById('btnIngresarChica').disabled = !abierta;
    document.getElementById('btnEgresarChica').disabled = !abierta;
    document.getElementById('btnGastoChica').disabled = !abierta;

    await cargarMovimientos();
    await cargarGastos();

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
    renderMovimientos();
  } catch (_) { state.movimientos = []; renderMovimientos(); }
}

function renderMovimientos() {
  const body = document.getElementById('tableChicaMovBody');
  const list = state.movimientos.filter(m =>
    state.filtroMov === 'todos' || m.tipo === state.filtroMov);
  if (!list || list.length === 0) {
    body.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fas fa-exchange-alt"></i><p>Sin movimientos</p></div></td></tr>';
    return;
  }
  body.innerHTML = list.map(m => {
    const esIngreso = m.tipo === 'INGRESO';
    return `<tr>
      <td>${Utils.formatDateTime(m.fecha)}</td>
      <td><span class="badge-status ${esIngreso ? 'badge-active' : 'badge-inactive'}">${m.tipo}</span></td>
      <td style="color:${esIngreso ? 'var(--success)' : 'var(--danger)'};font-weight:600">
        ${esIngreso ? '+' : '-'}$${m.monto.toFixed(2)}
      </td>
      <td>${Utils.esc(m.motivo) || '-'}</td>
    </tr>`;
  }).join('');
}

async function cargarGastos() {
  if (!state.caja) return;
  try {
    const gastos = await API.get('/gastos/caja/' + state.caja.idCaja);
    state.gastos = (gastos || []).filter(g => enPeriodoActual(g.fechaCreacion));
    renderGastos();
  } catch (_) { state.gastos = []; renderGastos(); }
}

function renderGastos() {
  const body = document.getElementById('tableChicaGastoBody');
  const list = state.filtroGasto === 'todos'
    ? state.gastos
    : state.gastos.filter(g => g.estado === state.filtroGasto);
  if (!list || list.length === 0) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-money-bill-wave"></i><p>Sin gastos</p></div></td></tr>';
    return;
  }
  const badgeClass = {
    'PENDIENTE': 'badge-warning',
    'AUTORIZADO': 'badge-active',
    'RECHAZADO': 'badge-inactive',
  }[list[0]?.estado];
  body.innerHTML = list.map(g => `<tr>
    <td>${Utils.esc(g.descripcion)}</td>
    <td><strong>$${g.monto.toFixed(2)}</strong></td>
    <td>${Utils.esc(g.usuario) || '-'}</td>
    <td><span class="badge-status ${badgeClass || 'badge-inactive'}">${g.estado}</span></td>
    <td>${Utils.formatDateTime(g.fechaCreacion)}</td>
    <td class="acciones-cell">
      ${g.estado === 'PENDIENTE'
        ? `<button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${g.idGasto}" title="Acciones" ${(Utils.hasPermiso('GASTOS_AUTORIZAR') || Utils.hasPermiso('GASTOS_RECHAZAR')) ? '' : 'disabled style="opacity:.4"'}><i class="fas fa-ellipsis-v"></i></button>`
        : '-'}
    </td>
  </tr>`).join('');
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
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'autorizar') confirmarAccionGasto(id, 'autorizar');
  else if (action === 'rechazar') confirmarAccionGasto(id, 'rechazar');
}

async function confirmarAccionGasto(id, accion) {
  const msg = accion === 'autorizar' ? '\u00bfAutorizar este gasto?' : '\u00bfRechazar este gasto?';
  const confirmed = await Utils.confirmAction(msg, 'Confirmar', accion === 'autorizar' ? 'Autorizar' : 'Rechazar');
  if (!confirmed) return;
  try {
    await API.post('/gastos/' + id + '/' + accion, {});
    Utils.showToast('Gasto ' + (accion === 'autorizar' ? 'autorizado' : 'rechazado'), 'success');
    cargarGastos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function abrirMovimientoModal(tipo) {
  if (!state.caja) return;
  document.getElementById('formChicaMovimiento').reset();
  document.getElementById('chicaMovTipo').value = tipo;
  document.getElementById('chicaMovimientoTitle').textContent =
    tipo === 'INGRESO' ? 'Ingreso a Caja Chica' : 'Egreso de Caja Chica';
  new bootstrap.Modal(document.getElementById('chicaMovimientoModal')).show();
}

async function confirmarMovimiento() {
  if (!state.caja) return;
  const tipo = document.getElementById('chicaMovTipo').value;
  const monto = parseFloat(document.getElementById('chicaMovMonto').value);
  const motivo = document.getElementById('chicaMovMotivo').value.trim();
  if (isNaN(monto) || monto <= 0) { Utils.showToast('Monto inv&aacute;lido', 'warning'); return; }
  const endpoint = tipo === 'INGRESO' ? '/cajas/' + state.caja.idCaja + '/ingresos' : '/cajas/' + state.caja.idCaja + '/egresos';
  try {
    await API.post(endpoint, { monto, motivo });
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
  if (!descripcion) { Utils.showToast('La descripci&oacute;n es obligatoria', 'warning'); return; }
  if (isNaN(monto) || monto <= 0) { Utils.showToast('Monto inv&aacute;lido', 'warning'); return; }
  try {
    await API.post('/gastos', { idCaja: state.caja.idCaja, descripcion, monto });
    Utils.showToast('Gasto solicitado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('chicaGastoModal'))?.hide();
    cargarGastos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function abrirCaja() {
  if (!state.caja) return;
  const saldo = await Utils.promptInput('Abrir Caja Chica', '\u00bfCon cu\u00e1nto efectivo comienzas?', String(state.fondo));
  if (saldo === null) return;
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/apertura', { saldoInicial: parseFloat(saldo) || 0 });
    Utils.showToast('Caja chica abierta', 'success');
    cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cerrarCaja() {
  if (!state.caja) return;
  const confirmed = await Utils.confirmAction('\u00bfCerrar caja chica?', 'Confirmar', 'Cerrar');
  if (!confirmed) return;
  try {
    await API.post('/cajas/' + state.caja.idCaja + '/cierre', {});
    Utils.showToast('Caja chica cerrada', 'success');
    state.movimientos = [];
    state.gastos = [];
    renderMovimientos();
    renderGastos();
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
    renderGastos();
    await cargarCajaChica();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function listaMovimientosFiltrados() {
  return state.movimientos.filter(m =>
    state.filtroMov === 'todos' || m.tipo === state.filtroMov);
}

function listaGastosFiltrados() {
  return state.filtroGasto === 'todos'
    ? state.gastos
    : state.gastos.filter(g => g.estado === state.filtroGasto);
}

function exportarMovimientos(formato) {
  const list = listaMovimientosFiltrados();
  if (list.length === 0) { Utils.showToast('No hay movimientos para exportar', 'warning'); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  const headers = ['Fecha', 'Tipo', 'Monto', 'Motivo'];
  const rows = list.map(m => [
    Utils.formatDateTime(m.fecha),
    m.tipo,
    (m.tipo === 'INGRESO' ? '+' : '-') + m.monto.toFixed(2),
    m.motivo || ''
  ]);
  if (formato === 'pdf') {
    const trs = list.map(m =>
      `<tr><td>${Utils.esc(Utils.formatDateTime(m.fecha))}</td>` +
      `<td>${Utils.esc(m.tipo)}</td>` +
      `<td class="right">${(m.tipo === 'INGRESO' ? '+' : '-')}$${m.monto.toFixed(2)}</td>` +
      `<td>${Utils.esc(m.motivo || '-')}</td></tr>`).join('');
    Utils.openPrintWindow('Movimientos de Caja Chica',
      '<h2>BONDS</h2><h4>Movimientos de Caja Chica</h4>' +
      '<p style="text-align:center;color:#666;font-size:11px">Caja: ' + Utils.esc(state.caja ? state.caja.nombre : '-') + '</p>' +
      '<table><thead><tr><th>Fecha</th><th>Tipo</th><th class="right">Monto</th><th>Motivo</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table>');
  } else {
    Utils.downloadXls('movimientos-caja-chica_' + fecha + '.xls', 'Movimientos', headers, rows);
  }
}

function exportarGastos(formato) {
  const list = listaGastosFiltrados();
  if (list.length === 0) { Utils.showToast('No hay gastos para exportar', 'warning'); return; }
  const fecha = new Date().toISOString().slice(0, 10);
  const headers = ['Descripcion', 'Monto', 'Solicito', 'Estado', 'Fecha'];
  const rows = list.map(g => [
    g.descripcion,
    g.monto.toFixed(2),
    g.usuario || '',
    g.estado,
    Utils.formatDateTime(g.fechaCreacion)
  ]);
  if (formato === 'pdf') {
    const trs = list.map(g =>
      `<tr><td>${Utils.esc(g.descripcion)}</td>` +
      `<td class="right">$${g.monto.toFixed(2)}</td>` +
      `<td>${Utils.esc(g.usuario || '-')}</td>` +
      `<td>${Utils.esc(g.estado)}</td>` +
      `<td>${Utils.esc(Utils.formatDateTime(g.fechaCreacion))}</td></tr>`).join('');
    Utils.openPrintWindow('Gastos de Caja Chica',
      '<h2>BONDS</h2><h4>Gastos de Caja Chica</h4>' +
      '<p style="text-align:center;color:#666;font-size:11px">Caja: ' + Utils.esc(state.caja ? state.caja.nombre : '-') + '</p>' +
      '<table><thead><tr><th>Descripcion</th><th class="right">Monto</th><th>Solicito</th><th>Estado</th><th>Fecha</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table>');
  } else {
    Utils.downloadXls('gastos-caja-chica_' + fecha + '.xls', 'Gastos', headers, rows);
  }
}