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
  variantes: [],
  editingVarianteIdx: null,
  atributos: [],
  showInactive: false,
};

export function init() {
  bindEvents();
  cargarProductos(0);
  cargarSucursalesSelect();
  cargarStats();
  cargarAtributos();
}

function bindEvents() {
  document.getElementById('btnNuevoProducto')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarProducto')?.addEventListener('click', guardarProducto);
  document.getElementById('statsCostoTotalCard')?.addEventListener('click', mostrarCostoPorSucursal);
  document.getElementById('btnExportarInventario')?.addEventListener('click', exportarInventarioCSV);
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
  document.getElementById('productoTieneVariantes')?.addEventListener('change', toggleVariantesMode);
  document.getElementById('btnAgregarVariante')?.addEventListener('click', () => abrirModalVariante());
  document.getElementById('btnGuardarVariante')?.addEventListener('click', guardarVariante);
  document.getElementById('btnToggleInactivos')?.addEventListener('click', toggleInactivos);

}

async function cargarAtributos() {
  try {
    state.atributos = await API.get('/atributos/activos');
  } catch (_) {
    state.atributos = [];
  }
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

  const parentIds = new Set();
  const childIdsInVariants = new Set();
  state.data.forEach(p => {
    if (p.tieneVariantes) {
      parentIds.add(p.idProducto);
      if (p.variantes) {
        p.variantes.forEach(v => childIdsInVariants.add(v.idProducto));
      }
    }
  });

  const parents = state.data.filter(p => parentIds.has(p.idProducto));
  const standalone = state.data.filter(p => !parentIds.has(p.idProducto) && !childIdsInVariants.has(p.idProducto));

  let html = '';

  parents.forEach(p => { html += renderProductoNode(p, true); });
  standalone.forEach(p => { html += renderProductoNode(p, false); });

  root.innerHTML = html;
  setupProductoTreeInteractions();
}

function renderProductoNode(p, isParent) {
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

  const tipoLabel = isParent
    ? '<span class="badge bg-info">Variantes</span>'
    : p.idProductoPadre
      ? '<span class="badge bg-secondary">Variante</span>'
      : '<span class="badge bg-light text-dark">Simple</span>';

  const multimediaBtn = isParent
    ? ''
    : `<button class="btn-action btn-action-image" data-id="${id}" data-action="multimedia" title="Multimedia"><i class="fas fa-images"></i></button>`;

  const toggleBtn = isParent
    ? `<button type="button" class="producto-toggle" data-id="${id}" aria-expanded="false"><i class="fas fa-chevron-right"></i></button>`
    : '<span class="producto-spacer"></span>';

  let childrenHtml = '';
  if (isParent && p.variantes && p.variantes.length > 0) {
    childrenHtml = '<ul class="producto-children" hidden>' +
      p.variantes.map(v => renderProductoNode(v, false)).join('') +
      '</ul>';
  }

  return `<li class="producto-node${p.activo ? '' : ' inactive'}">
    <div class="producto-row">
      <div class="producto-toggle-wrapper">${toggleBtn}</div>
      <div class="producto-img ${isParent ? '' : 'clickable'}" data-id="${id}" data-action="${isParent ? '' : 'multimedia'}">${imgHtml}</div>
      <span class="producto-sku">${Utils.esc(p.sku)}</span>
      <span class="producto-nombre"><strong>${Utils.esc(p.nombre)}</strong>${p.atributosAsignados && p.atributosAsignados.length ? '<br><span class="small text-muted">' + p.atributosAsignados.map(a => Utils.esc(a.nombreAtributo) + ': ' + Utils.esc(a.nombreValor)).join(', ') + '</span>' : ''}</span>
      <span class="producto-stock ${stockClass}">${stockDisplay} uds</span>
      <span class="producto-precio">$${(p.precio1 || 0).toFixed(2)}</span>
      ${tipoLabel}
      <span class="badge-status ${p.activo ? 'badge-active' : 'badge-inactive'}">${p.activo ? 'Activo' : 'Inactivo'}</span>
      <div class="producto-actions">
        ${multimediaBtn}
        ${!p.activo ? `<button class="btn-action btn-action-reactivate" data-id="${id}" data-action="reactivate" title="Reactivar"><i class="fas fa-undo"></i></button>` : ''}
        <button class="btn-action btn-action-edit" data-id="${id}" data-action="edit" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn-action btn-action-delete" data-id="${id}" data-action="delete" title="Eliminar"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    ${childrenHtml}
  </li>`;
}

