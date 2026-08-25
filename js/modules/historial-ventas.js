let state = {
  page: 0,
  totalPages: 0,
  size: 15,
};

export function init() {
  bindEvents();
  cargarSucursales();
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
    const btn = e.target.closest('[data-detalle]');
    if (btn) verDetalle(parseInt(btn.dataset.detalle));
  });
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
      let totalMonto = 0, completadas = 0, canceladas = 0;
      body.innerHTML = ventas.map(v => {
        totalMonto += v.total || 0;
        if (v.estado === 'COMPLETADA') completadas++;
        else if (v.estado === 'CANCELADA') canceladas++;
        return `<tr class="${v.estado === 'CANCELADA' ? 'text-muted' : ''}">
          <td>${v.idVenta}</td>
          <td>${Utils.esc(v.sucursalNombre || '')}</td>
          <td>${Utils.esc(v.cajaNombre || '')}</td>
          <td>${v.clienteNombre ? Utils.esc(v.clienteNombre) : 'Mostrador'}</td>
          <td class="fw-semibold">$${(v.total || 0).toFixed(2)}</td>
          <td><span class="badge ${v.estado === 'COMPLETADA' ? 'bg-success' : v.estado === 'CANCELADA' ? 'bg-danger' : 'bg-warning'}">${v.estado}</span></td>
          <td>${Utils.formatDateTime(v.fecha)}</td>
          <td><button class="btn btn-sm btn-outline-info" data-detalle="${v.idVenta}" title="Ver detalle"><i class="fas fa-eye"></i></button></td>
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

async function verDetalle(id) {
  try {
    const venta = await API.get('/ventas/' + id);
    const detallesHtml = (venta.detalles || []).map(d =>
      `<tr>
        <td>${d.productoNombre ? Utils.esc(d.productoNombre) : Utils.esc(d.descripcion || '')}</td>
        <td>${d.cantidad}</td>
        <td>$${(d.precioUnitario || 0).toFixed(2)}</td>
        <td>$${(d.subtotal || 0).toFixed(2)}</td>
      </tr>`
    ).join('');

    document.getElementById('detalleBody').innerHTML =
      `<div class="small mb-3 p-2 bg-light rounded">
        <div class="row g-2">
          <div class="col-4"><strong>Caja:</strong> ${Utils.esc(venta.cajaNombre || '')}</div>
          <div class="col-4"><strong>Cliente:</strong> ${venta.clienteNombre ? Utils.esc(venta.clienteNombre) : 'Mostrador'}</div>
          <div class="col-4"><strong>Total:</strong> <span class="fw-bold" style="color:var(--primary)">$${(venta.total || 0).toFixed(2)}</span></div>
          <div class="col-4"><strong>Subtotal:</strong> $${(venta.subtotal || 0).toFixed(2)}</div>
          <div class="col-4"><strong>Descuento:</strong> $${(venta.descuento || 0).toFixed(2)}</div>
          <div class="col-4"><strong>Estado:</strong> <span class="badge ${venta.estado === 'COMPLETADA' ? 'bg-success' : venta.estado === 'CANCELADA' ? 'bg-danger' : 'bg-warning'}">${venta.estado}</span></div>
        </div>
      </div>
      <table class="table table-sm table-custom mb-0">
        <thead><tr><th>Producto</th><th>Cant</th><th>P/U</th><th>Subtotal</th></tr></thead>
        <tbody>${detallesHtml || '<tr><td colspan="4" class="text-muted">Sin detalles</td></tr>'}</tbody>
      </table>`;

    new bootstrap.Modal(document.getElementById('detalleModal')).show();
  } catch (_) {
    Utils.showToast('Error al cargar detalle', 'error');
  }
}