let state = { data: [], currentPage: 0, totalPages: 0, pageSize: 10, editingId: null };

export function init() {
  bindEvents();
  cargarPersonas(0);
}

function bindEvents() {
  document.getElementById('btnNuevaPersona')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarPersona')?.addEventListener('click', guardarPersona);
  document.getElementById('tablePersonasBody')?.addEventListener('click', handleTableClick);
}

async function cargarPersonas(page) {
  state.currentPage = page;
  try {
    const result = await API.get('/personas?page=' + page + '&size=' + state.pageSize + '&sort=idPersona,DESC');
    state.data = result.content;
    state.totalPages = result.totalPages;
    renderTable();
    renderPagination();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderTable() {
  const tbody = document.getElementById('tablePersonasBody');
  if (!tbody) return;

  if (!state.data || state.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.data.map(p => `<tr class="${p.activa ? '' : 'inactive-row'}">
    <td>${Utils.esc(p.nombre)} ${Utils.esc(p.apellido)}</td>
    <td>${Utils.esc(p.usuario)}</td>
    <td><span class="badge bg-primary-light text-primary">${p.rol}</span></td>
    <td>${Utils.formatDate(p.fechaRegistro)}</td>
    <td><span class="badge-status ${p.activa ? 'badge-active' : 'badge-inactive'}">${p.activa ? 'Activo' : 'Inactivo'}</span></td>
    <td class="acciones-cell">
      <button class="btn-action btn-action-edit" data-id="${p.idPersona}" data-action="edit" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn-action btn-action-delete" data-id="${p.idPersona}" data-action="delete" title="Eliminar"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

function renderPagination() {
  const container = document.getElementById('paginationPersonas');
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
      if (page >= 0 && page < state.totalPages) cargarPersonas(page);
    });
  });
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.dataset.action === 'edit') abrirModal(id);
  else if (btn.dataset.action === 'delete') confirmarEliminar(id);
}

function abrirModal(id) {
  state.editingId = id;
  const modal = new bootstrap.Modal(document.getElementById('personaModal'));
  document.getElementById('personaModalTitle').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('formPersona').reset();
  document.getElementById('personaId').value = '';

  const roles = ['ADMINISTRADOR', 'SISTEMAS', 'AUDITORIAS', 'USUARIO'];
  const sel = document.getElementById('personaRol');
  sel.innerHTML = roles.map(r => `<option value="${r}">${r}</option>`).join('');
  Utils.makeSearchableSelect('personaRol');

  if (id) {
    const p = state.data.find(p => p.idPersona === id);
    if (p) {
      document.getElementById('personaId').value = p.idPersona;
      document.getElementById('personaNombre').value = p.nombre || '';
      document.getElementById('personaApellido').value = p.apellido || '';
      document.getElementById('personaUsuario').value = p.usuario || '';
      sel.value = p.rol;
      document.getElementById('personaPassword').required = false;
      document.getElementById('personaActiva').checked = p.activa !== false;
    }
  } else {
    document.getElementById('personaPassword').required = true;
    document.getElementById('personaActiva').checked = true;
  }
  modal.show();
}

async function guardarPersona() {
  const data = {
    nombre: document.getElementById('personaNombre').value.trim(),
    apellido: document.getElementById('personaApellido').value.trim(),
    usuario: document.getElementById('personaUsuario').value.trim(),
    password: document.getElementById('personaPassword').value,
    rol: document.getElementById('personaRol').value,
    activa: document.getElementById('personaActiva').checked,
  };

  if (!data.nombre || !data.apellido || !data.usuario) {
    Utils.showToast('Nombre, apellido y usuario son obligatorios', 'warning');
    return;
  }
  if (!state.editingId && !data.password) {
    Utils.showToast('La contraseña es obligatoria', 'warning');
    return;
  }

  try {
    if (state.editingId) {
      await API.put('/personas/' + state.editingId, data);
      Utils.showToast('Usuario actualizado', 'success');
    } else {
      await API.post('/personas', data);
      Utils.showToast('Usuario creado', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('personaModal'))?.hide();
    cargarPersonas(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function confirmarEliminar(id) {
  const confirmed = await Utils.confirmAction('¿Desactivar este usuario?', 'Confirmar', 'Desactivar');
  if (!confirmed) return;
  try {
    await API.del('/personas/' + id);
    Utils.showToast('Usuario desactivado', 'success');
    cargarPersonas(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}