function setupProductoTreeInteractions() {
  const root = document.getElementById('productoTreeRoot');
  if (!root) return;
  root.querySelectorAll('.producto-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const node = btn.closest('.producto-node');
      const children = node.querySelector(':scope > .producto-children');
      if (!children) return;
      const isExpanded = node.classList.toggle('expanded');
      btn.setAttribute('aria-expanded', isExpanded);
      children.hidden = !isExpanded;
      btn.classList.toggle('rotated', isExpanded);
    });
  });
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

function toggleVariantesMode() {
  const checkbox = document.getElementById('productoTieneVariantes');
  if (!checkbox.checked && state.variantes.length > 0) {
    Utils.confirmAction(
      '\u00bfDesactivar variantes? Se perder\u00e1n las variantes no guardadas.',
      'Confirmar', 'Desactivar'
    ).then(ok => {
      if (ok) {
        state.variantes = [];
        document.getElementById('stockSucursalSection').style.display = 'block';
        document.getElementById('variantesSection').style.display = 'none';
        renderVariantes();
      } else {
        checkbox.checked = true;
      }
    });
    return;
  }
  const isVariantes = checkbox.checked;
  document.getElementById('stockSucursalSection').style.display = isVariantes ? 'none' : 'block';
  document.getElementById('variantesSection').style.display = isVariantes ? 'block' : 'none';
  if (!isVariantes) state.variantes = [];
  renderVariantes();
}

