const Utils = {
  showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle',
    };

    const toast = document.createElement('div');
    toast.className = 'toast-custom toast-' + type;
    toast.innerHTML =
      '<i class="fas ' + (icons[type] || icons.info) + ' toast-icon"></i>' +
      '<span class="toast-text">' + message + '</span>' +
      '<button class="toast-close">&times;</button>';

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', function () {
      Utils.removeToast(toast);
    });

    if (duration > 0) {
      setTimeout(function () {
        Utils.removeToast(toast);
      }, duration);
    }
  },

  removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  },

  async cargarVista(ruta, modulo) {
    try {
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.querySelectorAll('.modal.show').forEach(m => {
        try {
          const inst = bootstrap.Modal.getInstance(m);
          if (inst) inst.hide();
        } catch (_) {}
        m.classList.remove('show');
      });
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');

      const resp = await fetch(ruta);
      if (!resp.ok) throw new Error('Error al cargar la vista');
      const html = await resp.text();
      document.getElementById('main-content').innerHTML = html;

      const scripts = document.getElementById('main-content').querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });

      if (modulo) {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
          mainContent.dataset.currentView = ruta;
          mainContent.dataset.currentModule = modulo;
        }
        try {
          const module = await import('./modules/' + modulo + '.js');
          if (module && typeof module.init === 'function') {
            module.init();
          }
        } catch (err) {
          console.warn('Módulo no disponible:', modulo, err);
        }
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  recargarModulo() {
    const main = document.getElementById('main-content');
    if (main && main.dataset.currentView && main.dataset.currentModule) {
      this.cargarVista(main.dataset.currentView, main.dataset.currentModule);
    } else {
      this.showToast('No hay módulo activo para recargar', 'warning');
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return dateStr;
    }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return dateStr;
    }
  },

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  confirmAction(message, title, buttonText) {
    return new Promise(function (resolve) {
      const modalEl = document.getElementById('confirmModal');
      if (!modalEl) {
        resolve(false);
        return;
      }

      document.getElementById('confirmTitle').textContent = title || '¿Estás seguro?';
      document.getElementById('confirmMsg').innerHTML = '<strong>' + (message || 'Esta acción no se puede deshacer.') + '</strong>';

      const confirmBtn = document.getElementById('confirmBtn');
      confirmBtn.textContent = buttonText || 'Eliminar';

      const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

      const cleanup = function () { try { modal.hide(); } catch (_) {} };

      confirmBtn.onclick = function () {
        cleanup();
        resolve(true);
      };

      modalEl.addEventListener('hidden.bs.modal', function () {
        resolve(false);
      }, { once: true });

      modal.show();
    });
  },

  confirm(message, title) {
    return this.confirmAction(message, title || '\u00bfEst\u00e1s seguro?', 'Confirmar');
  },

  promptInput(title, label, defaultValue) {
    return new Promise(function (resolve) {
      const overlay = document.createElement('div');
      overlay.className = 'prompt-overlay';
      overlay.style.pointerEvents = 'auto';
      overlay.innerHTML =
        '<div class="prompt-dialog">' +
          '<h6 class="fw-bold mb-2">' + title + '</h6>' +
          '<label class="form-label small">' + label + '</label>' +
          '<input type="text" class="form-control form-control-sm mb-2 prompt-input" value="' + (defaultValue || '') + '">' +
          '<div class="d-flex gap-2 justify-content-end">' +
            '<button class="btn btn-sm btn-light prompt-cancel">Cancelar</button>' +
            '<button class="btn btn-sm btn-primary prompt-ok">Aceptar</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      const input = overlay.querySelector('.prompt-input');
      input.focus();
      input.select();

      const cleanup = function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      };

      overlay.querySelector('.prompt-cancel').addEventListener('click', function () {
        cleanup();
        resolve(null);
      });

      overlay.querySelector('.prompt-ok').addEventListener('click', function () {
        const val = input.value.trim();
        cleanup();
        resolve(val || null);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          overlay.querySelector('.prompt-ok').click();
        } else if (e.key === 'Escape') {
          overlay.querySelector('.prompt-cancel').click();
        }
      });
    });
  },

  debounce(fn, delay) {
    let timer;
    return function () {
      const context = this;
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  },

  esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  getStockClass(stock, min) {
    if (min && stock <= min) return 'stock-bajo';
    if (min && stock <= min * 1.5) return 'stock-medio';
    return 'stock-ok';
  },

  makeSearchableSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const wrapper = select.parentElement;
    if (wrapper.classList.contains('searchable-wrapper')) {
      this.updateSearchableOptions(selectId);
      return;
    }

    wrapper.classList.add('searchable-wrapper');
    select.classList.add('searchable-original');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control searchable-input';
    input.placeholder = 'Seleccionar...';
    input.autocomplete = 'off';
    input.dataset.selectId = selectId;

    const dropdown = document.createElement('div');
    dropdown.className = 'searchable-dropdown';

    select.parentNode.insertBefore(input, select.nextSibling);
    select.parentNode.insertBefore(dropdown, input.nextSibling);

    select.addEventListener('change', function () {
      const opt = select.options[select.selectedIndex];
      if (opt && opt.value) input.value = opt.text;
      else input.value = '';
    });

    const form = select.closest('form');
    if (form) {
      form.addEventListener('reset', function () {
        input.value = '';
      });
    }

    const buildOptions = (filter) => {
      dropdown.innerHTML = '';
      const f = (filter || '').toLowerCase();
      let hasVisible = false;
      Array.from(select.options).forEach(function (opt) {
        if (!opt.value) return;
        if (f && !opt.text.toLowerCase().includes(f)) return;
        hasVisible = true;
        const div = document.createElement('div');
        div.className = 'searchable-option';
        div.textContent = opt.text;
        div.dataset.value = opt.value;
        div.addEventListener('click', function () {
          select.value = opt.value;
          input.value = opt.text;
          dropdown.classList.remove('show');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        dropdown.appendChild(div);
      });
      if (!hasVisible) {
        dropdown.innerHTML = '<div class="searchable-option disabled">Sin resultados</div>';
      }
    };

    input.addEventListener('focus', function () {
      buildOptions(input.value);
      dropdown.classList.add('show');
    });

    input.addEventListener('input', Utils.debounce(function () {
      buildOptions(input.value);
      dropdown.classList.add('show');
    }, 200));

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dropdown.classList.remove('show');
      if (e.key === 'Enter') {
        const first = dropdown.querySelector('.searchable-option:not(.disabled)');
        if (first) first.click();
        dropdown.classList.remove('show');
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () { dropdown.classList.remove('show'); }, 200);
    });

    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) input.value = opt.text;

    const modal = select.closest('.modal');
    if (modal) {
      modal.addEventListener('shown.bs.modal', function () {
        const o = select.options[select.selectedIndex];
        if (o && o.value) input.value = o.text;
        else input.value = '';
      });
    }

    buildOptions('');
  },

  updateSearchableOptions(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const wrapper = select.parentElement;
    if (!wrapper.classList.contains('searchable-wrapper')) return;
    const input = wrapper.querySelector('.searchable-input');
    const dropdown = wrapper.querySelector('.searchable-dropdown');
    if (!input || !dropdown) return;
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) input.value = opt.text;
    else input.value = '';
  },

  showDialog(title, bodyHtml) {
    const existing = document.getElementById('dynamicDialog');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal fade show d-block';
    overlay.id = 'dynamicDialog';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow">' +
        '<div class="modal-header border-0"><h5 class="modal-title fw-bold">' + title + '</h5>' +
        '<button type="button" class="btn-close" onclick="document.getElementById(\'dynamicDialog\').remove()"></button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        '<div class="modal-footer border-0"><button type="button" class="btn btn-light btn-sm" onclick="document.getElementById(\'dynamicDialog\').remove()">Cerrar</button></div>' +
      '</div></div>';
    document.body.appendChild(overlay);
  },

  syncSearchableSelects() {
    document.querySelectorAll('.searchable-wrapper').forEach(function (wrapper) {
      const select = wrapper.querySelector('.searchable-original');
      const input = wrapper.querySelector('.searchable-input');
      if (select && input && !select.value) {
        input.value = '';
      }
    });
  },
};
