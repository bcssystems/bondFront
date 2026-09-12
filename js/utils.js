const Utils = {
  getPermisos() {
    const token = localStorage.getItem('authToken');
    if (!token) return [];
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Array.isArray(payload.permisos) ? payload.permisos : [];
    } catch (_) {
      return [];
    }
  },

  getRolActual() {
    const token = localStorage.getItem('authToken');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.rol || '';
    } catch (_) {
      return '';
    }
  },

  hasPermiso(permiso) {
    return this.getPermisos().includes(permiso);
  },

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

      const cacheV = (typeof PAYLOAD_VERSION !== 'undefined') ? '?v=' + PAYLOAD_VERSION : '';
      const fetchUrl = ruta + (cacheV ? (ruta.includes('?') ? '&' : '?') + cacheV.replace('?', '') : '');
      const resp = await fetch(fetchUrl);
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
          const module = await import('./modules/' + modulo + '.js' + (cacheV ? cacheV : ''));
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

  formatUnidad(cantidad, unidadMedida) {
    const u = (unidadMedida || 'UNIDAD').toUpperCase();
    if (u === 'METRO') return cantidad.toFixed(2) + ' m';
    if (u === 'ROLLO') return cantidad + ' rollo' + (cantidad !== 1 ? 's' : '');
    if (u === 'PIEZA') return cantidad + ' pza' + (cantidad !== 1 ? 's' : '');
    if (u === 'KG' || u === 'KILOGRAMO') return cantidad.toFixed(2) + ' kg';
    if (u === 'LITRO') return cantidad.toFixed(2) + ' L';
    return cantidad + ' ' + (u === 'UNIDAD' ? 'pzs' : u.toLowerCase());
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
          wrapper.classList.remove('show');
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
      wrapper.classList.add('show');
    });

    input.addEventListener('input', Utils.debounce(function () {
      buildOptions(input.value);
      dropdown.classList.add('show');
      wrapper.classList.add('show');
    }, 200));

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { dropdown.classList.remove('show'); wrapper.classList.remove('show'); }
      if (e.key === 'Enter') {
        const first = dropdown.querySelector('.searchable-option:not(.disabled)');
        if (first) first.click();
        dropdown.classList.remove('show');
        wrapper.classList.remove('show');
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () { dropdown.classList.remove('show'); wrapper.classList.remove('show'); }, 200);
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

  async cargarOpcionesCategoria(selectId, placeholder) {
    const sel = document.getElementById(selectId);
    if (!sel) return [];
    try {
      const cats = await API.get('/categorias/activas');
      sel.innerHTML = (placeholder ? '<option value="">' + placeholder + '</option>' : '') +
        (cats || []).map(c => '<option value="' + c.idCategoria + '">' + Utils.esc(c.nombre) + '</option>').join('');
      return cats || [];
    } catch (_) {
      return [];
    }
  },

  numeroALetras(value) {
    if (value == null || isNaN(value)) return '';
    const negativo = value < 0;
    const entero = Math.trunc(Math.abs(value));
    let dec = Math.round((Math.abs(value) - entero) * 100);
    if (dec === 100) dec = 0;

    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const especiales = { 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE', 16: 'DIECIS\u00c9IS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE' };
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const decenaNum = (n) => {
      if (n < 10) return unidades[n];
      if (n < 20) return especiales[n] || 'DIEZ Y ' + unidades[n - 10];
      if (n === 20) return 'VEINTE';
      if (n < 30) return 'VEINTI' + unidades[n - 20];
      const d = decenas[Math.floor(n / 10)];
      const u = n % 10;
      return u ? d + ' Y ' + unidades[u] : d;
    };

    const cientos = (n) => {
      if (n === 0) return '';
      if (n === 100) return 'CIEN';
      const parts = [centenas[Math.floor(n / 100)]];
      const r = n % 100;
      if (r) parts.push(decenaNum(r));
      return parts.join(' ');
    };

    const millones = Math.floor(entero / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const rest = entero % 1000;

    const partes = [];
    if (millones === 1) partes.push('UN MILL\u00d3N');
    else if (millones > 1) partes.push(cientos(millones) + ' MILLONES');
    if (miles === 1) partes.push('MIL');
    else if (miles > 1) partes.push(cientos(miles) + ' MIL');
    if (rest) partes.push(cientos(rest));
    const palabras = partes.length ? partes.join(' ') : 'CERO';

    const centStr = String(dec).padStart(2, '0');
    return (negativo ? 'MENOS ' : '') + palabras + ' PESOS ' + centStr + '/100 M.N.';
  },

  downloadXls(filename, sheetName, headers, rows) {
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cell = (v) => {
      const s = esc(v);
      return '<ss:Cell><ss:Data ss:Type="String">' + s + '</ss:Data></ss:Cell>';
    };
    const headerCells = headers.map(h => '<ss:Cell><ss:Data ss:Type="String"><b>' + esc(h) + '</b></ss:Data></ss:Cell>').join('');
    const bodyRows = rows.map(r =>
      '<ss:Row>' + r.map(cell).join('') + '</ss:Row>'
    ).join('\n');

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
      '<Worksheet ss:Name="' + esc(sheetName) + '">\n' +
      '<Table>\n' +
      '<ss:Row>' + headerCells + '</ss:Row>\n' +
      bodyRows + '\n' +
      '</Table>\n</Worksheet>\n</Workbook>';

    const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  openPrintWindow(title, bodyHtml) {
    const win = window.open('', '_blank', 'width=760,height=700');
    if (!win) {
      this.showToast('Bloqueador de popups activo. Permite las ventanas emergentes.', 'warning');
      return;
    }
    const html = '<html><head><meta charset="utf-8"><title>' + this.esc(title) + '</title>' +
      '<style>' +
      'body { font-family: Arial, sans-serif; font-size: 12px; color: #222; margin: 20px; }' +
      'h2 { text-align: center; margin-bottom: 4px; }' +
      'h4 { text-align: center; margin-bottom: 16px; font-weight: normal; color: #555; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 8px; }' +
      'th, td { border: 1px solid #888; padding: 4px 6px; font-size: 11px; }' +
      'th { background: #eee; }' +
      'tr.total td { font-weight: bold; }' +
      '.right { text-align: right; }' +
      '.center { text-align: center; }' +
      '@media print { body { margin: 0; } }' +
      '</style></head><body>' + bodyHtml + '</body></html>';
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
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

  abrirMenuKebab(anchor, items) {
    this.cerrarMenuKebab();
    if (!anchor || !anchor.getBoundingClientRect || !items || items.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'kebab-menu-float';
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    items.forEach(function (it) {
      const el = document.createElement('div');
      el.className = 'kebab-menu-item' + (it.danger ? ' kebab-danger' : '');
      const colorStyle = it.color ? ' style="color:' + it.color + '"' : '';
      el.innerHTML = '<i class="fas ' + it.icon + '"' + colorStyle + '></i><span>' + it.text + '</span>';
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        Utils.cerrarMenuKebab();
        if (typeof it.onClick === 'function') it.onClick();
      });
      menu.appendChild(el);
    });

    const MENU_W = 210;
    const menuH = menu.offsetHeight || (items.length * 34 + 10);
    const r = anchor.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = r.right - MENU_W;
    if (left < 8) left = Math.max(8, r.left);
    if (left + MENU_W > viewW - 8) left = viewW - MENU_W - 8;

    let top = r.bottom + 4;
    if (top + menuH > viewH - 8) top = r.top - menuH - 4;
    if (top < 8) top = 8;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';
    menu.classList.add('show');

    const close = function () {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize, true);
    };
    const onDoc = function (e) {
      if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close();
    };
    const onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    const onScroll = function () { close(); };
    const onResize = function () { close(); };

    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize, true);
  },

  cerrarMenuKebab() {
    const menu = document.querySelector('.kebab-menu-float');
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
  },

  initModalStacking() {
    if (this._modalStackingInit) return;
    this._modalStackingInit = true;

    const BASE_Z = 1055;
    const STEP = 30;
    const stack = [];

    const restyle = (fromIdx) => {
      stack.forEach((modalEl, idx) => {
        if (idx < fromIdx) return;
        const z = BASE_Z + idx * STEP;
        modalEl.style.zIndex = z;
        const backdrop = modalEl.dataset.__bsBackdrop;
        if (backdrop) backdrop.style.zIndex = z - 1;
      });
    };

    document.addEventListener('shown.bs.modal', (e) => {
      if (!stack.includes(e.target)) {
        stack.push(e.target);
        e.target.dataset.__bsBackdrop = '';
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length) e.target.dataset.__bsBackdrop = backdrops[backdrops.length - 1];
      }
      restyle(0);
    });

    document.addEventListener('hidden.bs.modal', (e) => {
      const idx = stack.indexOf(e.target);
      if (idx >= 0) {
        stack.splice(idx, 1);
        const backdrop = e.target.dataset.__bsBackdrop;
        if (backdrop) { try { backdrop.style.zIndex = ''; } catch (_) {} }
        e.target.dataset.__bsBackdrop = '';
      }
      restyle(0);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => { Utils.initModalStacking(); });
