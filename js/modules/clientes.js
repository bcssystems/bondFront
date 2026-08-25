let state = { data: [], currentPage: 0, totalPages: 0, pageSize: 10, editingId: null, paises: [] };

const REGIMENES_FISCALES = [
  { value: "601", label: "601 - General de Ley Personas Morales" },
  { value: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { value: "606", label: "606 - Arrendamiento" },
  { value: "607", label: "607 - Enajenaci\u00f3n o Adquisici\u00f3n de Bienes" },
  { value: "608", label: "608 - Dem\u00e1s Ingresos" },
  { value: "610", label: "610 - Residentes en el Extranjero sin EP" },
  { value: "611", label: "611 - Dividendos (Socios y Accionistas)" },
  { value: "612", label: "612 - Personas F\u00edsicas con Act. Empresariales" },
  { value: "614", label: "614 - Ingresos por Intereses" },
  { value: "616", label: "616 - Sin Obligaciones Fiscales" },
  { value: "621", label: "621 - R\u00e9gimen de Incorporaci\u00f3n Fiscal" },
  { value: "625", label: "625 - Act. Empresariales con Plataformas Tecnol\u00f3gicas" },
  { value: "626", label: "626 - R\u00e9gimen Simplificado de Confianza" },
];

export function init() {
  bindEvents();
  cargarPaises();
  cargarRegimenes();
  cargarClientes(0);
}

function bindEvents() {
  document.getElementById('btnNuevoCliente')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarCliente')?.addEventListener('click', guardarCliente);
  document.getElementById('tableClientesBody')?.addEventListener('click', handleTableClick);
  const searchInput = document.getElementById('searchCliente');
  if (searchInput) {
    searchInput.addEventListener('input', Utils.debounce(() => {
      cargarClientes(0);
    }, 400));
  }
  document.getElementById('clienteTieneCredito')?.addEventListener('change', function() {
    toggleLimiteCreditoGroup(this.checked);
  });
  document.getElementById('clienteCp')?.addEventListener('input', Utils.debounce(function() {
    const cp = this.value.trim();
    if (cp.length === 5) {
      cargarColonias(cp, '');
    }
  }, 500));
}

async function cargarPaises() {
  try {
    state.paises = await API.get('/catalogos/paises');
    const sel = document.getElementById('clientePais');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar...</option>' +
        state.paises.map(p => `<option value="${p.codigo}">${p.nombre} (${p.prefijo})</option>`).join('');
      Utils.makeSearchableSelect('clientePais');
    }
  } catch (_) {}
}

function cargarRegimenes() {
  const sel = document.getElementById('clienteRegimen');
  if (sel) {
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      REGIMENES_FISCALES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
  }
}

async function cargarClientes(page) {
  state.currentPage = page;
  const search = document.getElementById('searchCliente')?.value || '';
  try {
    const result = await API.get('/clientes?search=' + encodeURIComponent(search) + '&page=' + page + '&size=' + state.pageSize);
    state.data = result.content;
    state.totalPages = result.totalPages;
    renderTable();
    renderPagination();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderTable() {
  const tbody = document.getElementById('tableClientesBody');
  if (!tbody) return;

  if (!state.data || state.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-address-book"></i><p>No hay clientes</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.data.map(c => `<tr>
    <td>${Utils.esc(c.nombre)}</td>
    <td>${Utils.esc(c.apellidoPaterno || '')} ${Utils.esc(c.apellidoMaterno || '')}</td>
    <td>${Utils.esc(c.telefono) || '-'}</td>
    <td>${Utils.esc(c.codigoPais) || '-'}</td>
    <td>${Utils.esc(c.regimenFiscal) || '-'}</td>
    <td style="max-width:160px;white-space:normal">${Utils.esc(c.direccion || '')}${c.cp ? ' (CP: ' + c.cp + ')' : ''}</td>
    <td class="text-center">${c.tieneCredito ? '<span class="badge bg-info"><i class="fas fa-check"></i></span>' : '<span class="text-muted">-</span>'}</td>
    <td class="text-end">${c.saldoActual != null ? '$' + c.saldoActual.toFixed(2) : '-'}</td>
    <td class="acciones-cell">
      <button class="btn-action btn-action-edit" data-id="${c.idCliente}" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn-action btn-action-delete" data-id="${c.idCliente}" title="Eliminar"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

function renderPagination() {
  const container = document.getElementById('paginationClientes');
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
      if (page >= 0 && page < state.totalPages) cargarClientes(page);
    });
  });
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.dataset.action === 'edit' || btn.classList.contains('btn-action-edit')) abrirModal(id);
  else if (btn.dataset.action === 'delete' || btn.classList.contains('btn-action-delete')) confirmarEliminar(id);
}