function renderVariantes() {
  const container = document.getElementById('variantesContainer');
  if (!container) return;

  if (!state.variantes || state.variantes.length === 0) {
    container.innerHTML = '<div class="text-muted small">No hay variantes. Haz clic en "Agregar Variante" para crear una.</div>';
    return;
  }

  container.innerHTML = state.variantes.map((v, i) => {
    const attrLabels = (v.atributoLabels || []).join(', ');
    return `<div class="variant-row border rounded p-2 mb-2">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>${Utils.esc(v.nombre || v.sku || '(SKU autom\u00e1tico)')}</strong>
          <span class="text-muted ms-2 small">${attrLabels}</span>
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline-primary me-1 editar-variante" data-idx="${i}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn btn-sm btn-outline-danger eliminar-variante" data-idx="${i}" title="Eliminar"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="small text-muted mt-1">
        Precios: ${v.precioPersonalizado ? `$${(v.precio1 || 0).toFixed(2)} / $${(v.precio2 || 0).toFixed(2)} / $${(v.precio3 || 0).toFixed(2)} / $${(v.precio4 || 0).toFixed(2)}` : 'Heredados del producto base'}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.editar-variante').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.idx);
      abrirModalVariante(idx);
    });
  });

  container.querySelectorAll('.eliminar-variante').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.idx);
      state.variantes.splice(idx, 1);
      renderVariantes();
    });
  });
}

async function abrirModalVariante(idx) {
  state.editingVarianteIdx = idx;
  const modal = new bootstrap.Modal(document.getElementById('varianteModal'));
  const isEdit = idx != null;
  document.getElementById('varianteModalTitle').textContent = isEdit ? 'Editar Variante' : 'Agregar Variante';
  document.getElementById('btnGuardarVariante').textContent = isEdit ? 'Actualizar' : 'Agregar';
  document.getElementById('formVariante').reset();
  document.getElementById('varianteIdx').value = idx != null ? idx : '';
  document.getElementById('varianteSku').value = '';
  document.getElementById('varianteNombre').value = '';
  document.getElementById('variantePrecio1').value = '';
  document.getElementById('variantePrecio2').value = '';
  document.getElementById('variantePrecio3').value = '';
  document.getElementById('variantePrecio4').value = '';

  await generarAtributosSelect();
  await generarVarianteStockInputs();

  if (idx != null) {
    const v = state.variantes[idx];
    if (v) {
      document.getElementById('varianteSku').value = v.sku || '';
      document.getElementById('varianteNombre').value = v.nombre || '';
      if (v.idAtributoValores) {
        v.idAtributoValores.forEach(valId => {
          const opt = document.querySelector(`.variante-atributo-select option[value="${valId}"]`);
          if (opt) opt.selected = true;
        });
      }
      if (v.inventarios) {
        v.inventarios.forEach(inv => {
          const stockInput = document.getElementById('vstock_' + inv.idSucursal);
          if (stockInput) stockInput.value = inv.stock || 0;
          const minInput = document.getElementById('vstockMin_' + inv.idSucursal);
          if (minInput) minInput.value = inv.stockMinimo || '';
          const maxInput = document.getElementById('vstockMax_' + inv.idSucursal);
          if (maxInput) maxInput.value = inv.stockMaximo || '';
        });
      }
    }
  }

  modal.show();
}

async function generarAtributosSelect() {
  const container = document.getElementById('varianteAtributosContainer');
  if (!container) return;

  if (state.atributos.length === 0) {
    await cargarAtributos();
  }

  if (state.atributos.length === 0) {
    container.innerHTML = '<div class="text-muted small">No hay atributos activos. Crea atributos primero.</div>';
    return;
  }

  container.innerHTML = state.atributos.map(a => {
    const options = a.valores
      .filter(v => v.activo !== false)
      .map(v => `<option value="${v.idValor}">${Utils.esc(v.valor)}${v.codigoSku ? ' (' + Utils.esc(v.codigoSku) + ')' : ''}</option>`)
      .join('');
    return `<div class="mb-2">
      <label class="form-label small fw-semibold">${Utils.esc(a.nombre)}</label>
      <select class="form-select form-select-sm variante-atributo-select" data-atributo="${a.idAtributo}">
        <option value="">Seleccionar...</option>
        ${options}
      </select>
    </div>`;
  }).join('');
}

async function generarVarianteStockInputs() {
  const container = document.getElementById('varianteStockInputs');
  if (!container) return;
  try {
    const sucursales = await API.get('/sucursales');
    container.innerHTML = '<div class="row g-2">' + sucursales.map(s =>
      `<div class="col-md-6 mb-1">
        <div class="p-1 border rounded">
          <div class="fw-semibold small mb-1">${Utils.esc(s.nombre)}</div>
          <div class="row g-1">
            <div class="col-4">
              <input type="number" class="form-control form-control-sm" id="vstock_${s.idSucursal}" placeholder="Stock" min="0" value="0">
            </div>
            <div class="col-4">
              <input type="number" class="form-control form-control-sm" id="vstockMin_${s.idSucursal}" placeholder="M&iacute;n" min="0">
            </div>
            <div class="col-4">
              <input type="number" class="form-control form-control-sm" id="vstockMax_${s.idSucursal}" placeholder="M&aacute;x" min="0">
            </div>
          </div>
        </div>
      </div>`
    ).join('') + '</div>';
  } catch (_) {
    container.innerHTML = '<p class="text-muted small">Error al cargar sucursales</p>';
  }
}

async function guardarVariante() {
  const idx = document.getElementById('varianteIdx').value;
  const isEditing = idx !== '';

  const idAtributoValores = [];
  const atributoLabels = [];
  document.querySelectorAll('.variante-atributo-select').forEach(sel => {
    if (sel.value) {
      idAtributoValores.push(parseInt(sel.value));
      const label = sel.options[sel.selectedIndex]?.text || '';
      const attrName = sel.closest('.mb-2')?.querySelector('.form-label')?.textContent || '';
      atributoLabels.push(attrName + ': ' + label);
    }
  });

  if (idAtributoValores.length === 0) {
    Utils.showToast('Selecciona al menos un valor de atributo', 'warning');
    return;
  }

  const inventarios = [];
  try {
    const sucursales = await API.get('/sucursales');
    sucursales.forEach(s => {
      const stockInput = document.getElementById('vstock_' + s.idSucursal);
      if (stockInput) {
        inventarios.push({
          idSucursal: s.idSucursal,
          stock: parseInt(stockInput.value) || 0,
          stockMinimo: parseInt(document.getElementById('vstockMin_' + s.idSucursal)?.value) || null,
          stockMaximo: parseInt(document.getElementById('vstockMax_' + s.idSucursal)?.value) || null,
        });
      }
    });
  } catch (_) {}

  const variante = {
    nombre: document.getElementById('varianteNombre').value.trim() || null,
    sku: document.getElementById('varianteSku').value.trim() || null,
    idAtributoValores: idAtributoValores,
    atributoLabels: atributoLabels,
    precio1: null,
    precio2: null,
    precio3: null,
    precio4: null,
    precioPersonalizado: false,
    inventarios: inventarios,
  };

  if (isEditing) {
    const existing = state.variantes[parseInt(idx)];
    variante.idVariante = existing?.idVariante || null;
    state.variantes[parseInt(idx)] = variante;
  } else {
    state.variantes.push(variante);
  }

  renderVariantes();
  bootstrap.Modal.getInstance(document.getElementById('varianteModal'))?.hide();
}

async function abrirModal(id) {
  state.editingId = id;

  if (id) {
    const p = await API.get('/productos/' + id);
    if (p.idProductoPadre) {
      return abrirEditarVarianteDesdeHijo(p);
    }
  }

  const modalEl = document.getElementById('productoModal');
  if (!modalEl) return;

  const modal = new bootstrap.Modal(modalEl);
  const title = document.getElementById('productoModalTitle');
  const form = document.getElementById('formProducto');
  form.reset();

  document.getElementById('productoId').value = '';
  state.variantes = [];

  const skuField = document.getElementById('productoSku');

  await generarStockInputs(id);

  if (id) {
    title.textContent = 'Editar Producto';
    try {
      const p = await API.get('/productos/' + id);
      document.getElementById('productoId').value = p.idProducto;
      document.getElementById('productoNombre').value = p.nombre || '';
      document.getElementById('productoDescripcion').value = p.descripcion || '';
      document.getElementById('productoPrecio1').value = p.precio1 || '';
      document.getElementById('productoPrecio2').value = p.precio2 || '';
      document.getElementById('productoPrecio3').value = p.precio3 || '';
      document.getElementById('productoPrecio4').value = p.precio4 || '';
      document.getElementById('productoCosto').value = p.costoPromedio || '';
      document.getElementById('productoActivo').checked = p.activo !== false;

      const esVariante = !!p.idProductoPadre;
      const tieneVariantes = p.tieneVariantes || (p.variantes && p.variantes.length > 0);
      document.getElementById('productoTieneVariantes').disabled = esVariante || tieneVariantes;

      if (p.tieneVariantes) {
        document.getElementById('productoTieneVariantes').checked = true;
        toggleVariantesMode();
        if (p.variantes) {
          state.variantes = p.variantes.map(v => ({
            idVariante: v.idProducto,
            nombre: v.nombre || '',
            sku: v.sku,
            idAtributoValores: (v.atributosAsignados || []).map(a => a.idValor),
            atributoLabels: (v.atributosAsignados || []).map(a => a.nombreAtributo + ': ' + a.nombreValor),
            precio1: v.precio1,
            precio2: v.precio2,
            precio3: v.precio3,
            precio4: v.precio4,
            precioPersonalizado: v.precioPersonalizado || false,
            inventarios: (v.inventarioSucursales || []).map(i => ({
              idSucursal: i.idSucursal,
              stock: i.stock || 0,
              stockMinimo: i.stockMinimo,
              stockMaximo: i.stockMaximo,
            })),
          }));
          renderVariantes();
        }
      } else {
        document.getElementById('productoTieneVariantes').checked = false;
        document.getElementById('productoTieneVariantes').disabled = false;
        toggleVariantesMode();
        const invs = p.inventarioSucursales || [];
        invs.forEach(inv => {
          const stockInput = document.getElementById('stock_' + inv.idSucursal);
          const minInput = document.getElementById('stockMin_' + inv.idSucursal);
          const maxInput = document.getElementById('stockMax_' + inv.idSucursal);
          if (stockInput) stockInput.value = inv.stock || 0;
          if (minInput) minInput.value = inv.stockMinimo || '';
          if (maxInput) maxInput.value = inv.stockMaximo || '';
        });
      }

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
    document.getElementById('productoTieneVariantes').checked = false;
    document.getElementById('productoTieneVariantes').disabled = false;
    toggleVariantesMode();
    if (skuField) {
      skuField.value = '';
      skuField.disabled = true;
    }
  }

  modal.show();
}

async function abrirEditarVarianteDesdeHijo(p) {
  const parentId = p.idProductoPadre;
  const parent = await API.get('/productos/' + parentId);

  state.editingId = parentId;
  const modalEl = document.getElementById('productoModal');
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById('productoId').value = parentId;
  document.getElementById('productoModalTitle').textContent = 'Editar Producto';
  document.getElementById('formProducto').reset();
  document.getElementById('productoNombre').value = parent.nombre || '';
  document.getElementById('productoDescripcion').value = parent.descripcion || '';
  document.getElementById('productoPrecio1').value = parent.precio1 || '';
  document.getElementById('productoPrecio2').value = parent.precio2 || '';
  document.getElementById('productoPrecio3').value = parent.precio3 || '';
  document.getElementById('productoPrecio4').value = parent.precio4 || '';
  document.getElementById('productoCosto').value = parent.costoPromedio || '';
  document.getElementById('productoActivo').checked = parent.activo !== false;

  const skuField = document.getElementById('productoSku');
  if (skuField) {
    skuField.value = parent.sku || '';
    skuField.readOnly = true;
  }

  document.getElementById('productoTieneVariantes').checked = true;
  document.getElementById('productoTieneVariantes').disabled = true;
  toggleVariantesMode();

  state.variantes = (parent.variantes || []).map(v => ({
    idVariante: v.idProducto,
    nombre: v.nombre || '',
    sku: v.sku,
    idAtributoValores: (v.atributosAsignados || []).map(a => a.idValor),
    atributoLabels: (v.atributosAsignados || []).map(a => a.nombreAtributo + ': ' + a.nombreValor),
    precio1: v.precio1,
    precio2: v.precio2,
    precio3: v.precio3,
    precio4: v.precio4,
    precioPersonalizado: v.precioPersonalizado || false,
    inventarios: (v.inventarioSucursales || []).map(i => ({
      idSucursal: i.idSucursal,
      stock: i.stock || 0,
      stockMinimo: i.stockMinimo,
      stockMaximo: i.stockMaximo,
    })),
  }));
  renderVariantes();

  modal.show();

  const idx = state.variantes.findIndex(v => v.idVariante === p.idProducto);
  if (idx >= 0) {
    abrirModalVariante(idx);
  }
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

  const tieneVariantes = document.getElementById('productoTieneVariantes').checked;

  let inventarios = [];
  if (!tieneVariantes) {
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
  }

  const data = {
    sku: document.getElementById('productoSku').value.trim(),
    nombre: document.getElementById('productoNombre').value.trim(),
    descripcion: document.getElementById('productoDescripcion').value.trim(),
    precio1: parseFloat(document.getElementById('productoPrecio1').value) || null,
    precio2: parseFloat(document.getElementById('productoPrecio2').value) || null,
    precio3: parseFloat(document.getElementById('productoPrecio3').value) || null,
    precio4: parseFloat(document.getElementById('productoPrecio4').value) || null,
    costoPromedio: parseFloat(document.getElementById('productoCosto').value) || null,
    activo: document.getElementById('productoActivo').checked,
    tieneVariantes: tieneVariantes,
    inventarios: inventarios,
  };

  if (tieneVariantes) {
    data.variantes = state.variantes;
  }

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

function getAtributosStr(p) {
  const attrs = p.atributosAsignados || [];
  if (attrs.length === 0) return '';
  return attrs.map(a => (a.nombreAtributo || '') + ': ' + (a.nombreValor || '')).join(', ');
}

function buildInventoryRows(products, filterSucursalId) {
  const rows = [];
  for (const p of products) {
    if (p.tieneVariantes) continue;
    const atributos = getAtributosStr(p);
    const invList = p.inventarioSucursales || [];
    if (invList.length === 0) {
      if (filterSucursalId) continue;
      rows.push({
        sku: p.sku || '', nombre: p.nombre || '', tipo: p.tieneVariantes ? 'Padre' : 'Simple',
        sucursal: '', stock: p.stockActual || 0, stockMinimo: '', stockMaximo: '',
        costoPromedio: p.costoPromedio || 0, costoTotal: (p.costoPromedio || 0) * (p.stockActual || 0),
        estado: p.activo ? 'Activo' : 'Inactivo', atributos,
      });
    } else {
      for (const inv of invList) {
        if (filterSucursalId && inv.idSucursal != filterSucursalId) continue;
        rows.push({
          sku: p.sku || '', nombre: p.nombre || '', tipo: p.tieneVariantes ? 'Padre' : 'Simple',
          sucursal: inv.sucursalNombre || '', stock: inv.stock || 0,
          stockMinimo: inv.stockMinimo ?? '', stockMaximo: inv.stockMaximo ?? '',
          costoPromedio: p.costoPromedio || 0, costoTotal: (p.costoPromedio || 0) * (inv.stock || 0),
          estado: p.activo ? 'Activo' : 'Inactivo', atributos,
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
    const headers = ['SKU', 'Nombre', 'Tipo', 'Sucursal', 'Stock', 'Stock Min', 'Stock Max', 'Costo Promedio', 'Costo Total', 'Atributos', 'Estado'];
    if (sucursalId) {
      const csvRows = rows.map(r => [r.sku, r.nombre, r.tipo, r.sucursal, r.stock, r.stockMinimo, r.stockMaximo, r.costoPromedio, r.costoTotal, r.atributos, r.estado]);
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
        allRows.push(['--- ' + sucursal + ' ---', '', '', '', '', '', '', '', '', '', '']);
        for (const r of items) {
          allRows.push([r.sku, r.nombre, r.tipo, r.sucursal, r.stock, r.stockMinimo, r.stockMaximo, r.costoPromedio, r.costoTotal, r.atributos, r.estado]);
        }
      }
      downloadCSV(headers, allRows, 'inventario_total_' + new Date().toISOString().slice(0, 10) + '.csv');
    }
    Utils.showToast('Inventario exportado', 'success');
  } catch (err) { Utils.showToast('Error al exportar: ' + err.message, 'error'); }
}
