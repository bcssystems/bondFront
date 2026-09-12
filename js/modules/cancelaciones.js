let state = { pendientes: [] };

export function init() {
  if (!Utils.hasPermiso('CANCELACIONES_VER')) {
    const body = document.getElementById('cancelacionesBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="10"><div class="empty-state"><i class="fas fa-lock"></i><p>Acceso restringido.</p></div></td></tr>';
    }
    return;
  }
  bindEvents();
  cargarPendientes();
}

function bindEvents() {
  document.getElementById('cancelacionesBody')?.addEventListener('click', handleTableClick);
}

async function cargarPendientes() {
  const body = document.getElementById('cancelacionesBody');
  if (!body) return;
  try {
    const res = await API.get('/ventas?estado=SOLICITADA_CANCELACION&size=200');
    state.pendientes = res.content || res || [];
    renderTable();
  } catch (err) {
    state.pendientes = [];
    renderTable();
  }
}

function renderTable() {
  const body = document.getElementById('cancelacionesBody');
  document.getElementById('cancelStatsRow')?.classList.remove('d-none');
  const pendientes = (document.getElementById('cancelStatsPendientes'));
  if (pendientes) pendientes.textContent = state.pendientes.length;

  let monto = 0, contado = 0, credito = 0;
  state.pendientes.forEach(v => {
    monto += v.total || 0;
    if (v.tipoVenta === 'CREDITO') credito++;
    else contado++;
  });
  const elMonto = document.getElementById('cancelStatsMonto');
  if (elMonto) elMonto.textContent = '$' + monto.toFixed(2);
  const elContado = document.getElementById('cancelStatsContado');
  if (elContado) elContado.textContent = contado;
  const elCredito = document.getElementById('cancelStatsCredito');
  if (elCredito) elCredito.textContent = credito;

  if (!state.pendientes.length) {
    body.innerHTML = '<tr><td colspan="10"><div class="empty-state"><i class="fas fa-check-double"></i><p>Sin solicitudes de cancelaci&oacute;n pendientes</p></div></td></tr>';
    return;
  }

  body.innerHTML = state.pendientes.map(v => `<tr>
    <td><span class="badge-status badge-warning">#${v.idVenta}</span></td>
    <td>${Utils.esc(v.sucursalNombre || '')}</td>
    <td>${Utils.esc(v.cajaNombre || '')}</td>
    <td>${v.clienteNombre ? Utils.esc(v.clienteNombre) : 'Mostrador'}</td>
    <td class="fw-semibold">$${(v.total || 0).toFixed(2)}</td>
    <td><span class="badge ${v.tipoVenta === 'CREDITO' ? 'bg-info text-dark' : 'bg-secondary'}">${v.tipoVenta === 'CREDITO' ? 'Cr\u00e9dito' : 'Contado'}</span></td>
    <td>${Utils.esc(v.solicitanteCancelacion || '-')}</td>
    <td style="max-width:220px">${Utils.esc(v.motivoCancelacion || '-')}</td>
    <td>${Utils.formatDateTime(v.fechaSolicitudCancelacion)}</td>
    <td class="acciones-cell">
      <button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${v.idVenta}" title="Acciones"><i class="fas fa-ellipsis-v"></i></button>
    </td>
  </tr>`).join('');
}

function handleTableClick(e) {
  const kebab = e.target.closest('.kebab-trigger');
  if (kebab) {
    e.preventDefault();
    const id = parseInt(kebab.dataset.id);
    const items = [
      { icon: 'fa-eye', text: 'Ver detalle', color: 'var(--info)', onClick: () => verDetalle(id) },
    ];
    if (Utils.hasPermiso('CANCELACIONES_AUTORIZAR')) {
      items.push({ icon: 'fa-check', text: 'Autorizar cancelaci\u00f3n', color: 'var(--success)', onClick: () => autorizar(id) });
      items.push({ icon: 'fa-undo', text: 'Rechazar solicitud', color: 'var(--warning)', onClick: () => rechazar(id) });
    }
    Utils.abrirMenuKebab(kebab, items);
    return;
  }
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'ver') verDetalle(id);
  else if (action === 'autorizar') autorizar(id);
  else if (action === 'rechazar') rechazar(id);
}

async function verDetalle(id) {
  try {
    const venta = await API.get('/ventas/' + id);
    const detalles = (venta.detalles || []).map(d =>
      '<tr><td>' + Utils.esc(d.productoNombre || d.descripcion || 'Producto') + '</td><td class="text-center">' + d.cantidad +
      '</td><td>$' + (d.precioUnitario || 0).toFixed(2) + '</td><td>$' + (d.subtotal || 0).toFixed(2) + '</td></tr>'
    ).join('');
    const bodyHtml =
      '<div class="small mb-3 p-2 bg-light rounded"><div class="row g-2">' +
        '<div class="col-6"><strong>Caja:</strong> ' + Utils.esc(venta.cajaNombre || '') + '</div>' +
        '<div class="col-6"><strong>Cliente:</strong> ' + (venta.clienteNombre ? Utils.esc(venta.clienteNombre) : 'Mostrador') + '</div>' +
        '<div class="col-6"><strong>Total:</strong> <span class="fw-bold" style="color:var(--primary)">$' + (venta.total || 0).toFixed(2) + '</span></div>' +
        '<div class="col-6"><strong>Tipo:</strong> ' + venta.tipoVenta + '</div>' +
        '<div class="col-12"><strong>Motivo:</strong> ' + Utils.esc(venta.motivoCancelacion || '-') +
          ' <small class="text-muted">(solicitado por ' + Utils.esc(venta.solicitanteCancelacion || '-') + ' el ' + Utils.formatDateTime(venta.fechaSolicitudCancelacion) + ')</small></div>' +
      '</div></div>' +
      '<div class="table-responsive"><table class="table table-sm table-custom mb-0"><thead><tr><th>Producto</th><th>Cant</th><th>P/U</th><th>Subtotal</th></tr></thead>' +
      '<tbody>' + (detalles || '<tr><td colspan="4" class="text-muted">Sin detalles</td></tr>') + '</tbody></table></div>';
    Utils.showDialog('Detalle de Venta #' + id, bodyHtml);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function autorizar(id) {
  const ok = await Utils.confirm('Autorizar la cancelaci&oacute;n de la venta #' + id + '? Se revertir&aacute; el stock, el saldo de la caja y el cr&eacute;dito en su caso.', 'Autorizar cancelaci&oacute;n');
  if (!ok) return;
  try {
    await API.post('/ventas/' + id + '/cancelar', {});
    Utils.showToast('Venta #' + id + ' cancelada exitosamente', 'success');
    cargarPendientes();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function rechazar(id) {
  const ok = await Utils.confirm('Rechazar la solicitud de cancelaci&oacute;n de la venta #' + id + '? La venta queda como completada.', 'Rechazar solicitud');
  if (!ok) return;
  try {
    await API.post('/ventas/' + id + '/rechazar-cancelacion');
    Utils.showToast('Solicitud rechazada. Venta #' + id + ' sigue completada', 'success');
    cargarPendientes();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}