function abrirModal(id) {
  state.editingId = id;
  const modal = new bootstrap.Modal(document.getElementById('clienteModal'));
  document.getElementById('clienteModalTitle').textContent = id ? 'Editar Cliente' : 'Nuevo Cliente';
  document.getElementById('formCliente').reset();
  document.getElementById('clienteId').value = '';

  if (id) {
    const c = state.data.find(c => c.idCliente === id);
    if (c) {
      document.getElementById('clienteId').value = c.idCliente;
      document.getElementById('clienteNombre').value = c.nombre || '';
      document.getElementById('clienteApaterno').value = c.apellidoPaterno || '';
      document.getElementById('clienteAmaterno').value = c.apellidoMaterno || '';
      document.getElementById('clienteTelefono').value = c.telefono || '';
      document.getElementById('clientePais').value = c.codigoPais || '';
      Utils.updateSearchableOptions('clientePais');
      document.getElementById('clienteWhatsapp').value = c.whatsapp || '';
      document.getElementById('clienteEmpresa').value = c.empresa || '';
      document.getElementById('clienteRegimen').value = c.regimenFiscal || '';
      document.getElementById('clienteCp').value = c.cp || '';
      document.getElementById('clienteEstado').value = c.estado || '';
      document.getElementById('clienteMunicipio').value = c.municipio || '';
      document.getElementById('clienteCalle').value = c.calle || '';
      document.getElementById('clienteNumExt').value = c.numExt || '';
      document.getElementById('clienteNumInt').value = c.numInt || '';
      // Load colonias if CP is set
      if (c.cp) {
        cargarColonias(c.cp, c.colonia || '');
      }
      document.getElementById('clienteTieneCredito').checked = c.tieneCredito || false;
      document.getElementById('clienteLimiteCredito').value = c.limiteCredito || '';
      toggleLimiteCreditoGroup(c.tieneCredito || false);
    } else {
      document.getElementById('clienteTieneCredito').checked = false;
      document.getElementById('clienteLimiteCredito').value = '';
      toggleLimiteCreditoGroup(false);
    }
  }
  modal.show();
}

function toggleLimiteCreditoGroup(show) {
  const group = document.getElementById('clienteLimiteCreditoGroup');
  if (group) group.style.display = show ? 'block' : 'none';
}

async function guardarCliente() {
  const tieneCredito = document.getElementById('clienteTieneCredito').checked;
  const data = {
    nombre: document.getElementById('clienteNombre').value.trim(),
    apellidoPaterno: document.getElementById('clienteApaterno').value.trim(),
    apellidoMaterno: document.getElementById('clienteAmaterno').value.trim(),
    telefono: document.getElementById('clienteTelefono').value.trim(),
    codigoPais: document.getElementById('clientePais').value,
    whatsapp: document.getElementById('clienteWhatsapp').value.trim(),
    empresa: document.getElementById('clienteEmpresa').value.trim(),
    regimenFiscal: document.getElementById('clienteRegimen').value,
    cp: document.getElementById('clienteCp').value.trim() || null,
    direccion: buildDireccionString(),
    tieneCredito: tieneCredito,
    limiteCredito: tieneCredito ? (parseFloat(document.getElementById('clienteLimiteCredito').value) || 0) : 0,
  };

  if (!data.nombre) { Utils.showToast('El nombre es obligatorio', 'warning'); return; }
  if (!data.apellidoPaterno) { Utils.showToast('El apellido paterno es obligatorio', 'warning'); return; }
  if (!data.telefono) { Utils.showToast('El tel\u00e9fono es obligatorio', 'warning'); return; }
  if (!data.regimenFiscal) { Utils.showToast('El r\u00e9gimen fiscal es obligatorio', 'warning'); return; }

  try {
    if (state.editingId) {
      await API.put('/clientes/' + state.editingId, data);
      Utils.showToast('Cliente actualizado', 'success');
    } else {
      await API.post('/clientes', data);
      Utils.showToast('Cliente creado', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('clienteModal'))?.hide();
    cargarClientes(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function confirmarEliminar(id) {
  const confirmed = await Utils.confirmAction('¿Eliminar este cliente?', 'Confirmar', 'Eliminar');
  if (!confirmed) return;
  try {
    await API.del('/clientes/' + id);
    Utils.showToast('Cliente eliminado', 'success');
    cargarClientes(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function buildDireccionString() {
  const calle = document.getElementById('clienteCalle').value.trim();
  const numExt = document.getElementById('clienteNumExt').value.trim();
  const numInt = document.getElementById('clienteNumInt').value.trim();
  const colonia = document.getElementById('clienteColonia')?.value || '';
  const municipio = document.getElementById('clienteMunicipio').value.trim();
  const estado = document.getElementById('clienteEstado').value.trim();
  const cp = document.getElementById('clienteCp').value.trim();

  const parts = [];
  if (calle) parts.push(calle);
  if (numExt) parts.push('Ext. ' + numExt);
  if (numInt) parts.push('Int. ' + numInt);
  if (colonia) parts.push(colonia);
  if (municipio) parts.push(municipio);
  if (estado) parts.push(estado);
  if (cp) parts.push('C.P. ' + cp);

  return parts.join(', ');
}

const cpCache = {};

async function cargarColonias(cp, selectedColonia) {
  if (!cp || cp.length !== 5) return;
  if (cpCache[cp]) {
    aplicarDatosCP(cpCache[cp], selectedColonia);
    return;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://api.zippopotam.us/MX/' + cp, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (data && data.places) {
      const result = {
        colonias: data.places.map(p => p['place name']),
        estado: data.places[0]?.state || ''
      };
      cpCache[cp] = result;
      aplicarDatosCP(result, selectedColonia);
    }
  } catch (_) {
    document.getElementById('clienteEstado').value = '';
    document.getElementById('clienteColonia').innerHTML = '<option value="">No disponible</option>';
    console.warn('Error al consultar CP:', cp);
  }
}

function aplicarDatosCP(result, selectedColonia) {
  const sel = document.getElementById('clienteColonia');
  if (sel) {
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      result.colonias.map(c => `<option value="${c}" ${c === selectedColonia ? 'selected' : ''}>${c}</option>`).join('');
    sel.disabled = false;
  }
  const estadoInput = document.getElementById('clienteEstado');
  if (estadoInput) estadoInput.value = result.estado;
}
