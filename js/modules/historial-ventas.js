let state = {
  page: 0,
  totalPages: 0,
  size: 15,
};

export function init() {
  const today = new Date().toISOString().slice(0, 10);
  const desdeEl = document.getElementById('filterDesde');
  const hastaEl = document.getElementById('filterHasta');
  if (desdeEl) desdeEl.value = today;
  if (hastaEl) hastaEl.value = today;
  bindEvents();
  cargarSucursales();
  buscar(0);
}

function bindEvents() {
  document.getElementById('btnFiltrar')?.addEventListener('click', () => buscar(0));
  document.getElementById('btnLimpiar')?.addEventListener('click', limpiar);
  document.getElementById('filterSucursal')?.addEventListener('change', async (e) => {
    const idSucursal = parseInt(e.target.value);
    const selCaja = document.getElementById('filterCaja');
    selCaja.innerHTML = '<option value="">Todas</option>';
    if (idSucursal) {
      try {
        const cajas = await API.get('/cajas/sucursal/' + idSucursal);
        selCaja.innerHTML += cajas.map(c => `<option value="${c.idCaja}">${Utils.esc(c.nombre)}</option>`).join('');
      } catch (_) {}
    }
  });
  document.getElementById('tableBody')?.addEventListener('click', (e) => {
    const kebab = e.target.closest('.kebab-trigger');
    if (kebab) {
      e.preventDefault();
      abrirAccionesVenta(kebab, parseInt(kebab.dataset.venta), kebab.dataset.estado);
      return;
    }
    const detalle = e.target.closest('[data-detalle]');
    if (detalle) { e.preventDefault(); verDetalle(parseInt(detalle.dataset.detalle)); return; }
    const factura = e.target.closest('[data-factura]');
    if (factura) { e.preventDefault(); imprimirRemision(parseInt(factura.dataset.factura)); return; }
    const cancelar = e.target.closest('[data-cancelar]');
    if (cancelar) { e.preventDefault(); solicitarCancelacion(parseInt(cancelar.dataset.cancelar)); return; }
    const aprobar = e.target.closest('[data-aprobar]');
    if (aprobar) { e.preventDefault(); autorizarCancelacion(parseInt(aprobar.dataset.aprobar)); return; }
    const rechazar = e.target.closest('[data-rechazar]');
    if (rechazar) { e.preventDefault(); rechazarCancelacion(parseInt(rechazar.dataset.rechazar)); return; }
  });
}

function abrirAccionesVenta(anchor, id, estado) {
  const items = [
    { icon: 'fa-eye', text: 'Ver detalle', color: 'var(--primary)', onClick: () => verDetalle(id) },
    { icon: 'fa-print', text: 'Imprimir remisi\u00f3n', color: 'var(--success)', onClick: () => imprimirRemision(id) },
  ];
  if (estado === 'COMPLETADA') {
    items.push({ danger: true, icon: 'fa-ban', text: 'Solicitar cancelaci\u00f3n', onClick: () => solicitarCancelacion(id) });
  } else if (estado === 'SOLICITADA_CANCELACION') {
    items.push({ icon: 'fa-check', text: 'Autorizar cancelaci\u00f3n', color: 'var(--success)', onClick: () => autorizarCancelacion(id) });
    items.push({ icon: 'fa-undo', text: 'Rechazar cancelaci\u00f3n', color: 'var(--warning)', onClick: () => rechazarCancelacion(id) });
  }
  Utils.abrirMenuKebab(anchor, items);
}

async function cargarSucursales() {
  try {
    const sucursales = await API.get('/sucursales');
    const sel = document.getElementById('filterSucursal');
    sel.innerHTML = '<option value="">Todas</option>' +
      sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
  } catch (_) {}
}

function limpiar() {
  document.getElementById('filterSucursal').value = '';
  document.getElementById('filterCaja').innerHTML = '<option value="">Todas</option>';
  document.getElementById('filterEstado').value = '';
  document.getElementById('filterDesde').value = '';
  document.getElementById('filterHasta').value = '';
  document.getElementById('statsRow').classList.add('d-none');
  document.getElementById('tableBody').innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-receipt"></i><p>Selecciona filtros y presiona Buscar</p></div></td></tr>';
  document.getElementById('pagination').innerHTML = '';
}

