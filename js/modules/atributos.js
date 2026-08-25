let state = { data: [], editingId: null };

export function init() {
  bindEvents();
  cargarAtributos();
}

function bindEvents() {
  document.getElementById('btnNuevoAtributo')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarAtributo')?.addEventListener('click', guardarAtributo);
  document.getElementById('tableAtributosBody')?.addEventListener('click', handleTableClick);
  document.getElementById('btnAgregarValor')?.addEventListener('click', agregarFilaValor);
}

async function cargarAtributos() {
  try {
    state.data = await API.get('/atributos');
    renderTable();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderTable() {
  const tbody = document.getElementById('tableAtributosBody');
  if (!tbody) return;

  if (!state.data || state.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fas fa-tags"></i><p>No hay atributos</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.data.map(a => `<tr class="${a.activo ? '' : 'inactive-row'}">
    <td><strong>${Utils.esc(a.nombre)}</strong></td>
    <td>
      ${(a.valores || []).map(v =>
        `<span class="badge bg-secondary me-1 mb-1">${Utils.esc(v.valor)}${v.codigoSku ? ' (' + Utils.esc(v.codigoSku) + ')' : ''}</span>`
      ).join('')}
    </td>
    <td><span class="badge-status ${a.activo ? 'badge-active' : 'badge-inactive'}">${a.activo ? 'Activo' : 'Inactivo'}</span></td>
    <td class="acciones-cell">
      <button class="btn-action btn-action-edit" data-id="${a.idAtributo}" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn-action btn-action-delete" data-id="${a.idAtributo}" title="Eliminar"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.dataset.action === 'edit' || btn.classList.contains('btn-action-edit')) abrirModal(id);
  else if (btn.dataset.action === 'delete' || btn.classList.contains('btn-action-delete')) confirmarEliminar(id);
}

function renderValores(valores) {
  const container = document.getElementById('atributoValoresContainer');
  if (!valores || valores.length === 0) {
    container.innerHTML = '<div class="text-muted small">No hay valores agregados</div>';
    return;
  }
  container.innerHTML = valores.map((v, i) => `
    <div class="row g-2 mb-2 align-items-center valor-row">
      <input type="hidden" class="valor-id" value="${v.idValor || ''}">
      <div class="col-5">
        <input type="text" class="form-control form-control-sm valor-nombre" value="${Utils.esc(v.valor)}" placeholder="Valor" maxlength="200">
      </div>
      <div class="col-4">
        <input type="text" class="form-control form-control-sm valor-codigo" value="${Utils.esc(v.codigoSku || '')}" placeholder="C&oacute;digo SKU" maxlength="10">
      </div>
      <div class="col-3 d-flex align-items-center gap-2">
        <input type="checkbox" class="form-check-input mt-0 valor-activo" ${v.activo !== false ? 'checked' : ''} title="Activo">
        <button type="button" class="btn btn-sm btn-outline-danger valor-remove" title="Eliminar"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.valor-remove').forEach(btn => {
    btn.addEventListener('click', function() {
      const row = this.closest('.valor-row');
      if (container.querySelectorAll('.valor-row').length <= 1) {
        Utils.showToast('Debe haber al menos un valor', 'warning');
        return;
      }
      row.remove();
    });
  });
}

function agregarFilaValor() {
  const container = document.getElementById('atributoValoresContainer');
  const emptyMsg = container.querySelector('.text-muted');
  if (emptyMsg) container.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 align-items-center valor-row';
  row.innerHTML = `
    <input type="hidden" class="valor-id" value="">
    <div class="col-5">
      <input type="text" class="form-control form-control-sm valor-nombre" placeholder="Valor" maxlength="200">
    </div>
    <div class="col-4">
      <input type="text" class="form-control form-control-sm valor-codigo" placeholder="C&oacute;digo SKU" maxlength="10">
    </div>
    <div class="col-3 d-flex align-items-center gap-2">
      <input type="checkbox" class="form-check-input mt-0 valor-activo" title="Activo" checked>
      <button type="button" class="btn btn-sm btn-outline-danger valor-remove" title="Eliminar"><i class="fas fa-times"></i></button>
    </div>
  `;
  row.querySelector('.valor-remove').addEventListener('click', function() {
    if (container.querySelectorAll('.valor-row').length <= 1) {
      Utils.showToast('Debe haber al menos un valor', 'warning');
      return;
    }
    row.remove();
  });
  container.appendChild(row);
}

function abrirModal(id) {
  state.editingId = id;
  const modal = new bootstrap.Modal(document.getElementById('atributoModal'));
  document.getElementById('atributoModalTitle').textContent = id ? 'Editar Atributo' : 'Nuevo Atributo';
  document.getElementById('formAtributo').reset();
  document.getElementById('atributoId').value = '';
  document.getElementById('atributoActivo').checked = true;
  renderValores([]);

  if (id) {
    const a = state.data.find(a => a.idAtributo === id);
    if (a) {
      document.getElementById('atributoId').value = a.idAtributo;
      document.getElementById('atributoNombre').value = a.nombre || '';
      document.getElementById('atributoActivo').checked = a.activo !== false;
      renderValores(a.valores || []);
    }
  }
  modal.show();
}

async function guardarAtributo() {
  const valores = [];
  document.querySelectorAll('.valor-row').forEach(row => {
    const nombre = row.querySelector('.valor-nombre').value.trim();
    if (nombre) {
      valores.push({
        idValor: row.querySelector('.valor-id').value ? parseInt(row.querySelector('.valor-id').value) : null,
        valor: nombre,
        codigoSku: row.querySelector('.valor-codigo').value.trim() || null,
        activo: row.querySelector('.valor-activo').checked,
      });
    }
  });

  if (valores.length === 0) {
    Utils.showToast('Agrega al menos un valor', 'warning');
    return;
  }

  const data = {
    nombre: document.getElementById('atributoNombre').value.trim(),
    activo: document.getElementById('atributoActivo').checked,
    valores: valores,
  };

  if (!data.nombre) { Utils.showToast('El nombre es obligatorio', 'warning'); return; }

  try {
    if (state.editingId) {
      await API.put('/atributos/' + state.editingId, data);
      Utils.showToast('Atributo actualizado', 'success');
    } else {
      await API.post('/atributos', data);
      Utils.showToast('Atributo creado', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('atributoModal'))?.hide();
    cargarAtributos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function confirmarEliminar(id) {
  const confirmed = await Utils.confirmAction('Desactivar atributo?', 'Confirmar', 'Desactivar');
  if (!confirmed) return;
  try {
    await API.del('/atributos/' + id);
    Utils.showToast('Atributo desactivado', 'success');
    cargarAtributos();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}
