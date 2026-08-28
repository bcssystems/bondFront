let _sidebarDelegationReady = false;

function initSidebarDelegation() {
  if (_sidebarDelegationReady) return;
  _sidebarDelegationReady = true;

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.sidebar-sub-toggle');
    if (toggle) {
      e.preventDefault();
      const targetId = toggle.dataset.target;
      const submenu = document.getElementById(targetId);
      if (submenu) {
        submenu.classList.toggle('open');
        toggle.classList.toggle('open');
      }
      return;
    }

    const link = e.target.closest('[data-view]');
    if (link) {
      e.preventDefault();

      const ruta = link.getAttribute('data-view');
      const modulo = link.getAttribute('data-module');

      Utils.cargarVista(ruta, modulo);

      document.querySelectorAll('.sidebar-item').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (window.innerWidth < 992 && sidebar) {
        sidebar.classList.remove('sidebar-open');
        if (overlay) overlay.classList.remove('active');
      }
    }
  });
}

const Dashboard = {
  init() {
    const username = localStorage.getItem('userNombre') || localStorage.getItem('username') || 'Usuario';
    const displayName = document.getElementById('display-name');
    if (displayName) displayName.textContent = username;

    const avatar = document.getElementById('topbar-avatar');
    if (avatar) avatar.textContent = (localStorage.getItem('username') || 'U').charAt(0).toUpperCase();

    this.gateMenuByRole();
    this.bindEvents();
    this.checkListaNegra();
  },

  gateMenuByRole() {
    const rol = localStorage.getItem('userRol');
    if (!rol) return;
    const isAdmin = rol === 'ADMINISTRADOR' || rol === 'SISTEMAS';
    document.querySelectorAll('[data-module="cancelaciones"]').forEach(el => {
      const li = el.closest('li');
      if (li) li.style.display = isAdmin ? '' : 'none';
    });
  },

  async checkListaNegra() {
    try {
      const lista = await API.get('/clientes/lista-negra');
      if (lista && lista.length > 0) {
        Utils.showToast(lista.length + ' cliente(s) en lista negra', 'warning');
        const welcome = document.querySelector('.welcome-container .welcome-card');
        if (welcome) {
          const alert = document.createElement('div');
          alert.className = 'alert alert-warning d-flex align-items-center justify-content-between mb-3';
          alert.style.maxWidth = '420px';
          alert.style.margin = '0 auto 16px auto';
          alert.innerHTML =
            '<div><i class="fas fa-ban me-2"></i><strong>' + lista.length + '</strong> cliente(s) en lista negra</div>' +
            '<a href="#" class="btn btn-sm btn-outline-danger" onclick="event.preventDefault();document.querySelector(\'[data-view=&quot;pages/clientes.html&quot;][data-module=&quot;clientes&quot;]\').click();">Ver</a>';
          welcome.prepend(alert);
        }
      }
    } catch (_) {}
  },

  bindEvents() {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => Auth.logout());
    }

    const reloadBtn = document.getElementById('btn-reload');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => Utils.recargarModulo());
    }

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('sidebar-open');
        if (overlay) overlay.classList.toggle('active');
      });

      if (overlay) {
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('sidebar-open');
          overlay.classList.remove('active');
        });
      }

      document.addEventListener('click', (e) => {
        if (window.innerWidth < 992 &&
            sidebar.classList.contains('sidebar-open') &&
            !sidebar.contains(e.target) &&
            !sidebarToggle.contains(e.target)) {
          sidebar.classList.remove('sidebar-open');
          if (overlay) overlay.classList.remove('active');
        }
      });
    }
  },
};
