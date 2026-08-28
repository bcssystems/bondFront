let state = {
  data: [],
  currentPage: 0,
  totalPages: 0,
  totalElements: 0,
  pageSize: 50,
  searchTerm: '',
  filterSucursal: '',
  sortField: 'idProducto',
  sortDir: 'DESC',
  editingId: null,
  currentProductoId: null,
  showInactive: false,
};

export function init() {
  bindEvents();
  cargarProductos(0);
  cargarSucursalesSelect();
  cargarStats();
}

function bindEvents() {
  document.getElementById('btnNuevoProducto')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarProducto')?.addEventListener('click', guardarProducto);
  document.getElementById('statsCostoTotalCard')?.addEventListener('click', mostrarCostoPorSucursal);
  document.getElementById('btnExportarInventario')?.addEventListener('click', exportarInventarioCSV);
  document.getElementById('btnExportarInventarioExcel')?.addEventListener('click', exportarInventarioExcel);
  document.getElementById('btnExportarInventarioPdf')?.addEventListener('click', exportarInventarioPDF);
  document.getElementById('searchProducto')?.addEventListener('input', Utils.debounce(e => {
    state.searchTerm = e.target.value;
    state.currentPage = 0;
    cargarProductos(0);
  }, 400));
  document.getElementById('filterSucursal')?.addEventListener('change', e => {
    state.filterSucursal = e.target.value;
    state.currentPage = 0;
    cargarProductos(0);
  });
  document.getElementById('productoTreeRoot')?.addEventListener('click', handleTableClick);
  document.getElementById('multimediaInput')?.addEventListener('change', subirMultimedia);
  document.getElementById('btnCamara')?.addEventListener('click', abrirCamara);
  document.getElementById('btnTomarFoto')?.addEventListener('click', tomarFotoCamara);
  document.getElementById('camaraModal')?.addEventListener('hidden.bs.modal', detenerCamara);
  document.getElementById('btnRegistrarMovimiento')?.addEventListener('click', () => abrirModalMovimiento());
  document.getElementById('btnToggleInactivos')?.addEventListener('click', toggleInactivos);
}

async function cargarStats() {
  try {
    const stats = await API.get('/productos/stats');
    document.getElementById('statsStock').textContent = stats.stockGlobal || 0;
    document.getElementById('statsActivos').textContent = stats.activos || 0;
    const costoTotal = stats.costoTotalInventario || 0;
    document.getElementById('statsCostoTotal').textContent = '$' + costoTotal.toFixed(2);
  } catch (_) {}
}

async function mostrarCostoPorSucursal() {
  const body = document.getElementById('costoSucursalBody');
  body.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i></div>';
  new bootstrap.Modal(document.getElementById('costoSucursalModal')).show();
  try {
    const data = await API.get('/productos/stats/costo-por-sucursal');
    if (!data || data.length === 0) {
      body.innerHTML = '<div class="text-center py-3 text-muted">Sin datos de inventario</div>';
      return;
    }
    body.innerHTML = data.map(r =>
      '<div class="d-flex justify-content-between align-items-center py-1 border-bottom">' +
        '<span class="fw-semibold small">' + Utils.esc(r.sucursal || '—') + '</span>' +
        '<span class="fw-bold" style="color:var(--primary)">$' + (parseFloat(r.costo) || 0).toFixed(2) + '</span>' +
      '</div>'
    ).join('');
  } catch (_) {
    body.innerHTML = '<div class="text-center py-3 text-danger">Error al cargar datos</div>';
  }
}