async function buscar(page) {
  state.page = page;
  const body = document.getElementById('tableBody');
  if (!body) return;

  const params = new URLSearchParams();
  params.set('page', page);
  params.set('size', state.size);

  const idSucursal = parseInt(document.getElementById('filterSucursal').value);
  const idCaja = parseInt(document.getElementById('filterCaja').value);
  const estado = document.getElementById('filterEstado').value;
  const desde = document.getElementById('filterDesde').value;
  const hasta = document.getElementById('filterHasta').value;

  if (idSucursal) params.set('idSucursal', idSucursal);
  if (idCaja) params.set('idCaja', idCaja);
  if (estado) params.set('estado', estado);
  if (desde) params.set('fechaInicio', desde + 'T00:00:00');
  if (hasta) params.set('fechaFin', hasta + 'T23:59:59');

  body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div></td></tr>';

  try {
    const result = await API.get('/ventas?' + params.toString());
    const ventas = result.content || [];
    state.totalPages = result.totalPages;

    if (ventas.length === 0) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-receipt"></i><p>Sin resultados</p></div></td></tr>';
      document.getElementById('statsRow').classList.add('d-none');
    } else {
      let totalMonto = 0, completadas = 0, canceladas = 0, pendientes = 0;
      body.innerHTML = ventas.map(v => {
        totalMonto += v.total || 0;
        if (v.estado === 'COMPLETADA') completadas++;
        else if (v.estado === 'CANCELADA') canceladas++;
        else if (v.estado === 'SOLICITADA_CANCELACION') pendientes++;

        const estadoBadge = v.estado === 'COMPLETADA' ? 'bg-success'
          : v.estado === 'CANCELADA' ? 'bg-danger'
          : v.estado === 'SOLICITADA_CANCELACION' ? 'bg-warning text-dark'
          : 'bg-secondary';

        let acciones = `
          <button type="button" class="btn-kebab-toggle kebab-trigger" data-venta="${v.idVenta}" data-estado="${v.estado}" title="Acciones"><i class="fas fa-ellipsis-v"></i></button>`;

        return `<tr class="${v.estado === 'CANCELADA' ? 'text-muted' : ''}">
          <td>${v.idVenta}</td>
          <td>${Utils.esc(v.sucursalNombre || '')}</td>
          <td>${Utils.esc(v.cajaNombre || '')}</td>
          <td>${v.clienteNombre ? Utils.esc(v.clienteNombre) : 'Mostrador'}</td>
          <td class="fw-semibold">$${(v.total || 0).toFixed(2)}</td>
          <td><span class="badge ${estadoBadge}">${v.estado}</span></td>
          <td>${Utils.formatDateTime(v.fecha)}</td>
          <td class="acciones-cell">${acciones}</td>
        </tr>`;
      }).join('');

      document.getElementById('statsCount').textContent = ventas.length;
      document.getElementById('statsTotal').textContent = '$' + totalMonto.toFixed(2);
      document.getElementById('statsCompletadas').textContent = completadas;
      document.getElementById('statsCanceladas').textContent = canceladas;
      document.getElementById('statsRow').classList.remove('d-none');
    }

    renderPagination();
  } catch (_) {
    body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al consultar</p></div></td></tr>';
  }
}

function renderPagination() {
  const container = document.getElementById('pagination');
  if (!container) return;
  if (state.totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';
  html += `<li class="page-item ${state.page === 0 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${state.page - 1}"><i class="fas fa-chevron-left"></i></a></li>`;

  for (let i = 0; i < state.totalPages; i++) {
    if (i === 0 || i === state.totalPages - 1 || (i >= state.page - 2 && i <= state.page + 2)) {
      html += `<li class="page-item ${i === state.page ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i + 1}</a></li>`;
    } else if (i === state.page - 3 || i === state.page + 3) {
      html += '<li class="page-item disabled"><a class="page-link" href="#">...</a></li>';
    }
  }

  html += `<li class="page-item ${state.page === state.totalPages - 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${state.page + 1}"><i class="fas fa-chevron-right"></i></a></li>`;
  html += '</ul></nav>';
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const p = parseInt(el.dataset.page);
      if (p >= 0 && p < state.totalPages) buscar(p);
    });
  });
}

