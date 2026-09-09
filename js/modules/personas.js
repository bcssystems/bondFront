let state = { data: [], currentPage: 0, totalPages: 0, pageSize: 10, editingId: null };
let roles = [];
let permisosPorModulo = {};

export function init() {
  bindEvents();
  cargarPersonas(0);
  cargarRolesYPermisos();
}

function bindEvents() {
  document.getElementById('btnNuevaPersona')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarPersona')?.addEventListener('click', guardarPersona);
  document.getElementById('tablePersonasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('personaPermisosAdicionales')?.addEventListener('change', e => {
    if (e.target.classList.contains('permiso-modulo-check')) seleccionarModuloPermiso(e.target);
  });
}

async function cargarRolesYPermisos() {
  try {
    const [rolesResp, permisosResp] = await Promise.all([
      API.get('/roles'),
      API.get('/roles/permisos'),
    ]);
    roles = rolesResp || [];
    permisosPorModulo = permisosResp || {};
    cargarSelectRoles();
  } catch (err) {
    console.warn('No se pudieron cargar roles/permisos', err);
  }
}

function cargarSelectRoles() {
  const sel = document.getElementById('personaRol');
  if (!sel) return;
  sel.innerHTML = (roles || [])
    .map(r => `<option value="${r.idRol}" ${r.activo === false ? 'disabled' : ''}>${Utils.esc(r.nombre)}${r.activo === false ? ' (Inactivo)' : ''}</option>`)
    .join('');
  Utils.makeSearchableSelect('personaRol');
}

function permisosDelRol(idRol) {
  const rol = (roles || []).find(r => r.idRol === Number(idRol));
  return rol && rol.permisos ? rol.permisos : [];
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
    <td><span class="badge bg-primary-light text-primary">${p.rol && p.rol.nombre ? Utils.esc(p.rol.nombre) : '-'}</span></td>
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

function renderPermisosAdicionales(idRol, seleccionados) {
  const container = document.getElementById('personaPermisosAdicionales');
  if (!container) return;

  if (!permisosPorModulo || Object.keys(permisosPorModulo).length === 0) {
    container.innerHTML = '<div class="text-muted small">No hay permisos disponibles</div>';
    return;
  }

  const permisosRol = permisosDelRol(idRol);
  const baseClaves = new Set(permisosRol || []);

  let html = '';
  for (const [modulo, permisos] of Object.entries(permisosPorModulo)) {
    const hayBase = permisos.some(p => baseClaves.has(p.clave));
    const hayAdicional = permisos.some(p => !baseClaves.has(p.clave));
    if (!hayBase && !hayAdicional) continue;

    html += `<div class="permiso-grupo mb-2" data-modulo="${Utils.esc(modulo)}">
      <div class="permiso-grupo-header d-flex align-items-center gap-2 mb-1">
        <input type="checkbox" class="form-check-input permiso-modulo-check" data-modulo="${Utils.esc(modulo)}">
        <span>${Utils.esc(modulo)}</span>
        ${hayBase ? '<small class="text-muted fw-normal">(incluye permisos del rol base)</small>' : ''}
      </div>
      <div class="permiso-grupo-items">`;
    permisos.forEach(p => {
      const esBase = baseClaves.has(p.clave);
      let checked = '';
      let disabledAttr = '';
      let extraClass = '';
      let title = '';
      if (esBase) {
        checked = 'checked';
        disabledAttr = 'disabled';
        extraClass = ' permiso-item-base';
        title = 'Ya incluido en el rol base';
      } else if ((seleccionados || []).includes(p.idPermiso)) {
        checked = 'checked';
      }
      html += `<label class="permiso-item${extraClass}" title="${title}">
        <input type="checkbox" class="form-check-input permiso-check" data-modulo="${Utils.esc(modulo)}" data-id="${p.idPermiso}" ${checked} ${disabledAttr}>
        <span>${Utils.esc(p.nombre)}</span>
        ${esBase ? '<small class="text-muted"><i class="fas fa-lock ms-1"></i></small>' : ''}
      </label>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html || '<div class="text-muted small">No hay permisos disponibles</div>';
  sincronizarChecksModulosPermiso(container);
}

function sincronizarChecksModulosPermiso(container) {
  if (!container) return;
  container.querySelectorAll('.permiso-grupo').forEach(grupo => {
    const checks = grupo.querySelectorAll('.permiso-check:not(:disabled)');
    const moduloCheck = grupo.querySelector('.permiso-modulo-check');
    if (!moduloCheck) return;
    const total = checks.length;
    const marcados = Array.from(checks).filter(c => c.checked).length;
    moduloCheck.checked = total > 0 && marcados === total;
    moduloCheck.indeterminate = marcados > 0 && marcados < total;
  });
}

function seleccionarModuloPermiso(moduloCheck) {
  const grupo = moduloCheck.closest('.permiso-grupo');
  if (!grupo) return;
  const checked = moduloCheck.checked;
  grupo.querySelectorAll('.permiso-check:not(:disabled)').forEach(cb => cb.checked = checked);
  sincronizarChecksModulosPermiso(grupo.closest('#personaPermisosAdicionales'));
}

function abrirModal(id) {
  state.editingId = id;
  const modal = new bootstrap.Modal(document.getElementById('personaModal'));
  document.getElementById('personaModalTitle').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('formPersona').reset();
  document.getElementById('personaId').value = '';
  cargarSelectRoles();

  if (id) {
    const p = state.data.find(p => p.idPersona === id);
    if (p) {
      document.getElementById('personaId').value = p.idPersona;
      document.getElementById('personaNombre').value = p.nombre || '';
      document.getElementById('personaApellido').value = p.apellido || '';
      document.getElementById('personaUsuario').value = p.usuario || '';
      document.getElementById('personaRol').value = p.rol && p.rol.idRol;
      Utils.updateSearchableOptions('personaRol');
      document.getElementById('personaPassword').required = false;
      document.getElementById('personaActiva').checked = p.activa !== false;
      renderPermisosAdicionales(p.rol ? p.rol.idRol : null, p.permisosAdicionales || []);
    }
  } else {
    document.getElementById('personaPassword').required = true;
    document.getElementById('personaActiva').checked = true;
    const primerRol = (roles || [])[0];
    renderPermisosAdicionales(primerRol ? primerRol.idRol : null, []);
  }

  const sel = document.getElementById('personaRol');
  sel.onchange = () => {
    const seleccionados = Array.from(document.querySelectorAll('#personaPermisosAdicionales .permiso-check:checked:not(:disabled)'))
      .map(cb => Number(cb.dataset.id));
    renderPermisosAdicionales(sel.value, seleccionados);
  };

  modal.show();
}

async function guardarPersona() {
  const data = {
    nombre: document.getElementById('personaNombre').value.trim(),
    apellido: document.getElementById('personaApellido').value.trim(),
    usuario: document.getElementById('personaUsuario').value.trim(),
    password: document.getElementById('personaPassword').value,
    idRol: Number(document.getElementById('personaRol').value),
    permisosAdicionales: Array.from(document.querySelectorAll('.permiso-check:checked:not(:disabled)'))
      .map(cb => Number(cb.dataset.id)),
    activa: document.getElementById('personaActiva').checked,
  };

  if (!data.nombre || !data.apellido || !data.usuario) {
    Utils.showToast('Nombre, apellido y usuario son obligatorios', 'warning');
    return;
  }
  if (!data.idRol) {
    Utils.showToast('Selecciona un rol base', 'warning');
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