async function cargarProductos(page) {
  state.currentPage = page;
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('size', state.pageSize);
  params.set('sort', state.sortField + ',' + state.sortDir);
  if (state.searchTerm) params.set('search', state.searchTerm);
  if (state.filterSucursal) params.set('idSucursal', state.filterSucursal);
  params.set('activo', state.showInactive ? 'false' : 'true');

  try {
    const result = await API.get('/productos?' + params.toString());
    state.data = result.content;
    state.totalPages = result.totalPages;
    state.totalElements = result.totalElements;
    renderTable();
    renderPagination();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function toggleInactivos() {
  state.showInactive = !state.showInactive;
  state.currentPage = 0;
  const btn = document.getElementById('btnToggleInactivos');
  if (btn) {
    btn.innerHTML = state.showInactive
      ? '<i class="fas fa-eye-slash me-1"></i> Mostrar activos'
      : '<i class="fas fa-eye me-1"></i> Mostrar inactivos';
  }
  cargarProductos(0);
}

async function cargarSucursalesSelect() {
  try {
    const sucursales = await API.get('/sucursales');
    const selects = document.querySelectorAll('.sucursal-select');
    selects.forEach(sel => {
      sel.innerHTML = '<option value="">Todas las sucursales</option>' +
        sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
      Utils.makeSearchableSelect(sel.id);
    });

    const stockSelects = document.querySelectorAll('.sucursal-stock-select');
    stockSelects.forEach(sel => {
      sel.innerHTML = '<option value="">Seleccionar sucursal</option>' +
        sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
      Utils.makeSearchableSelect(sel.id);
    });

    const exportSel = document.getElementById('exportSucursalSelect');
    if (exportSel) {
      exportSel.innerHTML = '<option value="">Todas las sucursales</option>' +
        sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
    }
  } catch (err) {
    console.warn('Error al cargar sucursales:', err);
  }
}

function renderTable() {
  const root = document.getElementById('productoTreeRoot');
  if (!root) return;

  if (!state.data || state.data.length === 0) {
    root.innerHTML = '<li class="producto-node empty-tree"><div class="empty-state"><i class="fas fa-box-open"></i><p>No hay productos</p></div></li>';
    return;
  }

  root.innerHTML = state.data.map(p => renderProductoNode(p)).join('');
}

function renderProductoNode(p) {
  const id = p.idProducto;

  const imgUrl = p.multimedia && p.multimedia.length > 0
    ? API.mediaBaseUrl + (p.multimedia.find(m => m.esPrincipal)?.url || p.multimedia[0].url)
    : null;
  const imgHtml = imgUrl
    ? `<img src="${Utils.esc(imgUrl)}" alt="">`
    : '<div class="no-img"><i class="fas fa-image"></i></div>';

  let stockDisplay = p.stockActual;
  let stockClass = Utils.getStockClass(p.stockActual, p.stockMinimo);
  if (state.filterSucursal) {
    const sucInv = (p.inventarioSucursales || []).find(i => i.idSucursal === parseInt(state.filterSucursal));
    if (sucInv) {
      stockDisplay = sucInv.stock;
      stockClass = Utils.getStockClass(sucInv.stock, p.stockMinimo);
    }
  }

  return `<li class="producto-node${p.activo ? '' : ' inactive'}">
    <div class="producto-row">
      <div class="producto-img clickable" data-id="${id}" data-action="multimedia">${imgHtml}</div>
      <span class="producto-sku">${Utils.esc(p.sku)}</span>
      <span class="producto-nombre"><strong>${Utils.esc(p.nombre)}</strong></span>
      <span class="producto-stock ${stockClass}">${stockDisplay} uds</span>
      <span class="producto-precio">$${(p.precioBase || 0).toFixed(2)}</span>
      <span class="badge-status ${p.activo ? 'badge-active' : 'badge-inactive'}">${p.activo ? 'Activo' : 'Inactivo'}</span>
      <div class="producto-actions">
        <button class="btn-action btn-action-image" data-id="${id}" data-action="multimedia" title="Multimedia"><i class="fas fa-images"></i></button>
        ${!p.activo ? `<button class="btn-action btn-action-reactivate" data-id="${id}" data-action="reactivate" title="Reactivar"><i class="fas fa-undo"></i></button>` : ''}
        <button class="btn-action btn-action-edit" data-id="${id}" data-action="edit" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn-action btn-action-delete" data-id="${id}" data-action="delete" title="Eliminar"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  </li>`;
}

function renderPagination() {
  const container = document.getElementById('paginationProductos');
  if (!container) return;

  if (state.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';
  html += `<li class="page-item ${state.currentPage === 0 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${state.currentPage - 1}"><i class="fas fa-chevron-left"></i></a></li>`;

  for (let i = 0; i < state.totalPages; i++) {
    if (i === 0 || i === state.totalPages - 1 || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
      html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i + 1}</a></li>`;
    } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
      html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    }
  }

  html += `<li class="page-item ${state.currentPage === state.totalPages - 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${state.currentPage + 1}"><i class="fas fa-chevron-right"></i></a></li>`;
  html += '</ul></nav>';
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = parseInt(el.dataset.page);
      if (page >= 0 && page < state.totalPages) cargarProductos(page);
    });
  });
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (btn) {
    const id = parseInt(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'edit') abrirModal(id);
    else if (action === 'delete') confirmarEliminar(id);
    else if (action === 'reactivate') reactivarProducto(id);
    else if (action === 'multimedia') verMultimedia(id);
    return;
  }

  const img = e.target.closest('.producto-img.clickable');
  if (img) {
    const id = parseInt(img.dataset.id);
    verMultimedia(id);
  }
}

async function abrirModal(id) {
  state.editingId = id;

  const modalEl = document.getElementById('productoModal');
  if (!modalEl) return;

  const modal = new bootstrap.Modal(modalEl);
  const title = document.getElementById('productoModalTitle');
  const form = document.getElementById('formProducto');
  form.reset();

  document.getElementById('productoId').value = '';
  document.getElementById('productoUnidadMedida').value = 'UNIDAD';
  document.getElementById('productoMetrosPorRollo').value = '';

  const skuField = document.getElementById('productoSku');

  await generarStockInputs(id);

  if (id) {
    title.textContent = 'Editar Producto';
    try {
      const p = await API.get('/productos/' + id);
      document.getElementById('productoId').value = p.idProducto;
      document.getElementById('productoNombre').value = p.nombre || '';
      document.getElementById('productoDescripcion').value = p.descripcion || '';
      document.getElementById('productoPrecioBase').value = p.precioBase || '';
      document.getElementById('productoCosto').value = p.costoPromedio || '';
      document.getElementById('productoActivo').checked = p.activo !== false;
      document.getElementById('productoUnidadMedida').value = p.unidadMedida || 'UNIDAD';
      document.getElementById('productoMetrosPorRollo').value = p.metrosPorRollo || '';

      const invs = p.inventarioSucursales || [];
      invs.forEach(inv => {
        const stockInput = document.getElementById('stock_' + inv.idSucursal);
        const minInput = document.getElementById('stockMin_' + inv.idSucursal);
        const maxInput = document.getElementById('stockMax_' + inv.idSucursal);
        if (stockInput) stockInput.value = inv.stock || 0;
        if (minInput) minInput.value = inv.stockMinimo || '';
        if (maxInput) maxInput.value = inv.stockMaximo || '';
      });

      if (skuField) {
        skuField.value = p.sku || '';
        skuField.readOnly = true;
      }
    } catch (err) {
      Utils.showToast(err.message, 'error');
      return;
    }
  } else {
    title.textContent = 'Nuevo Producto';
    document.getElementById('productoActivo').checked = true;
    if (skuField) {
      skuField.value = '';
      skuField.disabled = true;
    }
  }

  modal.show();
}

async function generarStockInputs(editingId) {
  const container = document.getElementById('stockSucursalInputs');
  if (!container) return;
  try {
    const sucursales = await API.get('/sucursales');
    container.innerHTML = '<div class="row g-2">' + sucursales.map(s =>
      `<div class="col-md-4 mb-2">
        <div class="p-2 border rounded">
          <div class="fw-semibold small mb-1">${Utils.esc(s.nombre)}</div>
          <div class="row g-1">
            <div class="col-4">
              <input type="number" class="form-control form-control-sm stock-input" id="stock_${s.idSucursal}" placeholder="Stock" min="0" ${editingId ? '' : 'value="0"'}>
            </div>
            <div class="col-4">
              <input type="number" class="form-control form-control-sm" id="stockMin_${s.idSucursal}" placeholder="M\u00edn" min="0">
            </div>
            <div class="col-4">
              <input type="number" class="form-control form-control-sm" id="stockMax_${s.idSucursal}" placeholder="M\u00e1x" min="0">
            </div>
          </div>
        </div>
      </div>`
    ).join('') + '</div>';
  } catch (err) {
    container.innerHTML = '<p class="text-muted small">Error al cargar sucursales</p>';
  }
}

async function guardarProducto() {
  Utils.syncSearchableSelects();

  let inventarios = [];
  try {
    const sucursales = await API.get('/sucursales');
    sucursales.forEach(s => {
      const stock = parseInt(document.getElementById('stock_' + s.idSucursal).value) || 0;
      const stockMin = parseInt(document.getElementById('stockMin_' + s.idSucursal).value) || null;
      const stockMax = parseInt(document.getElementById('stockMax_' + s.idSucursal).value) || null;
      inventarios.push({ idSucursal: s.idSucursal, stock: stock, stockMinimo: stockMin, stockMaximo: stockMax });
    });
  } catch (err) {
    Utils.showToast('Error al cargar sucursales', 'error');
    return;
  }

  const data = {
    sku: document.getElementById('productoSku').value.trim(),
    nombre: document.getElementById('productoNombre').value.trim(),
    descripcion: document.getElementById('productoDescripcion').value.trim(),
    precioBase: parseFloat(document.getElementById('productoPrecioBase').value) || null,
    costoPromedio: parseFloat(document.getElementById('productoCosto').value) || null,
    unidadMedida: document.getElementById('productoUnidadMedida').value || 'UNIDAD',
    metrosPorRollo: parseFloat(document.getElementById('productoMetrosPorRollo').value) || null,
    activo: document.getElementById('productoActivo').checked,
    inventarios: inventarios,
  };

  if (!data.nombre) { Utils.showToast('El nombre es obligatorio', 'warning'); return; }

  try {
    if (state.editingId) {
      await API.put('/productos/' + state.editingId, data);
      Utils.showToast('Producto actualizado', 'success');
    } else {
      await API.post('/productos', data);
      Utils.showToast('Producto creado', 'success');
    }

    const modal = bootstrap.Modal.getInstance(document.getElementById('productoModal'));
    if (modal) modal.hide();
    cargarProductos(0);
    cargarStats();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function confirmarEliminar(id) {
  const confirmed = await Utils.confirmAction(
    '\u00bfDesactivar este producto?', 'Confirmar', 'Desactivar'
  );
  if (!confirmed) return;

  try {
    await API.del('/productos/' + id);
    Utils.showToast('Producto desactivado', 'success');
    cargarProductos(state.currentPage);
    cargarStats();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function reactivarProducto(id) {
  const confirmed = await Utils.confirmAction(
    '\u00bfReactivar este producto?', 'Confirmar', 'Reactivar'
  );
  if (!confirmed) return;

  try {
    await API.patch('/productos/' + id + '/reactivar');
    Utils.showToast('Producto reactivado', 'success');
    cargarProductos(state.currentPage);
    cargarStats();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function verMultimedia(id) {
  state.currentProductoId = id;
  const modalEl = document.getElementById('multimediaModal');
  if (!modalEl) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  try {
    const p = await API.get('/productos/' + id);
    document.getElementById('multimediaProductoName').textContent = p.nombre + ' (' + p.sku + ')';
    renderMultimedia(p.multimedia || []);
  } catch (err) {
    Utils.showToast(err.message, 'error');
    return;
  }

  renderStockSucursal(id);
  renderMovimientosRecientes(id);

  modal.show();
}

function renderMultimedia(list) {
  const container = document.getElementById('multimediaGallery');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>Sin archivos multimedia</p></div>';
    return;
  }

  container.innerHTML = list.map(m => {
    const mediaUrl = API.mediaBaseUrl + m.url;
    const isVideo = m.tipo === 'VIDEO';
    const badge = m.esPrincipal ? '<div class="media-badge"><i class="fas fa-star"></i></div>' : '';
    return `<div class="media-item">
      ${badge}
      ${isVideo
        ? '<video src="' + Utils.esc(mediaUrl) + '" muted></video>'
        : '<img src="' + Utils.esc(mediaUrl) + '" alt="' + Utils.esc(m.nombreArchivo) + '">'}
      <button class="media-delete" data-id="${m.idMultimedia}" title="Eliminar"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');

  container.querySelectorAll('.media-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      try {
        await API.del('/productos/multimedia/' + id);
        Utils.showToast('Archivo eliminado', 'success');
        verMultimedia(state.currentProductoId);
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    });
  });
}

let _camaraStream = null;

async function abrirCamara() {
  if (!state.currentProductoId) {
    Utils.showToast('Abre la multimedia de un producto primero', 'warning');
    return;
  }
  const video = document.getElementById('camaraVideo');
  const status = document.getElementById('camaraStatus');
  if (!video || !status) return;

  video.srcObject = null;
  status.textContent = 'Solicitando acceso a la c\u00e1mara...';

  try {
    _camaraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = _camaraStream;
    status.textContent = 'Enfoca y presiona "Tomar foto"';
    new bootstrap.Modal(document.getElementById('camaraModal')).show();
  } catch (err) {
    status.textContent = '';
    if (err.name === 'NotAllowedError') {
      Utils.showToast('Permiso de c\u00e1mara denegado. Verifica la configuraci\u00f3n del navegador.', 'error');
    } else if (err.name === 'NotFoundError') {
      Utils.showToast('No se encontr\u00f3 una c\u00e1mara disponible.', 'error');
    } else {
      Utils.showToast('Error al acceder a la c\u00e1mara: ' + err.message, 'error');
    }
  }
}

function detenerCamara() {
  if (_camaraStream) {
    _camaraStream.getTracks().forEach(t => t.stop());
    _camaraStream = null;
  }
  const video = document.getElementById('camaraVideo');
  if (video) video.srcObject = null;
}

function tomarFotoCamara() {
  const video = document.getElementById('camaraVideo');
  if (!video || !_camaraStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob(async (blob) => {
    if (!blob || !state.currentProductoId) return;
    const file = new File([blob], 'foto_camara_' + Date.now() + '.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('esPrincipal', 'false');

    try {
      await API.requestUpload('/productos/' + state.currentProductoId + '/multimedia', formData);
      Utils.showToast('Foto tomada y subida', 'success');
      bootstrap.Modal.getInstance(document.getElementById('camaraModal'))?.hide();
      verMultimedia(state.currentProductoId);
    } catch (err) {
      Utils.showToast(err.message, 'error');
    }
  }, 'image/jpeg', 0.92);
}

async function subirMultimedia(e) {
  const file = e.target.files[0];
  if (!file || !state.currentProductoId) return;

  const formData = new FormData();
  formData.append('archivo', file);
  formData.append('esPrincipal', 'false');

  try {
    await API.requestUpload('/productos/' + state.currentProductoId + '/multimedia', formData);
    Utils.showToast('Archivo subido', 'success');
    verMultimedia(state.currentProductoId);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }

  e.target.value = '';
}

async function renderStockSucursal(idProducto) {
  const container = document.getElementById('stockSucursalList');
  if (!container) return;

  try {
    const p = await API.get('/productos/' + idProducto);
    const inv = p.inventarioSucursales || [];

    if (inv.length === 0) {
      container.innerHTML = '<p class="text-muted small">Sin stock en sucursales</p>';
      return;
    }

    container.innerHTML = inv.map(i =>
      `<div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
        <span><strong>${Utils.esc(i.sucursalNombre)}</strong></span>
        <span class="fw-semibold ${Utils.getStockClass(i.stock, p.stockMinimo)}">${i.stock} uds (min: ${i.stockMinimo != null ? i.stockMinimo : '-'}, max: ${i.stockMaximo != null ? i.stockMaximo : '-'})</span>
      </div>`
    ).join('');
  } catch (err) {
    container.innerHTML = '<p class="text-muted small">Error al cargar stock</p>';
  }
}

async function renderMovimientosRecientes(idProducto) {
  const container = document.getElementById('movimientosRecientes');
  if (!container) return;

  try {
    const result = await API.get(`/kardex?idProducto=${idProducto}&size=5`);
    const movs = result.content || [];

    if (movs.length === 0) {
      container.innerHTML = '<p class="text-muted small">Sin movimientos</p>';
      return;
    }

    container.innerHTML = movs.map(m =>
      `<div class="d-flex justify-content-between align-items-center mb-1 small p-1 border-bottom">
        <span class="badge ${m.tipoMovimiento === 'ENTRADA' ? 'bg-success' : m.tipoMovimiento === 'SALIDA' ? 'bg-danger' : 'bg-warning'}">${m.tipoMovimiento}</span>
        <span>Cant: ${m.cantidad}</span>
        <span>Stock: ${m.stockAnterior} \u2192 ${m.stockNuevo}</span>
        <span class="text-muted">${Utils.formatDateTime(m.fechaMovimiento)}</span>
        <span class="text-muted">${Utils.esc(m.usuario)}</span>
      </div>`
    ).join('');
  } catch (err) {
    container.innerHTML = '<p class="text-muted small">Error al cargar movimientos</p>';
  }
}

function abrirModalMovimiento() {
  const modalEl = document.getElementById('movimientoModal');
  if (!modalEl) return;

  document.getElementById('movimientoProductoId').value = state.currentProductoId || '';
  document.getElementById('movimientoForm').reset();
  document.getElementById('movimientoTransferenciaGroup').classList.add('d-none');
  document.getElementById('movimientoSucursalGroup').classList.remove('d-none');

  cargarSucursalesTransferencia();

  document.getElementById('movimientoTipo').onchange = function() {
    const isTransfer = this.value === 'TRANSFERENCIA';
    document.getElementById('movimientoSucursalGroup').classList.toggle('d-none', isTransfer);
    document.getElementById('movimientoTransferenciaGroup').classList.toggle('d-none', !isTransfer);
  };

  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  document.getElementById('btnGuardarMovimiento').onclick = async () => {
    const tipo = document.getElementById('movimientoTipo').value;
    const cantidad = parseInt(document.getElementById('movimientoCantidad').value) || 0;
    const referencia = document.getElementById('movimientoReferencia').value.trim();
    const observacion = document.getElementById('movimientoObservacion').value.trim();
    const idProducto = parseInt(document.getElementById('movimientoProductoId').value);

    if (!cantidad || cantidad <= 0) {
      Utils.showToast('La cantidad debe ser mayor a 0', 'warning');
      return;
    }

    try {
      if (tipo === 'TRANSFERENCIA') {
        const idSucursalOrigen = parseInt(document.getElementById('movimientoSucursalOrigen').value);
        const idSucursalDestino = parseInt(document.getElementById('movimientoSucursalDestino').value);
        if (!idSucursalOrigen || !idSucursalDestino) {
          Utils.showToast('Selecciona sucursal origen y destino', 'warning');
          return;
        }
        if (idSucursalOrigen === idSucursalDestino) {
          Utils.showToast('Las sucursales deben ser diferentes', 'warning');
          return;
        }
        await API.post(`/productos/${idProducto}/transferir`, { idSucursalOrigen, idSucursalDestino, cantidad, referencia, observacion });
      } else {
        const data = {
          tipoMovimiento: tipo,
          cantidad: cantidad,
          idSucursal: parseInt(document.getElementById('movimientoSucursal').value) || null,
          referencia: referencia,
          observacion: observacion,
        };
        await API.post(`/productos/${idProducto}/movimiento-stock`, data);
      }
      Utils.showToast('Movimiento registrado', 'success');
      bootstrap.Modal.getInstance(modalEl).hide();
      if (state.currentProductoId) verMultimedia(state.currentProductoId);
      cargarProductos(state.currentPage);
    } catch (err) {
      Utils.showToast(err.message, 'error');
    }
  };
}

async function cargarSucursalesTransferencia() {
  try {
    const sucursales = await API.get('/sucursales');
    const opts = sucursales.map(s => `<option value="${s.idSucursal}">${Utils.esc(s.nombre)}</option>`).join('');
    document.getElementById('movimientoSucursalOrigen').innerHTML = '<option value="">Seleccionar...</option>' + opts;
    document.getElementById('movimientoSucursalDestino').innerHTML = '<option value="">Seleccionar...</option>' + opts;
  } catch (_) {}
}

async function fetchAllProducts() {
  const all = [];
  let page = 0;
  const size = 50;
  while (true) {
    const params = new URLSearchParams({ page, size, sort: 'idProducto,DESC', activo: 'true' });
    const result = await API.get('/productos?' + params.toString());
    const content = result.content || [];
    all.push(...content);
    if (page >= (result.totalPages || 1) - 1) break;
    page++;
  }
  return all;
}

function buildInventoryRows(products, filterSucursalId) {
  const rows = [];
  for (const p of products) {
    const invList = p.inventarioSucursales || [];
    if (invList.length === 0) {
      if (filterSucursalId) continue;
      rows.push({
        sku: p.sku || '', nombre: p.nombre || '', tipo: 'Simple',
        sucursal: '', stock: p.stockActual || 0, stockMinimo: '', stockMaximo: '',
        costoPromedio: p.costoPromedio || 0, costoTotal: (p.costoPromedio || 0) * (p.stockActual || 0),
        estado: p.activo ? 'Activo' : 'Inactivo',
      });
    } else {
      for (const inv of invList) {
        if (filterSucursalId && inv.idSucursal != filterSucursalId) continue;
        rows.push({
          sku: p.sku || '', nombre: p.nombre || '', tipo: 'Simple',
          sucursal: inv.sucursalNombre || '', stock: inv.stock || 0,
          stockMinimo: inv.stockMinimo ?? '', stockMaximo: inv.stockMaximo ?? '',
          costoPromedio: p.costoPromedio || 0, costoTotal: (p.costoPromedio || 0) * (inv.stock || 0),
          estado: p.activo ? 'Activo' : 'Inactivo',
        });
      }
    }
  }
  return rows;
}

function downloadCSV(headers, rows, filename) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => '"' + (v ?? '') + '"').join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportarInventarioCSV() {
  const sucursalId = document.getElementById('exportSucursalSelect')?.value || '';
  const sucursalNombre = document.getElementById('exportSucursalSelect')?.selectedOptions?.[0]?.textContent || '';
  Utils.showToast('Exportando inventario...', 'info');
  try {
    const products = await fetchAllProducts();
    const rows = buildInventoryRows(products, sucursalId || null);
    const headers = ['SKU', 'Nombre', 'Tipo', 'Sucursal', 'Stock', 'Stock Min', 'Stock Max', 'Costo Promedio', 'Costo Total', 'Estado'];
    if (sucursalId) {
      const csvRows = rows.map(r => [r.sku, r.nombre, r.tipo, r.sucursal, r.stock, r.stockMinimo, r.stockMaximo, r.costoPromedio, r.costoTotal, r.estado]);
      downloadCSV(headers, csvRows, 'inventario_' + sucursalNombre.replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.csv');
    } else {
      const sucursalesMap = {};
      for (const r of rows) {
        const key = r.sucursal || 'Sin Sucursal';
        if (!sucursalesMap[key]) sucursalesMap[key] = [];
        sucursalesMap[key].push(r);
      }
      const allRows = [];
      for (const [sucursal, items] of Object.entries(sucursalesMap)) {
        allRows.push(['--- ' + sucursal + ' ---', '', '', '', '', '', '', '', '', '']);
        for (const r of items) {
          allRows.push([r.sku, r.nombre, r.tipo, r.sucursal, r.stock, r.stockMinimo, r.stockMaximo, r.costoPromedio, r.costoTotal, r.estado]);
        }
      }
      downloadCSV(headers, allRows, 'inventario_total_' + new Date().toISOString().slice(0, 10) + '.csv');
    }
    Utils.showToast('Inventario exportado', 'success');
  } catch (err) { Utils.showToast('Error al exportar: ' + err.message, 'error'); }
}

async function prepararInventario(conTotales) {
  const sucursalId = document.getElementById('exportSucursalSelect')?.value || '';
  const sucursalNombre = document.getElementById('exportSucursalSelect')?.selectedOptions?.[0]?.textContent || '';
  const products = await fetchAllProducts();
  const rows = buildInventoryRows(products, sucursalId || null);
  return { rows, sucursalId, sucursalNombre };
}

async function exportarInventarioExcel() {
  Utils.showToast('Generando Excel...', 'info');
  try {
    const { rows, sucursalNombre } = await prepararInventario();
    const headers = ['SKU', 'Nombre', 'Tipo', 'Sucursal', 'Stock', 'Stock Min', 'Stock Max', 'Costo Promedio', 'Costo Total', 'Estado'];
    const data = rows.map(r => [r.sku, r.nombre, r.tipo, r.sucursal, r.stock, r.stockMinimo, r.stockMaximo, r.costoPromedio, r.costoTotal, r.estado]);
    const file = (sucursalNombre ? 'inventario_' + sucursalNombre.replace(/\s+/g, '_') : 'inventario_total') + '_' + new Date().toISOString().slice(0, 10) + '.xls';
    Utils.downloadXls(file, 'Inventario', headers, data);
    Utils.showToast('Inventario exportado a Excel', 'success');
  } catch (err) { Utils.showToast('Error al exportar: ' + err.message, 'error'); }
}

async function exportarInventarioPDF() {
  Utils.showToast('Generando PDF...', 'info');
  try {
    const { rows, sucursalId, sucursalNombre } = await prepararInventario();

    let filas;
    if (sucursalId) {
      const totalCosto = rows.reduce((s, r) => s + (r.costoTotal || 0), 0);
      const totalStock = rows.reduce((s, r) => s + (r.stock || 0), 0);
      filas = rows.map(r =>
        '<tr>' +
          '<td>' + Utils.esc(r.sku || '') + '</td>' +
          '<td>' + Utils.esc(r.nombre || '') + '</td>' +
          '<td class="right">' + (r.stock || 0) + '</td>' +
          '<td class="right">' + (r.costoPromedio != null ? '$' + r.costoPromedio.toFixed(2) : '') + '</td>' +
          '<td class="right">' + (r.costoTotal != null ? '$' + r.costoTotal.toFixed(2) : '') + '</td>' +
        '</tr>'
      ).join('') +
      '<tr class="total"><td colspan="2">TOTALES</td>' +
        '<td class="right">' + totalStock + '</td><td></td>' +
        '<td class="right">$' + totalCosto.toFixed(2) + '</td></tr>';
    } else {
      const sucursalesMap = {};
      for (const r of rows) {
        const key = r.sucursal || 'Sin Sucursal';
        if (!sucursalesMap[key]) sucursalesMap[key] = [];
        sucursalesMap[key].push(r);
      }
      filas = Object.entries(sucursalesMap).map(([sucursal, items]) => {
        const totalCosto = items.reduce((s, r) => s + (r.costoTotal || 0), 0);
        const totalStock = items.reduce((s, r) => s + (r.stock || 0), 0);
        return '<tr style="background:#f1f1f1"><td colspan="5"><strong>' + Utils.esc(sucursal) + '</strong> — Stock: ' + totalStock + ' | Costo: $' + totalCosto.toFixed(2) + '</td></tr>' +
          items.map(r =>
            '<tr>' +
              '<td>' + Utils.esc(r.sku || '') + '</td>' +
              '<td>' + Utils.esc(r.nombre || '') + '</td>' +
              '<td class="right">' + (r.stock || 0) + '</td>' +
              '<td class="right">' + (r.costoPromedio != null ? '$' + r.costoPromedio.toFixed(2) : '') + '</td>' +
              '<td class="right">' + (r.costoTotal != null ? '$' + r.costoTotal.toFixed(2) : '') + '</td>' +
            '</tr>'
          ).join('');
      }).join('');
    }

    const body =
      '<h2>INVENTARIO</h2>' +
      '<h4>' + (sucursalNombre ? Utils.esc(sucursalNombre) : 'TODAS LAS SUCURSALES') + ' | Generado: ' + new Date().toLocaleString() + '</h4>' +
      '<table>' +
        '<thead><tr><th>SKU</th><th>Nombre</th><th class="right">Stock</th><th class="right">Costo Prom.</th><th class="right">Costo Total</th></tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>';

    Utils.openPrintWindow('Inventario', body);
  } catch (err) { Utils.showToast('Error al exportar: ' + err.message, 'error'); }
}