async function solicitarCancelacion(id) {
  const motivo = await Utils.promptInput('Motivo de la cancelaci\u00f3n', 'Escribe el motivo...');
  if (!motivo) return;
  try {
    await API.post('/ventas/' + id + '/solicitar-cancelacion', { motivo });
    Utils.showToast('Solicitud enviada. Espera autorizaci\u00f3n del administrador', 'success');
    buscar(state.page);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function autorizarCancelacion(id) {
  const ok = await Utils.confirm('Autorizar la cancelaci\u00f3n de la venta #' + id + '? Se revertir\u00e1 el stock.');
  if (!ok) return;
  try {
    await API.post('/ventas/' + id + '/cancelar', {});
    Utils.showToast('Venta cancelada exitosamente', 'success');
    buscar(state.page);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function rechazarCancelacion(id) {
  const ok = await Utils.confirm('Rechazar la solicitud de cancelaci\u00f3n del cliente #' + id + '? La venta queda completada.');
  if (!ok) return;
  try {
    await API.post('/ventas/' + id + '/rechazar-cancelacion');
    Utils.showToast('Solicitud rechazada', 'success');
    buscar(state.page);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function imprimirRemision(id) {
  try {
    const venta = await API.get('/ventas/' + id);
    imprimirTicket(venta);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function imprimirTicket(venta) {
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
    ${isCredit ? creditHtml : ''}
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

async function verDetalle(id) {
  try {
    const venta = await API.get('/ventas/' + id);
    const detallesHtml = (venta.detalles || []).map(d => {
      const unidad = (d.unidadMedida || 'UNIDAD').toLowerCase();
      return `<tr>
        <td>${d.productoNombre ? Utils.esc(d.productoNombre) : Utils.esc(d.descripcion || '')}</td>
        <td class="center">${d.cantidad} ${Utils.esc(unidad)}</td>
        <td class="right">$${(d.precioUnitario || 0).toFixed(2)}</td>
        <td class="right">$${(d.subtotal || 0).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const estadoBadge = venta.estado === 'COMPLETADA' ? 'bg-success'
        : venta.estado === 'CANCELADA' ? 'bg-danger'
        : venta.estado === 'SOLICITADA_CANCELACION' ? 'bg-warning text-dark'
        : 'bg-secondary';

    const motivoHtml = (venta.motivoCancelacion && (venta.estado === 'SOLICITADA_CANCELACION' || venta.estado === 'CANCELADA'))
      ? `<div class="col-12"><strong>Motivo de cancelaci\u00f3n:</strong> ${Utils.esc(venta.motivoCancelacion)}${venta.solicitanteCancelacion ? ' <small class="text-muted">(solicitado por ' + Utils.esc(venta.solicitanteCancelacion) + ')</small>' : ''}</div>`
      : '';

    document.getElementById('detalleBody').innerHTML =
      `<div class="small mb-3 p-2 bg-light rounded">
        <div class="row g-2">
          <div class="col-4"><strong>Caja:</strong> ${Utils.esc(venta.cajaNombre || '')}</div>
          <div class="col-4"><strong>Cliente:</strong> ${venta.clienteNombre ? Utils.esc(venta.clienteNombre) : 'Mostrador'}</div>
          <div class="col-4"><strong>Total:</strong> <span class="fw-bold" style="color:var(--primary)">$${(venta.total || 0).toFixed(2)}</span></div>
          <div class="col-4"><strong>Subtotal:</strong> $${(venta.subtotal || 0).toFixed(2)}</div>
          <div class="col-4"><strong>Descuento:</strong> $${(venta.descuento || 0).toFixed(2)}</div>
          <div class="col-4"><strong>Estado:</strong> <span class="badge ${estadoBadge}">${venta.estado}</span></div>
          ${venta.folioPagare ? `<div class="col-4"><strong>Pagar\u00e9:</strong> ${Utils.esc(venta.folioPagare)}</div>` : ''}
          ${motivoHtml}
      <table class="table table-sm table-custom mb-0">
        <thead><tr><th>Producto</th><th>Cant</th><th>P/U</th><th>Subtotal</th></tr></thead>
        <tbody>${detallesHtml || '<tr><td colspan="4" class="text-muted">Sin detalles</td></tr>'}</tbody>
      </table>`;

    new bootstrap.Modal(document.getElementById('detalleModal')).show();
  } catch (_) {
    Utils.showToast('Error al cargar detalle', 'error');
  }
}