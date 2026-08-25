let state = {
  data: [],
  currentPage: 0,
  totalPages: 0,
  pageSize: 10,
  editingId: null,
  detalles: [],
  editingDetalleIdx: null,
  productosCatalogo: [],
  parentCostMap: {},
  sucursales: [],
  proveedores: [],
};

export function init() {
  bindEvents();
  cargarPedidos(0);
}

function bindEvents() {
  document.getElementById('btnNuevoPedido')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarPedido')?.addEventListener('click', guardarPedido);
  document.getElementById('tablePedidosBody')?.addEventListener('click', handleTableClick);
  document.getElementById('btnAgregarProductoPedido')?.addEventListener('click', () => abrirModalDetalle(null));
  document.getElementById('btnGuardarPedidoDetalle')?.addEventListener('click', guardarPedidoDetalle);
  document.getElementById('btnConfirmarRecepcion')?.addEventListener('click', confirmarRecepcion);
  document.getElementById('searchPedido')?.addEventListener('input', Utils.debounce(() => {
    cargarPedidos(0);
  }, 400));
  document.getElementById('filterEstado')?.addEventListener('change', () => cargarPedidos(0));
  document.getElementById('filterProveedor')?.addEventListener('change', () => cargarPedidos(0));
}

async function cargarProveedoresSelect() {
  try {
    state.proveedores = await API.get('/proveedores/activos');
    const sel = document.getElementById('pedidoProveedor');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar...</option>' +
        state.proveedores.map(p => `<option value="${p.idProveedor}">${Utils.esc(p.nombre)}</option>`).join('');
      Utils.makeSearchableSelect('pedidoProveedor');
    }
    const filter = document.getElementById('filterProveedor');
    if (filter) {
      filter.innerHTML = '<option value="">Todos los proveedores</option>' +
        state.proveedores.map(p => `<option value="${p.idProveedor}">${Utils.esc(p.nombre)}</option>`).join('');
    }
  } catch (_) {}
}

async function cargarSucursalesSelect() {
  try {
    state.sucursales = await API.get('/sucursales');
    const sel = document.getElementById('pedidoSucursal');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar...</option>' +
        state.sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
      Utils.makeSearchableSelect('pedidoSucursal');
    }
  } catch (_) {}
}

async function cargarProductosCatalogo() {
  try {
    const result = await API.get('/productos?activo=true&page=0&size=500&sort=nombre,ASC');
    const all = result.content || [];
    state.parentCostMap = {};
    all.forEach(p => {
      if (p.tieneVariantes && !p.idProductoPadre) {
        state.parentCostMap[p.idProducto] = p.costoPromedio;
      }
    });
    state.productosCatalogo = all.filter(p => !p.tieneVariantes || p.idProductoPadre != null);
  } catch (_) {
    state.productosCatalogo = [];
    state.parentCostMap = {};
  }
}

async function cargarPedidos(page) {
  state.currentPage = page;
  const search = document.getElementById('searchPedido')?.value || '';
  const estado = document.getElementById('filterEstado')?.value || '';
  const idProveedor = document.getElementById('filterProveedor')?.value || '';
  try {
    let url = '/pedidos?search=' + encodeURIComponent(search) + '&page=' + page + '&size=' + state.pageSize;
    if (estado) url += '&estado=' + estado;
    if (idProveedor) url += '&idProveedor=' + idProveedor;
    const result = await API.get(url);
    state.data = result.content;
    state.totalPages = result.totalPages;
    renderTable();
    renderPagination();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderTable() {
  const tbody = document.getElementById('tablePedidosBody');
  if (!tbody) return;

  if (!state.data || state.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay pedidos</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.data.map(p => {
    const total = (p.detalles || []).reduce((sum, d) => sum + (d.subtotal || 0), 0);
    const estadoBadge = getEstadoBadge(p.estado);
    return `<tr>
      <td><strong>${Utils.esc(p.folio)}</strong></td>
      <td>${Utils.esc(p.proveedorNombre)}</td>
      <td>${Utils.esc(p.sucursalNombre)}</td>
      <td>${estadoBadge}</td>
      <td class="text-end">$${total.toFixed(2)}</td>
      <td>${Utils.formatDateTime(p.fechaCreacion)}</td>
      <td class="acciones-cell">
        <button class="btn-action btn-action-view" data-id="${p.idPedido}" data-action="view" title="Ver detalle"><i class="fas fa-eye"></i></button>
        ${p.estado === 'PENDIENTE' || p.estado === 'PARCIAL' ? `<button class="btn-action btn-action-receive" data-id="${p.idPedido}" data-action="receive" title="Recibir"><i class="fas fa-truck-loading"></i></button>` : ''}
        ${p.estado === 'PENDIENTE' ? `<button class="btn-action btn-action-cancel" data-id="${p.idPedido}" data-action="cancel" title="Cancelar"><i class="fas fa-times"></i></button>` : ''}
        ${p.estado === 'PARCIAL' ? `<button class="btn-action btn-action-complete" data-id="${p.idPedido}" data-action="complete" title="Marcar como completado"><i class="fas fa-check"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function getEstadoBadge(estado) {
  const map = {
    PENDIENTE: 'bg-warning text-dark',
    PARCIAL: 'bg-info text-dark',
    COMPLETADO: 'bg-success',
    CANCELADO: 'bg-secondary',
  };
  return `<span class="badge ${map[estado] || 'bg-secondary'}">${estado}</span>`;
}

function renderPagination() {
  const container = document.getElementById('paginationPedidos');
  if (!container || state.totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';
  html += `<li class="page-item ${state.currentPage === 0 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${state.currentPage - 1}"><i class="fas fa-chevron-left"></i></a></li>`;
  for (let i = 0; i < state.totalPages; i++) {
    if (i === 0 || i === state.totalPages - 1 || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
      html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i + 1}</a></li>`;
    } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
      html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    }
  }
  html += `<li class="page-item ${state.currentPage === state.totalPages - 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${state.currentPage + 1}"><i class="fas fa-chevron-right"></i></a></li>`;
  html += '</ul></nav>';
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = parseInt(el.dataset.page);
      if (page >= 0 && page < state.totalPages) cargarPedidos(page);
    });
  });
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'view') verDetalle(id);
  else if (action === 'receive') abrirRecepcion(id);
  else if (action === 'cancel') cancelarPedido(id);
  else if (action === 'complete') completarPedido(id);
}

async function verDetalle(id) {
  try {
    const p = await API.get('/pedidos/' + id);
    const total = (p.detalles || []).reduce((sum, d) => sum + (d.subtotal || 0), 0);
    const detallesHtml = (p.detalles || []).map(d => `<tr>
      <td>${Utils.esc(d.productoSku)} - ${Utils.esc(d.productoNombre)}</td>
      <td class="text-center">${d.cantidadPedida}</td>
      <td class="text-end">$${(d.precioCompraUnitario || 0).toFixed(2)}</td>
      <td class="text-end">$${(d.subtotal || 0).toFixed(2)}</td>
      <td class="text-center">${d.cantidadRecibida != null ? d.cantidadRecibida : '-'}</td>
    </tr>`).join('');

    Utils.showDialog(
      'Detalle del Pedido - ' + Utils.esc(p.folio),
      `<div class="text-start">
        <div class="mb-3">
          <div class="row g-2 small">
            <div class="col-6"><strong>Folio:</strong> ${Utils.esc(p.folio)}</div>
            <div class="col-6"><strong>Estado:</strong> ${getEstadoBadge(p.estado)}</div>
            <div class="col-6"><strong>Proveedor:</strong> ${Utils.esc(p.proveedorNombre)}</div>
            <div class="col-6"><strong>Sucursal:</strong> ${Utils.esc(p.sucursalNombre)}</div>
            <div class="col-6"><strong>Fecha:</strong> ${Utils.formatDateTime(p.fechaCreacion)}</div>
            <div class="col-6"><strong>Total:</strong> <span class="text-primary fw-bold">$${total.toFixed(2)}</span></div>
          </div>
        </div>
        <hr>
        <div class="table-responsive">
          <table class="table table-sm table-custom mb-0">
            <thead><tr><th>Producto</th><th class="text-center">Pedido</th><th class="text-end">Precio</th><th class="text-end">Subtotal</th><th class="text-center">Recibido</th></tr></thead>
            <tbody>${detallesHtml}</tbody>
          </table>
        </div>
      </div>`
    );
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cancelarPedido(id) {
  const confirmed = await Utils.confirmAction(
    '\u00bfEst\u00e1s seguro de cancelar este pedido?',
    'Confirmar', 'Cancelar Pedido'
  );
  if (!confirmed) return;
  try {
    await API.post('/pedidos/' + id + '/cancelar', {});
    Utils.showToast('Pedido cancelado', 'success');
    cargarPedidos(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function abrirModal(id) {
  state.editingId = id;
  state.detalles = [];
  const modal = new bootstrap.Modal(document.getElementById('pedidoModal'));
  document.getElementById('pedidoModalTitle').textContent = 'Nuevo Pedido';
  document.getElementById('formPedido').reset();
  document.getElementById('pedidoId').value = '';
  renderPedidoDetalles();

  await Promise.all([
    cargarProveedoresSelect(),
    cargarSucursalesSelect(),
    cargarProductosCatalogo(),
  ]);

  if (id) {
    document.getElementById('pedidoModalTitle').textContent = 'Editar Pedido';
    try {
      const p = await API.get('/pedidos/' + id);
      document.getElementById('pedidoProveedor').value = p.idProveedor;
      Utils.updateSearchableOptions('pedidoProveedor');
      document.getElementById('pedidoSucursal').value = p.idSucursal;
      Utils.updateSearchableOptions('pedidoSucursal');
      document.getElementById('pedidoNota').value = p.nota || '';
      state.detalles = (p.detalles || []).map(d => ({
        idProducto: d.idProducto,
        productoSku: d.productoSku,
        productoNombre: d.productoNombre,
        cantidad: d.cantidadPedida,
        precioUnitario: d.precioCompraUnitario,
      }));
      renderPedidoDetalles();
    } catch (err) { Utils.showToast(err.message, 'error'); }
  }

  modal.show();
}

function renderPedidoDetalles() {
  const tbody = document.getElementById('pedidoDetallesBody');
  if (!tbody) return;

  if (!state.detalles || state.detalles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="text-muted small text-center py-3">No hay productos agregados</div></td></tr>';
    return;
  }

  tbody.innerHTML = state.detalles.map((d, i) => {
    const subtotal = (d.cantidad || 0) * (d.precioUnitario || 0);
    return `<tr>
      <td>${Utils.esc(d.productoSku || '')} - ${Utils.esc(d.productoNombre || 'Producto')}</td>
      <td><input type="number" class="form-control form-control-sm detalle-cantidad" data-idx="${i}" value="${d.cantidad}" min="1"></td>
      <td><input type="number" class="form-control form-control-sm detalle-precio" data-idx="${i}" value="${d.precioUnitario || 0}" step="0.01" min="0"></td>
      <td class="text-end fw-semibold">$${subtotal.toFixed(2)}</td>
      <td><button type="button" class="btn btn-sm btn-outline-danger eliminar-detalle" data-idx="${i}"><i class="fas fa-times"></i></button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.detalle-cantidad').forEach(inp => {
    inp.addEventListener('change', function() {
      const idx = parseInt(this.dataset.idx);
      state.detalles[idx].cantidad = parseInt(this.value) || 0;
      renderPedidoDetalles();
    });
  });
  tbody.querySelectorAll('.detalle-precio').forEach(inp => {
    inp.addEventListener('change', function() {
      const idx = parseInt(this.dataset.idx);
      state.detalles[idx].precioUnitario = parseFloat(this.value) || 0;
      renderPedidoDetalles();
    });
  });
  tbody.querySelectorAll('.eliminar-detalle').forEach(btn => {
    btn.addEventListener('click', function() {
      const idx = parseInt(this.dataset.idx);
      state.detalles.splice(idx, 1);
      renderPedidoDetalles();
    });
  });
}

async function abrirModalDetalle(idx) {
  state.editingDetalleIdx = idx;
  const modal = new bootstrap.Modal(document.getElementById('pedidoDetalleModal'));
  document.getElementById('formPedidoDetalle').reset();
  document.getElementById('pedidoDetalleIdx').value = idx != null ? idx : '';
  document.getElementById('pedidoDetalleProductoId').value = '';
  document.getElementById('pedidoDetalleProductoInfo').classList.add('d-none');
  document.getElementById('pedidoDetalleSearch').value = '';

  if (state.productosCatalogo.length === 0) await cargarProductosCatalogo();
  renderCatalogoProductos(state.productosCatalogo);

  const searchInput = document.getElementById('pedidoDetalleSearch');
  const onSearch = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderCatalogoProductos(state.productosCatalogo);
      return;
    }
    const filtered = state.productosCatalogo.filter(p =>
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.nombre && p.nombre.toLowerCase().includes(q))
    );
    renderCatalogoProductos(filtered);
  };
  searchInput.addEventListener('input', Utils.debounce(onSearch, 200));

  if (idx != null) {
    const d = state.detalles[idx];
    if (d) {
      document.getElementById('pedidoDetalleProductoId').value = d.idProducto || '';
      document.getElementById('pedidoDetalleCantidad').value = d.cantidad || '';
      document.getElementById('pedidoDetallePrecio').value = d.precioUnitario || '';
      const prod = state.productosCatalogo.find(p => p.idProducto === d.idProducto);
      if (prod) seleccionarProductoCatalogo(prod);
    }
  }

  modal.show();
}

function renderCatalogoProductos(productos) {
  const container = document.getElementById('pedidoDetalleProductList');
  if (!container) return;

  if (!productos || productos.length === 0) {
    container.innerHTML = '<div class="text-muted small text-center py-4">Sin resultados</div>';
    return;
  }

  const selectedId = parseInt(document.getElementById('pedidoDetalleProductoId')?.value);
  container.innerHTML = productos.map(p => {
    const attrHtml = (p.atributosAsignados && p.atributosAsignados.length)
      ? '<div class="mt-1">' + p.atributosAsignados.map(a =>
          `<span class="badge bg-secondary me-1" style="font-size:0.65rem">${Utils.esc(a.nombreAtributo)}: ${Utils.esc(a.nombreValor)}</span>`
        ).join('') + '</div>'
      : '';
    const isSelected = p.idProducto === selectedId;
    const costoDisplay = p.idProductoPadre
      ? (state.parentCostMap[p.idProductoPadre] ?? p.costoPromedio ?? 0)
      : (p.costoPromedio ?? 0);
    return `<div class="producto-catalogo-item ${isSelected ? 'selected' : ''}" data-id="${p.idProducto}">
      <div>
        <div class="fw-semibold small">${Utils.esc(p.nombre)}</div>
        ${attrHtml}
        <small class="text-muted">SKU: ${Utils.esc(p.sku || '-')}</small>
      </div>
      <div class="text-end">
        <div class="fw-bold" style="color:var(--primary);font-size:0.85rem">$${costoDisplay.toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.producto-catalogo-item').forEach(item => {
    item.addEventListener('click', async () => {
      const prodId = parseInt(item.dataset.id);
      const prod = state.productosCatalogo.find(x => x.idProducto === prodId);
      if (!prod) return;
      document.getElementById('pedidoDetalleProductoId').value = prodId;
      try {
        const fresh = await API.get('/productos/' + prodId);
        let costo = fresh.costoPromedio;
        if (fresh.idProductoPadre) {
          const parent = await API.get('/productos/' + fresh.idProductoPadre);
          costo = parent.costoPromedio;
        }
        document.getElementById('pedidoDetallePrecio').value = costo ?? 0;
      } catch (_) {
        document.getElementById('pedidoDetallePrecio').value = prod.costoPromedio ?? 0;
      }
      seleccionarProductoCatalogo(prod);
      container.querySelectorAll('.producto-catalogo-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
  });
}

function seleccionarProductoCatalogo(prod) {
  const info = document.getElementById('pedidoDetalleProductoInfo');
  info.classList.remove('d-none');
  document.getElementById('pedidoDetalleProductoNombre').textContent = prod.nombre || '';
  document.getElementById('pedidoDetalleProductoSku').textContent = 'SKU: ' + (prod.sku || '-');
  const attrs = document.getElementById('pedidoDetalleProductoAttrs');
  if (prod.atributosAsignados && prod.atributosAsignados.length) {
    attrs.innerHTML = prod.atributosAsignados.map(a =>
      `<span class="badge bg-secondary me-1" style="font-size:0.7rem">${Utils.esc(a.nombreAtributo)}: ${Utils.esc(a.nombreValor)}</span>`
    ).join('');
  } else {
    attrs.innerHTML = '';
  }
}

function guardarPedidoDetalle() {
  const idProducto = parseInt(document.getElementById('pedidoDetalleProductoId').value);
  const cantidad = parseInt(document.getElementById('pedidoDetalleCantidad').value);
  const precioUnitario = parseFloat(document.getElementById('pedidoDetallePrecio').value);

  if (!idProducto) { Utils.showToast('Selecciona un producto', 'warning'); return; }
  if (!cantidad || cantidad < 1) { Utils.showToast('La cantidad debe ser mayor a 0', 'warning'); return; }
  if (!precioUnitario || precioUnitario < 0) { Utils.showToast('Ingresa un precio v\u00e1lido', 'warning'); return; }

  const producto = state.productosCatalogo.find(p => p.idProducto === idProducto);
  const detalle = {
    idProducto: idProducto,
    productoSku: producto ? producto.sku : '',
    productoNombre: producto ? producto.nombre : 'Producto',
    cantidad: cantidad,
    precioUnitario: precioUnitario,
  };

  const idx = document.getElementById('pedidoDetalleIdx').value;
  if (idx !== '') {
    state.detalles[parseInt(idx)] = detalle;
  } else {
    state.detalles.push(detalle);
  }

  renderPedidoDetalles();
  bootstrap.Modal.getInstance(document.getElementById('pedidoDetalleModal'))?.hide();
}

async function guardarPedido() {
  const idProveedor = parseInt(document.getElementById('pedidoProveedor').value);
  const idSucursal = parseInt(document.getElementById('pedidoSucursal').value);
  const nota = document.getElementById('pedidoNota').value.trim();

  if (!idProveedor) { Utils.showToast('Selecciona un proveedor', 'warning'); return; }
  if (!idSucursal) { Utils.showToast('Selecciona una sucursal', 'warning'); return; }
  if (!state.detalles || state.detalles.length === 0) { Utils.showToast('Agrega al menos un producto', 'warning'); return; }

  const data = {
    idProveedor: idProveedor,
    idSucursal: idSucursal,
    nota: nota || null,
    detalles: state.detalles.map(d => ({
      idProducto: d.idProducto,
      cantidadPedida: d.cantidad,
      precioCompraUnitario: d.precioUnitario,
    })),
  };

  try {
    if (state.editingId) {
      Utils.showToast('Los pedidos no se pueden editar, solo cancelar', 'warning');
      return;
    } else {
      await API.post('/pedidos', data);
      Utils.showToast('Pedido creado', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('pedidoModal'))?.hide();
    cargarPedidos(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function completarPedido(id) {
  const confirmed = await Utils.confirmAction(
    '\u00bfEst\u00e1s seguro de marcar este pedido como completado?<br><small class="text-muted">Los productos pendientes se dar\u00e1n por recibidos.</small>',
    'Completar Pedido', 'Completar'
  );
  if (!confirmed) return;
  try {
    await API.post('/pedidos/' + id + '/completar', {});
    Utils.showToast('Pedido completado', 'success');
    cargarPedidos(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function abrirRecepcion(id) {
  try {
    const p = await API.get('/pedidos/' + id);
    document.getElementById('recepcionId').value = p.idPedido;
    document.getElementById('recepcionFolio').textContent = Utils.esc(p.folio);
    document.getElementById('recepcionProveedor').textContent = Utils.esc(p.proveedorNombre);
    document.getElementById('recepcionSucursal').textContent = Utils.esc(p.sucursalNombre);

    const tbody = document.getElementById('recepcionDetallesBody');
    const rowsHtml = await Promise.all((p.detalles || []).map(async d => {
      const recibido = d.cantidadRecibida || 0;
      const pendiente = d.cantidadPedida - recibido;
      const precioCompra = d.costoUltimo || d.precioCompraUnitario || 0;
      let precio1 = '', precio2 = '', precio3 = '', precio4 = '';
      try {
        const prod = await API.get('/productos/' + d.idProducto);
        precio1 = prod.precio1 ?? '';
        precio2 = prod.precio2 ?? '';
        precio3 = prod.precio3 ?? '';
        precio4 = prod.precio4 ?? '';
      } catch (_) {}
      return `<tr>
        <td>
          <div class="fw-semibold small">${Utils.esc(d.productoSku)} - ${Utils.esc(d.productoNombre)}</div>
        </td>
        <td class="text-center">${d.cantidadPedida}</td>
        <td class="text-center">${recibido > 0 ? recibido : '-'}</td>
        <td>
          <input type="number" class="form-control form-control-sm recepcion-precio" data-detalle="${d.idPedidoDetalle}" value="${precioCompra}" step="0.01" min="0">
        </td>
        <td>
          <div class="small text-muted" style="line-height:1">Anterior: $${(precio1 || 0).toFixed(2)}</div>
          <input type="number" class="form-control form-control-sm recepcion-precio1" data-detalle="${d.idPedidoDetalle}" value="${precio1}" step="0.01" min="0">
        </td>
        <td>
          <div class="small text-muted" style="line-height:1">Anterior: $${(precio2 || 0).toFixed(2)}</div>
          <input type="number" class="form-control form-control-sm recepcion-precio2" data-detalle="${d.idPedidoDetalle}" value="${precio2}" step="0.01" min="0">
        </td>
        <td>
          <div class="small text-muted" style="line-height:1">Anterior: $${(precio3 || 0).toFixed(2)}</div>
          <input type="number" class="form-control form-control-sm recepcion-precio3" data-detalle="${d.idPedidoDetalle}" value="${precio3}" step="0.01" min="0">
        </td>
        <td>
          <div class="small text-muted" style="line-height:1">Anterior: $${(precio4 || 0).toFixed(2)}</div>
          <input type="number" class="form-control form-control-sm recepcion-precio4" data-detalle="${d.idPedidoDetalle}" value="${precio4}" step="0.01" min="0">
        </td>
        <td class="text-center">
          <input type="number" class="form-control form-control-sm recepcion-cantidad" data-detalle="${d.idPedidoDetalle}" value="${pendiente}" min="0" max="${pendiente}" style="width:80px;margin:0 auto">
        </td>
      </tr>`;
    }));
    tbody.innerHTML = rowsHtml.join('');

    new bootstrap.Modal(document.getElementById('recepcionModal')).show();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function confirmarRecepcion() {
  const idPedido = parseInt(document.getElementById('recepcionId').value);
  if (!idPedido) return;

  const detalles = [];
  let hasError = false;
  document.querySelectorAll('#recepcionDetallesBody tr').forEach(row => {
    if (hasError) return;
    const cantInput = row.querySelector('.recepcion-cantidad');
    const idDetalle = parseInt(cantInput?.dataset.detalle);
    const cantidad = parseInt(cantInput?.value) || 0;
    const max = parseInt(cantInput?.getAttribute('max')) || 0;
    if (cantidad > max) {
      hasError = true;
      return;
    }
    const precioCompra = parseFloat(row.querySelector('.recepcion-precio')?.value) || 0;
    const precio1 = parseFloat(row.querySelector('.recepcion-precio1')?.value) || null;
    const precio2 = parseFloat(row.querySelector('.recepcion-precio2')?.value) || null;
    const precio3 = parseFloat(row.querySelector('.recepcion-precio3')?.value) || null;
    const precio4 = parseFloat(row.querySelector('.recepcion-precio4')?.value) || null;
    if (idDetalle && cantidad > 0) {
      detalles.push({
        idPedidoDetalle: idDetalle,
        cantidadRecibida: cantidad,
        precioCompraUnitario: precioCompra,
        precio1: precio1,
        precio2: precio2,
        precio3: precio3,
        precio4: precio4,
      });
    }
  });

  if (hasError) {
    Utils.showToast('Una o m\u00e1s cantidades exceden lo pendiente por recibir', 'warning');
    return;
  }

  if (detalles.length === 0) {
    Utils.showToast('No hay productos para recibir', 'warning');
    return;
  }

  try {
    await API.post('/pedidos/' + idPedido + '/recibir', { idPedido: idPedido, detalles: detalles });
    Utils.showToast('Recepci\u00f3n registrada', 'success');
    bootstrap.Modal.getInstance(document.getElementById('recepcionModal'))?.hide();
    cargarPedidos(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}
