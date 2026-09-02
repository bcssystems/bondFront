let state = {
  caja: null,
  cajas: [],
  sucursales: [],
  clientes: [],
  productos: [],
  cart: [],
  editingVentaEspera: null,
  productSearchTimeout: null,
  reanudandoVentaId: null,
  esperaVentas: [],
  cancelarVentas: [],
  cancelarSelectedId: null,
  lastCortePreview: null,
  reservas: [],
  gastosPendientes: 0,
  idCotizacionActiva: null,
  preciosClienteMap: {},
  configs: {},
};

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
  cargarConfiguraciones();
  const lastCajaId = localStorage.getItem('lastCajaId');
  if (lastCajaId) {
    autoEntrarCaja(lastCajaId);
  } else {
    entrarCajaNormal();
  }
}

async function autoEntrarCaja(id) {
  try {
    const caja = await API.get('/cajas/' + id);
    if (caja.estado === 'ABIERTA') {
      state.caja = caja;
      iniciarPOS();
      actualizarCajaInfo();
      return;
    }
  } catch (_) {}
  entrarCajaNormal();
}

async function entrarCajaNormal() {
  try {
    const cajas = await API.get('/cajas');
    const caja = (cajas || []).find(c => (c.tipo || 'NORMAL') === 'NORMAL');
    if (!caja) {
      Utils.showToast('No hay caja normal configurada', 'error');
      return;
    }
    if (caja.estado === 'ABIERTA') {
      state.caja = caja;
      localStorage.setItem('lastCajaId', caja.idCaja);
      iniciarPOS();
      actualizarCajaInfo();
      return;
    }
    const saldo = await Utils.promptInput('Abrir Caja', '\u00bfCon cu\u00e1nto efectivo comienzas?', '0');
    if (saldo === null) return;
    await API.post('/cajas/' + caja.idCaja + '/apertura', { saldoInicial: parseFloat(saldo) || 0 });
    state.caja = await API.get('/cajas/' + caja.idCaja);
    localStorage.setItem('lastCajaId', caja.idCaja);
    Utils.showToast('Caja abierta exitosamente', 'success');
    iniciarPOS();
    actualizarCajaInfo();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function bindEvents() {
  document.getElementById('btnCobrarPOS')?.addEventListener('click', cobrarVenta);
  document.getElementById('btnConfirmarCobroPOS')?.addEventListener('click', confirmarCobro);
  document.getElementById('btnConfirmarCreditoPOS')?.addEventListener('click', confirmarCreditoPOS);
  document.getElementById('posCreditoInteres')?.addEventListener('input', actualizarMontoOriginalCredito);
  document.getElementById('posCreditoPlazo')?.addEventListener('change', actualizarMontoOriginalCredito);
  document.getElementById('btnEsperaPOS')?.addEventListener('click', ponerEnEspera);
  document.getElementById('btnNuevoClientePOS')?.addEventListener('click', () => abrirClienteModal());
  document.getElementById('btnGuardarPosCliente')?.addEventListener('click', guardarClienteDesdePOS);
  document.getElementById('posClienteCp')?.addEventListener('input', Utils.debounce(function() {
    const cp = this.value.trim();
    if (cp.length === 5) cargarColoniasPOS(cp, '');
  }, 500));
  document.getElementById('posClienteTieneCredito')?.addEventListener('change', function() {
    const group = document.getElementById('posClienteLimiteCreditoGroup');
    if (group) group.style.display = this.checked ? 'block' : 'none';
  });
  document.getElementById('btnIngresarEfectivo')?.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('posIngresoModal')).show();
  });
  document.getElementById('btnGuardarIngreso')?.addEventListener('click', ingresarEfectivo);
  document.getElementById('btnCortePOS')?.addEventListener('click', previewCorte);
  document.getElementById('btnRealizarCortePOS')?.addEventListener('click', realizarCorte);
  document.getElementById('btnGastoPOS')?.addEventListener('click', () => {
    const el = document.getElementById('posGastoCajaInfo');
    if (el && state.caja) {
      el.textContent = 'Caja: ' + (state.caja.nombre || '—') + ' | Sucursal: ' + (state.caja.sucursalNombre || '—');
    }
    new bootstrap.Modal(document.getElementById('posGastoModal')).show();
  });
  document.getElementById('btnSolicitarGastoPOS')?.addEventListener('click', solicitarGasto);
  document.getElementById('btnCancelarVentaPOS')?.addEventListener('click', abrirCancelarVentaModal);
  document.getElementById('btnConfirmarCancelarPOS')?.addEventListener('click', confirmarCancelarVenta);
  document.getElementById('btnVentaRapidaPOS')?.addEventListener('click', () => {
    // VR no longer needs its own cliente select
    new bootstrap.Modal(document.getElementById('posVentaRapidaModal')).show();
  });
  document.getElementById('btnRealizarVentaRapidaPOS')?.addEventListener('click', realizarVentaRapida);
  document.getElementById('btnAbandonarCaja')?.addEventListener('click', abandonarCaja);
  document.getElementById('btnPromocionesPOS')?.addEventListener('click', abrirPromocionesModal);

  document.getElementById('btnVerInventario')?.addEventListener('click', () => {
    const input = document.getElementById('posProductSearch');
    if (input) {
      input.value = '';
      input.focus();
    }
    buscarProductos(true);
  });

  const searchInput = document.getElementById('posProductSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(state.productSearchTimeout);
      state.productSearchTimeout = setTimeout(buscarProductos, 300);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') buscarProductos();
    });
    document.addEventListener('click', (e) => {
      const results = document.getElementById('posProductResults');
      if (results && !e.target.closest('.pos-panel-product-search')) {
        results.classList.add('d-none');
      }
    });
  }

  document.getElementById('posCliente')?.addEventListener('change', onPosClienteChange);
}

async function mostrarSelectorCaja() {
  entrarCajaNormal();
}

async function cargarProductosParaVenta() {
  if (!state.caja?.idSucursal) return;
  try {
    const data = await API.get('/productos/para-venta?page=0&size=500&sort=sku,ASC&idSucursal=' + state.caja.idSucursal);
    state.productos = data.content || [];
  } catch (_) { state.productos = []; }
}

async function cargarCotizacionDesdeLocalStorage() {
  try {
    const raw = localStorage.getItem('cotizacionParaVenta');
    if (!raw) return;
    const quote = JSON.parse(raw);
    localStorage.removeItem('cotizacionParaVenta');
    state.idCotizacionActiva = quote.idCotizacion || null;

    if (quote.idCliente) {
      const sel = document.getElementById('posCliente');
      if (sel) sel.value = quote.idCliente;
    }

    if (quote.detalles && quote.detalles.length > 0) {
      for (const d of quote.detalles) {
        const existente = state.cart.find(x => x.idProducto === d.idProducto);
        if (existente) {
          try {
            await API.put('/carrito/actualizar', {
              idCaja: state.caja.idCaja,
              idProducto: d.idProducto,
              cantidad: existente.cantidad + d.cantidad,
            });
            existente.cantidad += d.cantidad;
          } catch (_) {}
        } else {
          try {
            await API.post('/carrito/agregar', {
              idCaja: state.caja.idCaja,
              idProducto: d.idProducto,
              cantidad: d.cantidad,
            });
          } catch (_) {}
          const producto = state.productos.find(p => p.idProducto === d.idProducto);
          state.cart.push({
            idProducto: d.idProducto,
            nombre: producto ? producto.nombre : d.productoNombre || 'Producto',
            sku: producto ? producto.sku : d.productoSku || '',
            cantidad: d.cantidad,
            precioUnitario: d.precioUnitario,
            stockActual: producto ? getStockSucursal(producto) : 0,
          });
        }
      }
    }

    if (quote.cobraEnvio && quote.montoEnvio > 0) {
      const envioExistente = state.cart.find(x => x.sku === 'ENVIO');
      if (envioExistente) {
        envioExistente.precioUnitario = quote.montoEnvio;
      } else {
        state.cart.push({
          idProducto: null,
          nombre: 'Env\u00edo' + (quote.paqueteria ? ' - ' + quote.paqueteria : ''),
          sku: 'ENVIO',
          cantidad: 1,
          precioUnitario: quote.montoEnvio,
          stockActual: 0,
          descripcion: 'Env\u00edo' + (quote.paqueteria ? ' - ' + quote.paqueteria : ''),
        });
      }
    }

    renderCart();
    if (quote.detalles && quote.detalles.length > 0) {
      Utils.showToast('Cotizaci\u00f3n #' + (quote.idCotizacion || '') + ' cargada en el carrito', 'success');
    }
  } catch (_) {}
}

async function iniciarPOS() {
  document.getElementById('pos-interface').classList.remove('d-none');
  state.reanudandoVentaId = null;
  window.__cajaAbierta = true;
  actualizarSaldoCaja();
  cargarClientesSelect('posCliente');
  cargarClientesSelect('posVrCliente');
  cargarPaises('posClientePais');
  cargarRegimenes('posClienteRegimen');
  state.cart = [];
  await cargarProductosParaVenta();
  await cargarReservasSucursal();
  await sincronizarCarritoDesdeServidor();
  await cargarCotizacionDesdeLocalStorage();
  await verificarGastosPendientes();
  cargarEsperas();
  iniciarPollingCaja();
  actualizarCajaInfo();
}

function actualizarCajaInfo() {
  const el = document.getElementById('posCajaInfo');
  if (el && state.caja) {
    el.textContent = 'Caja: ' + (state.caja.nombre || '—') + ' | Sucursal: ' + (state.caja.sucursalNombre || '—');
  }
}

async function verificarGastosPendientes() {
  if (!state.caja?.idCaja) return;
  try {
    const count = await API.get('/gastos/pendientes/' + state.caja.idCaja + '/count');
    state.gastosPendientes = count || 0;
    actualizarBotonCorte();
  } catch (_) { state.gastosPendientes = 0; }
}

function actualizarBotonCorte() {
  const btn = document.getElementById('btnCortePOS');
  if (!btn) return;
  if (state.gastosPendientes > 0) {
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.title = 'Hay ' + state.gastosPendientes + ' gasto(s) pendiente(s) por autorizar';
  } else {
    btn.disabled = false;
    btn.classList.remove('disabled');
    btn.title = '';
  }
}

function actualizarSaldoCaja() {}

async function refreshCaja() {
  if (!state.caja) return;
  try {
    state.caja = await API.get('/cajas/' + state.caja.idCaja);
    actualizarSaldoCaja();
  } catch (_) {}
}

function getStockSucursal(producto) {
  if (!state.caja?.idSucursal || !producto?.inventarioSucursales) return producto?.stockActual || 0;
  const inv = producto.inventarioSucursales.find(i => i.idSucursal === state.caja.idSucursal);
  return inv != null ? inv.stock : 0;
}

function isReservadoPorOtraCaja(productoId) {
  return state.reservas.some(r => r.idProducto === productoId && r.idCaja !== state.caja?.idCaja);
}

async function cargarReservasSucursal() {
  if (!state.caja?.idSucursal) return;
  try {
    state.reservas = await API.get('/carrito/reservados/' + state.caja.idSucursal);
  } catch (_) {
    state.reservas = [];
  }
}

async function sincronizarCarritoDesdeServidor() {
  if (!state.caja?.idCaja) return;

  const reservasCaja = state.reservas.filter(r => r.idCaja === state.caja.idCaja);

  const serverItems = reservasCaja.map(r => {
    const prod = state.productos.find(p => p.idProducto === r.idProducto);
    return {
      idProducto: r.idProducto,
      nombre: r.productoNombre || (prod ? prod.nombre : 'Producto'),
      sku: r.productoSku || (prod ? prod.sku : ''),
      cantidad: r.cantidad,
      precioUnitario: prod ? (prod.precioBase || 0) : 0,
    };
  });

  try {
    const rapidos = await API.get('/carrito/rapidos/' + state.caja.idCaja);
    const vrItems = rapidos.map(r => ({
      idProducto: -r.idItemRapido,
      nombre: r.descripcion,
      sku: 'VR',
      cantidad: r.cantidad,
      precioUnitario: r.precioVenta,
      stockActual: 999999,
      _idRapido: r.idItemRapido,
    }));
    state.cart = [...serverItems, ...vrItems];
  } catch (_) {
    state.cart = serverItems;
  }

  renderCart();
}

function iniciarPollingCaja() {
  detenerPollingCaja();
  state._pollInterval = setInterval(async () => {
    if (!state.caja) { detenerPollingCaja(); return; }
    await cargarReservasSucursal();
    if (state.productos.length > 0) {
      const list = document.getElementById('posProductList');
      if (list) buscarProductos();
    }
    const reservasCaja = state.reservas.filter(r => r.idCaja === state.caja.idCaja);
    const cartServerCount = state.cart.filter(d => d.sku !== 'VR' && d.sku !== 'ENVIO').length;
    if (reservasCaja.length !== cartServerCount) {
      const envioItems = state.cart.filter(d => d.sku === 'ENVIO');
      const nuevosCart = reservasCaja.map(r => {
        const existente = state.cart.find(d => d.idProducto === r.idProducto);
        if (existente) return { ...existente, cantidad: r.cantidad };
        const prod = state.productos.find(p => p.idProducto === r.idProducto);
        return {
          idProducto: r.idProducto,
          nombre: r.productoNombre || (prod ? prod.nombre : 'Producto'),
          sku: r.productoSku || (prod ? prod.sku : ''),
          cantidad: r.cantidad,
          precioUnitario: prod ? (prod.precioBase || 0) : 0,
        };
      });
      state.cart = [...envioItems, ...nuevosCart];
    }
    try {
      const rapidos = await API.get('/carrito/rapidos/' + state.caja.idCaja);
      const existingVr = state.cart.filter(d => d.sku === 'VR');
      const serverVrIds = rapidos.map(r => r.idItemRapido);
      const nuevosVr = rapidos.map(r => {
        const existente = existingVr.find(v => v._idRapido === r.idItemRapido);
        return {
          idProducto: -r.idItemRapido,
          nombre: r.descripcion,
          sku: 'VR',
          cantidad: existente ? existente.cantidad : r.cantidad,
          precioUnitario: r.precioVenta,
          stockActual: 999999,
          _idRapido: r.idItemRapido,
        };
      });
      const vrChanged = JSON.stringify(existingVr.map(v => v._idRapido).sort()) !== JSON.stringify(serverVrIds.sort())
        || existingVr.some(v => { const s = rapidos.find(r => r.idItemRapido === v._idRapido); return s && s.cantidad !== v.cantidad; });
      if (vrChanged || (state.cart.some(d => d.sku === 'VR') !== rapidos.length > 0)) {
        state.cart = [...state.cart.filter(d => d.sku !== 'VR'), ...nuevosVr];
      }
    } catch (_) {}
    renderCart();
  }, 5000);
}

function detenerPollingCaja() {
  if (state._pollInterval) {
    clearInterval(state._pollInterval);
    state._pollInterval = null;
  }
}

async function cargarConfiguraciones() {
  try {
    const list = await API.get('/configuraciones');
    state.configs = {};
    (list || []).forEach(c => { if (c.clave) state.configs[c.clave] = c.valor; });
  } catch (_) {}
}

async function onPosClienteChange() {
  const id = parseInt(document.getElementById('posCliente').value) || null;
  state.preciosClienteMap = {};
  if (id) {
    const cli = state.clientes.find(c => c.idCliente === id);
    if (cli && cli.enListaNegra) {
      Utils.showToast('Este cliente est\u00e1 en lista negra', 'warning');
    }
    try {
      const precios = await API.get('/clientes/' + id + '/precios');
      (precios || []).forEach(p => { state.preciosClienteMap[p.idProducto] = p.precio; });
    } catch (_) {}
  }
  actualizarPreciosCart();
}

async function cargarClientesSelect(selectId) {
  try {
    const result = await API.get('/clientes?page=0&size=500');
    state.clientes = result.content || [];
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const label = selectId === 'posVrCliente' ? 'Mostrador' : 'Cliente mostrador...';
    sel.innerHTML = `<option value="">${label}</option>` +
      state.clientes.map(c =>
        `<option value="${c.idCliente}">${Utils.esc(c.nombre + ' ' + (c.apellidoPaterno || ''))}</option>`
      ).join('');
    if (selectId === 'posCliente') {
      Utils.makeSearchableSelect('posCliente');
    }
  } catch (_) {}
}

async function cargarPaises(selectId) {
  try {
    const paises = await API.get('/catalogos/paises');
    const sel = document.getElementById(selectId);
    if (sel) {
      sel.innerHTML = paises.map(p =>
        `<option value="${p.codigo}" ${p.codigo === 'MX' ? 'selected' : ''}>${p.nombre} (${p.prefijo})</option>`
      ).join('');
    }
  } catch (_) {}
}

function cargarRegimenes(selectId) {
  const sel = document.getElementById(selectId);
  if (sel) {
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      REGIMENES_FISCALES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
  }
}

function actualizarPreciosCart() {
  state.cart.forEach(d => {
    const p = state.productos.find(x => x.idProducto === d.idProducto);
    const precioEspecial = state.preciosClienteMap[d.idProducto];
    if (precioEspecial && precioEspecial > 0) {
      d.precioUnitario = precioEspecial;
    } else if (p && p.precioBase > 0) {
      d.precioUnitario = p.precioBase;
    }
  });
  renderCart();
}

async function buscarProductos(showAll) {
  const q = document.getElementById('posProductSearch')?.value?.trim() || '';
  const results = document.getElementById('posProductResults');
  const list = document.getElementById('posProductList');
  if (!results || !list) return;

  if (q.length < 1 && !showAll) {
    results.classList.add('d-none');
    return;
  }

  try {
    const hasQuery = q.length > 0;
    const sucursalParam = state.caja?.idSucursal ? '&idSucursal=' + state.caja.idSucursal : '';
    const url = hasQuery
      ? '/productos/para-venta?search=' + encodeURIComponent(q) + '&page=0&size=20' + sucursalParam
      : '/productos/para-venta?page=0&size=50&sort=sku,ASC' + sucursalParam;
    const data = await API.get(url);
    state.productos = data.content || [];
    if (state.productos.length === 0) {
      list.innerHTML = '<div class="pos-product-result-item text-muted">Sin resultados</div>';
    } else {
      const sorted = [...state.productos].sort((a, b) => {
        const stA = getStockSucursal(a) > 0 ? 0 : 1;
        const stB = getStockSucursal(b) > 0 ? 0 : 1;
        return stA - stB;
      });

      list.innerHTML = sorted.map(p => {
        const stock = getStockSucursal(p);
        const sinStock = stock <= 0;
        const reservado = isReservadoPorOtraCaja(p.idProducto);
        const disabled = reservado || sinStock;
        const precioEspecial = state.preciosClienteMap[p.idProducto];
        const precioMostrar = (precioEspecial && precioEspecial > 0) ? precioEspecial : (p.precioBase || 0);
        return `<div class="pos-product-result-item ${disabled ? 'text-muted opacity-50' : ''}" data-id="${p.idProducto}" data-sin-stock="${sinStock}">
          <div>
            <div class="fw-semibold small">${Utils.esc(p.nombre)}</div>
            <small class="text-muted">SKU: ${Utils.esc(p.sku || '-')} | Stock: ${stock}</small>
            ${sinStock ? '<br><small class="badge bg-secondary mt-1"><i class="fas fa-times-circle me-1"></i>Sin stock</small>' : ''}
            ${reservado ? '<br><small class="badge bg-warning text-dark mt-1"><i class="fas fa-lock me-1"></i>En uso en otra caja</small>' : ''}
          </div>
          <div class="text-end">
            <div class="fw-bold" style="color:var(--primary)">$${precioMostrar.toFixed(2)}${precioEspecial && precioEspecial > 0 ? ' <span class="badge bg-success" style="font-size:0.55rem">P.E.</span>' : ''}</div>
            <button class="btn btn-sm ${disabled ? 'btn-secondary' : 'btn-success'} pos-add-cart" data-id="${p.idProducto}" style="font-size:0.7rem" ${disabled ? 'disabled' : ''}>
              <i class="fas fa-cart-plus"></i>
            </button>
          </div>
        </div>`;
      }).join('');

      list.querySelectorAll('.pos-add-cart').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const prodId = parseInt(btn.dataset.id);
          agregarAlCart(prodId);
        });
      });

      list.querySelectorAll('.pos-product-result-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.pos-add-cart')) return;
          if (item.dataset.sinStock === 'true') {
            Utils.showToast('Producto sin stock en esta sucursal', 'warning');
            return;
          }
          const prodId = parseInt(item.dataset.id);
          agregarAlCart(prodId);
        });
      });
    }
    results.classList.remove('d-none');
  } catch (_) {
    list.innerHTML = '<div class="pos-product-result-item text-muted">Error al buscar</div>';
    results.classList.remove('d-none');
  }
}

async function agregarAlCart(prodId) {
  const p = state.productos.find(x => x.idProducto === prodId);
  if (!p) return;

  const precioEspecial = state.preciosClienteMap[prodId];
  const precio = (precioEspecial && precioEspecial > 0) ? precioEspecial : (p.precioBase || 0);

  const stockSuc = getStockSucursal(p);
  if (stockSuc <= 0) {
    Utils.showToast('Producto sin stock en esta sucursal', 'warning');
    return;
  }

  const existente = state.cart.find(d => d.idProducto === prodId);
  if (existente) {
    if (existente.cantidad >= stockSuc) {
      Utils.showToast('Stock insuficiente en esta sucursal', 'warning');
      return;
    }
    try {
      await API.put('/carrito/actualizar', {
        idCaja: state.caja.idCaja,
        idProducto: prodId,
        cantidad: existente.cantidad + 1,
      });
    } catch (err) {
      Utils.showToast(err.message, 'error');
      return;
    }
    existente.cantidad++;
  } else {
    try {
      await API.post('/carrito/agregar', {
        idCaja: state.caja.idCaja,
        idProducto: prodId,
        cantidad: 1,
      });
    } catch (err) {
      Utils.showToast(err.message, 'error');
      return;
    }
    state.cart.push({
      idProducto: prodId,
      nombre: p.nombre,
      sku: p.sku,
      cantidad: 1,
      precioUnitario: precio,
      stockActual: getStockSucursal(p),
    });
  }

  renderCart();
  document.getElementById('posProductResults')?.classList.add('d-none');
  document.getElementById('posProductSearch').value = '';
}

function renderCart() {
  const tbody = document.getElementById('posCartBody');
  if (!tbody) return;

  if (state.cart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state py-3"><i class="fas fa-cart-plus"></i><p>Agrega productos a la venta</p></div></td></tr>';
  } else {
    tbody.innerHTML = state.cart.map((d, i) => {
      return '<tr>' +
      '<td>' +
        '<div class="fw-semibold small">' + Utils.esc(d.nombre) + '</div>' +
        '<small class="text-muted" style="font-size:0.65rem">' + (d.sku || '') + '</small>' +
      '</td>' +
      '<td>' +
        '<div class="d-flex align-items-center gap-1">' +
          '<button class="pos-cart-qty-btn pos-cart-qty-minus" data-index="' + i + '"><i class="fas fa-minus"></i></button>' +
          '<span class="fw-semibold px-1">' + d.cantidad + '</span>' +
          '<button class="pos-cart-qty-btn pos-cart-qty-plus" data-index="' + i + '"><i class="fas fa-plus"></i></button>' +
        '</div>' +
      '</td>' +
      '<td>$' + d.precioUnitario.toFixed(2) + '</td>' +
      '<td class="fw-semibold">$' + (d.cantidad * d.precioUnitario).toFixed(2) + '</td>' +
      '<td><button class="pos-cart-remove" data-index="' + i + '"><i class="fas fa-times"></i></button></td>' +
    '</tr>';
    }).join('');
    tbody.querySelectorAll('.pos-cart-qty-minus').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index);
        const item = state.cart[i];
        if (item.sku === 'VR') {
          if (item.cantidad > 1) {
            item.cantidad--;
            try { await API.put('/carrito/rapidos/' + item._idRapido, { idCaja: state.caja.idCaja, cantidad: item.cantidad }); } catch (_) {}
          } else {
            try { await API.del('/carrito/rapidos/' + item._idRapido); } catch (_) {}
            state.cart.splice(i, 1);
          }
          renderCart();
          return;
        }
        if (item.sku === 'ENVIO') {
          state.cart.splice(i, 1);
          renderCart();
          return;
        }
        if (item.cantidad > 1) {
          try {
            await API.put('/carrito/actualizar', {
              idCaja: state.caja.idCaja,
              idProducto: item.idProducto,
              cantidad: item.cantidad - 1,
            });
          } catch (err) { Utils.showToast(err.message, 'error'); return; }
          item.cantidad--;
        } else {
          try {
            await API.del('/carrito/quitar/' + item.idProducto + '?idCaja=' + state.caja.idCaja);
          } catch (_) {}
          state.cart.splice(i, 1);
        }
        renderCart();
      });
    });

    tbody.querySelectorAll('.pos-cart-qty-plus').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index);
        const item = state.cart[i];
        const p = state.productos.find(x => x.idProducto === item.idProducto);
        if (item.sku === 'VR') {
          item.cantidad++;
          try { await API.put('/carrito/rapidos/' + item._idRapido, { idCaja: state.caja.idCaja, cantidad: item.cantidad }); } catch (_) {}
          renderCart();
          return;
        }
        if (item.sku === 'ENVIO') {
          state.cart.splice(i, 1);
          renderCart();
          return;
        }
        if (p && item.cantidad >= getStockSucursal(p)) {
          Utils.showToast('Stock insuficiente en esta sucursal', 'warning');
          return;
        }
        try {
          await API.put('/carrito/actualizar', {
            idCaja: state.caja.idCaja,
            idProducto: item.idProducto,
            cantidad: item.cantidad + 1,
          });
        } catch (err) { Utils.showToast(err.message, 'error'); return; }
        item.cantidad++;
        renderCart();
      });
    });

    tbody.querySelectorAll('.pos-cart-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index);
        const item = state.cart[i];
        if (item.sku === 'VR') {
          if (item._idRapido) {
            try { await API.del('/carrito/rapidos/' + item._idRapido); } catch (_) {}
          }
        } else if (item.sku === 'ENVIO') {
          // ENVIO items are local-only, no server API needed
        } else if (state.caja?.idCaja) {
          try {
            await API.del('/carrito/quitar/' + item.idProducto + '?idCaja=' + state.caja.idCaja);
          } catch (_) {}
        }
        state.cart.splice(i, 1);
        renderCart();
      });
    });
  }

  recalcularTotales();
}

function recalcularTotales() {
  let subtotal = 0;
  let descuento = 0;

  state.cart.forEach(d => {
    const p = state.productos.find(x => x.idProducto === d.idProducto);
    if (p) {
      const precioBase = p.precioBase || 0;
      const precioActual = d.precioUnitario;
      d.subtotal = d.cantidad * d.precioUnitario;
      subtotal += d.subtotal;
      descuento += (precioBase - precioActual) * d.cantidad;
    } else {
      // VR items (temp negative IDs) always contribute to subtotal
      d.subtotal = d.cantidad * d.precioUnitario;
      subtotal += d.subtotal;
    }
  });

  descuento = Math.max(0, descuento);
  const total = Math.max(0, subtotal);

  document.getElementById('posSubtotal').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('posDescuento').textContent = '-$' + descuento.toFixed(2);
  document.getElementById('posTotal').textContent = '$' + total.toFixed(2);
}

async function limpiarCart() {
  if (state.caja?.idCaja) {
    try {
      await API.del('/carrito/limpiar?idCaja=' + state.caja.idCaja);
    } catch (_) {}
    try {
      await API.del('/carrito/rapidos/limpiar?idCaja=' + state.caja.idCaja);
    } catch (_) {}
  }
  state.cart = [];
  renderCart();
}

async function cobrarVenta() {
  if (!state.caja) { Utils.showToast('No hay caja activa', 'error'); return; }
  if (state.cart.length === 0) { Utils.showToast('Agrega productos a la venta', 'warning'); return; }

  for (const d of state.cart) {
    if (d.sku === 'ENVIO' || d.sku === 'VR') continue;
    const p = state.productos.find(x => x.idProducto === d.idProducto);
    if (p && getStockSucursal(p) < d.cantidad) {
      Utils.showToast('Stock insuficiente en esta sucursal: ' + d.nombre, 'error');
      return;
    }
  }

  const total = parseFloat(document.getElementById('posTotal').textContent.replace('$', ''));
  const tipoVenta = document.querySelector('input[name="tipoVenta"]:checked')?.value || 'CONTADO';

  if (tipoVenta === 'CREDITO') {
    const clienteId = parseInt(document.getElementById('posCliente').value) || null;
    if (!clienteId) {
      Utils.showToast('Selecciona un cliente para venta a cr\u00e9dito', 'warning');
      return;
    }
    const cliente = state.clientes.find(c => c.idCliente === clienteId);
    if (!cliente || !cliente.tieneCredito) {
      Utils.showToast('El cliente no tiene cr\u00e9dito habilitado', 'warning');
      return;
    }
    const disponible = (cliente.limiteCredito || 0) - (cliente.saldoActual || 0);
    if (total > disponible) {
      Utils.showToast('El total excede el l\u00edmite de cr\u00e9dito disponible ($' + disponible.toFixed(2) + ')', 'warning');
      return;
    }
    document.getElementById('posCreditoTotal').textContent = '$' + total.toFixed(2);
    document.getElementById('posCreditoClienteName').textContent = (cliente.nombre || '') + ' ' + (cliente.apellidoPaterno || '');
    document.getElementById('posCreditoInteres').value = '0';
    actualizarMontoOriginalCredito();
    new bootstrap.Modal(document.getElementById('posCreditoModal')).show();
    return;
  }

  document.getElementById('posCobroTotal').textContent = '$' + total.toFixed(2);
  document.getElementById('posCobroNota').value = '';
  await cargarFormasPagoCobro();
  new bootstrap.Modal(document.getElementById('posCobroModal')).show();
}

async function cargarFormasPagoCobro() {
  const container = document.getElementById('posCobroPagos');
  container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Cargando formas de pago...</div>';

  try {
    const tipos = await API.get('/tipos-pago');
    const total = parseFloat(document.getElementById('posCobroTotal').textContent.replace('$', ''));

    if (!tipos || tipos.length === 0) {
      container.innerHTML = '<div class="text-center py-3 text-muted">No hay formas de pago configuradas</div>';
      return;
    }

    container.innerHTML = tipos.map((t) => {
      const isEfectivo = t.nombre.toUpperCase() === 'EFECTIVO';
      return `<div class="payment-row border rounded p-2 mb-1">
        <div class="row g-2 align-items-center">
          <div class="col-3">
            <span class="fw-semibold small">${Utils.esc(t.nombre)}</span>
          </div>
          <div class="col-3">
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <input type="number" class="form-control payment-monto" data-id="${t.idTipoPago}" step="0.01" min="0" value="0.00">
            </div>
          </div>
          <div class="col-6">
            <input type="text" class="form-control form-control-sm payment-referencia" data-id="${t.idTipoPago}" placeholder="${isEfectivo ? '' : 'Referencia (ej. \u00faltimos 4 d\u00edgitos)'}" ${isEfectivo ? 'disabled' : ''}>
          </div>
        </div>
      </div>`;
    }).join('');

    container.addEventListener('input', recalcularSumaCobro);

    recalcularSumaCobro();
  } catch (err) {
    container.innerHTML = '<div class="text-center py-3 text-danger">Error al cargar formas de pago</div>';
  }
}

function recalcularSumaCobro() {
  let suma = 0;
  document.querySelectorAll('.payment-monto').forEach(inp => {
    suma += parseFloat(inp.value) || 0;
  });
  const total = parseFloat(document.getElementById('posCobroTotal').textContent.replace('$', ''));
  const el = document.getElementById('posCobroSuma');
  const cambioEl = document.getElementById('posCobroCambio');
  const cambioVal = document.getElementById('posCobroCambioValor');
  el.textContent = '$' + suma.toFixed(2);

  if (suma + 0.01 < total) {
    el.style.color = 'var(--danger)';
    cambioEl.classList.add('d-none');
  } else {
    el.style.color = 'var(--success)';
    if (suma > total + 0.01) {
      cambioVal.textContent = '$' + (suma - total).toFixed(2);
      cambioEl.classList.remove('d-none');
    } else {
      cambioEl.classList.add('d-none');
    }
  }
}

async function confirmarCobro() {
  if (!state.caja) { Utils.showToast('No hay caja activa', 'error'); return; }

  const total = parseFloat(document.getElementById('posCobroTotal').textContent.replace('$', ''));
  const subtotal = parseFloat(document.getElementById('posSubtotal').textContent.replace('$', ''));
  const tipoVenta = document.querySelector('input[name="tipoVenta"]:checked')?.value || 'CONTADO';
  const clienteId = parseInt(document.getElementById('posCliente').value) || null;
  const nota = document.getElementById('posCobroNota').value.trim() || null;

  const pagos = [];
  document.querySelectorAll('.payment-monto').forEach(inp => {
    const monto = parseFloat(inp.value) || 0;
    if (monto > 0) {
      const idTipoPago = parseInt(inp.dataset.id);
      const refInput = document.querySelector(`.payment-referencia[data-id="${idTipoPago}"]`);
      const referencia = refInput ? refInput.value.trim() || null : null;
      pagos.push({ idTipoPago, monto, referencia });
    }
  });

  if (pagos.length === 0) {
    Utils.showToast('Selecciona al menos una forma de pago', 'warning');
    return;
  }

  const sumaPagos = pagos.reduce((s, p) => s + p.monto, 0);
  if (sumaPagos + 0.01 < total) {
    Utils.showToast('La suma de los pagos debe ser al menos igual al total', 'warning');
    return;
  }

  const request = {
    idCaja: state.caja.idCaja,
    idCliente: clienteId || null,
    tipoVenta: tipoVenta,
    precioSeleccionado: 1,
    subtotal: subtotal,
    descuento: subtotal - total,
    total: total,
    nota: nota,
    detalles: state.cart.map(d => ({
      idProducto: d.sku === 'ENVIO' ? null : d.idProducto,
      descripcion: d.sku === 'ENVIO' ? (d.descripcion || d.nombre) : null,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.cantidad * d.precioUnitario,
      atributosText: null,
    })),
    pagos: pagos,
  };

  try {
    if (state.reanudandoVentaId) {
      await API.post('/ventas/' + state.reanudandoVentaId + '/cancelar', {});
      state.reanudandoVentaId = null;
    }
    const ventaCreada = await API.post('/ventas', request);
    Utils.showToast('Venta registrada exitosamente', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posCobroModal'))?.hide();
    await limpiarCart();
    await refreshCaja();
    await cargarEsperas();
    imprimirTicketVenta(ventaCreada);
    if (state.idCotizacionActiva) {
      try {
        await API.post('/cotizaciones/' + state.idCotizacionActiva + '/convertir');
      } catch (_) {}
      state.idCotizacionActiva = null;
    }
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function actualizarMontoOriginalCredito() {
  const total = parseFloat(document.getElementById('posCreditoTotal').textContent.replace('$', ''));
  const interes = parseFloat(document.getElementById('posCreditoInteres').value) || 0;
  const plazo = parseInt(document.getElementById('posCreditoPlazo').value) || 1;
  const montoOriginal = total + (total * interes / 100);
  const pagoMensual = montoOriginal / plazo;
  document.getElementById('posCreditoMontoOriginal').textContent = '$' + montoOriginal.toFixed(2);
  document.getElementById('posCreditoPagoMensual').textContent = '$' + pagoMensual.toFixed(2) + ' x ' + plazo + ' meses';
}

async function confirmarCreditoPOS() {
  if (!state.caja) { Utils.showToast('No hay caja activa', 'error'); return; }

  const total = parseFloat(document.getElementById('posCreditoTotal').textContent.replace('$', ''));
  const subtotal = parseFloat(document.getElementById('posSubtotal').textContent.replace('$', ''));
  const clienteId = parseInt(document.getElementById('posCliente').value) || null;
  const nota = document.getElementById('posCobroNota').value.trim() || null;
  const plazoMeses = parseInt(document.getElementById('posCreditoPlazo').value);
  const porcentajeInteres = parseFloat(document.getElementById('posCreditoInteres').value) || 0;

  const request = {
    idCaja: state.caja.idCaja,
    idCliente: clienteId,
    tipoVenta: 'CREDITO',
    precioSeleccionado: 1,
    subtotal: subtotal,
    descuento: subtotal - total,
    total: total,
    nota: nota,
    plazoMeses: plazoMeses,
    porcentajeInteres: porcentajeInteres,
    detalles: state.cart.map(d => ({
      idProducto: d.sku === 'ENVIO' ? null : d.idProducto,
      descripcion: d.sku === 'ENVIO' ? (d.descripcion || d.nombre) : null,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.cantidad * d.precioUnitario,
      atributosText: null,
    })),
    pagos: [],
  };

  try {
    if (state.reanudandoVentaId) {
      await API.post('/ventas/' + state.reanudandoVentaId + '/cancelar', {});
      state.reanudandoVentaId = null;
    }
    const ventaCreada = await API.post('/ventas', request);
    Utils.showToast('Venta a cr\u00e9dito registrada', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posCreditoModal'))?.hide();
    const cInfo = state.clientes.find(c => c.idCliente === clienteId);
    await limpiarCart();
    await refreshCaja();
    await cargarEsperas();
    imprimirTicketVenta(ventaCreada, 2, true, plazoMeses, porcentajeInteres, cInfo);
    if (state.idCotizacionActiva) {
      try {
        await API.post('/cotizaciones/' + state.idCotizacionActiva + '/convertir');
      } catch (_) {}
      state.idCotizacionActiva = null;
    }
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function imprimirTicketVenta(venta, copies, esCredito, plazoMeses, porcentajeInteres, clienteInfo) {
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const horaStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const numCopies = copies || 1;
  const isCredit = esCredito || venta.tipoVenta === 'CREDITO';

  const totalConInteres = isCredit ? (venta.total || 0) + ((venta.total || 0) * (porcentajeInteres || 0) / 100) : (venta.total || 0);

  const detalleRows = (venta.detalles || []).map(d => {
    const dSubtotal = d.subtotal || (d.cantidad * d.precioUnitario) || 0;
    const nombre = Utils.esc(d.productoNombre || d.descripcion || 'Producto');
    const attrs = d.atributosText ? '<br><span class="detalle-attrs">' + Utils.esc(d.atributosText) + '</span>' : '';
    return `
    <tr class="detalle-row">
      <td>${nombre}${attrs}</td>
      <td class="center">${d.cantidad}</td>
      <td class="right">$${(d.precioUnitario || 0).toFixed(2)}</td>
      <td class="right">$${dSubtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const pagoRows = isCredit
    ? '<tr><td>Cr\u00e9dito</td><td class="right">$' + totalConInteres.toFixed(2) + '</td></tr>'
    : (venta.pagos || []).map(p => `
    <tr>
      <td>${Utils.esc((p.tipoPagoNombre || '').split(' ')[0])}${p.referencia ? ' (' + Utils.esc(p.referencia) + ')' : ''}</td>
      <td class="right">$${(p.monto || 0).toFixed(2)}</td>
    </tr>`).join('');

  const titularPagare = state.configs['titularPagare'] || state.configs['descripcionEmpresa'] || '';
  const lugarPagare = state.configs['direccionEmpresa'] || 'San Luis Potos\u00ed, S.L.P.';
  const tasaMora = state.configs['tasaInteresMoraPagare'] || 0;
  const montoLetras = Utils.numeroALetras(totalConInteres);

  const cliPagare = (clienteInfo && clienteInfo.idCliente) ? clienteInfo : null;
  const deudorNombre = cliPagare
    ? [cliPagare.nombre || '', cliPagare.apellidoPaterno || '', cliPagare.apellidoMaterno || ''].filter(Boolean).join(' ')
    : (venta.clienteNombre || '');
  const deudorDireccion = cliPagare
    ? [cliPagare.calle || '', cliPagare.numExt ? '#' + cliPagare.numExt : '', cliPagare.numInt ? 'Int ' + cliPagare.numInt : '', cliPagare.colonia ? 'Col. ' + cliPagare.colonia : ''].filter(Boolean).join(', ') || (cliPagare.direccion || '')
    : '';
  const deudorPoblacion = cliPagare
    ? [cliPagare.municipio || '', cliPagare.estado || ''].filter(Boolean).join(', ') || (cliPagare.cp || '')
    : '';
  const deudorTel = cliPagare ? (cliPagare.telefono || '') : '';

  const diaExpedicion = now.getDate();
  const mesExpedicion = now.toLocaleDateString('es-MX', { month: 'long' });
  const anioExpedicion = now.getFullYear();

  const pagareHtml = isCredit ? `
  <div class="pagare">
    <h2 class="pagare-h2">PAGAR\u00c9</h2>
    <div class="pagare-doc-no">FOLIO DE PAGAR\u00c9: ${Utils.esc(venta.folioPagare || '—')}</div>
    <div class="pagare-lugar-fecha">
      <span>LUGAR DE EXPEDICI\u00d3N: ${Utils.esc(lugarPagare)}</span>
      <span>D\u00cdA: ${diaExpedicion}&nbsp;&nbsp; MES: ${Utils.esc(mesExpedicion)}&nbsp;&nbsp; A\u00d1O: ${anioExpedicion}</span>
    </div>
    <div class="pagare-bueno-por">
      <span class="pagare-bueno-por-label">BUENO POR</span>
      <span class="pagare-bueno-por-monto">$${totalConInteres.toFixed(2)}</span>
    </div>
    <p class="pagare-leyenda">
      Debemos y pagar\u00e9(mos) incondicionalmente en esta ciudad o en cualquier otra que se me requiera, este Pagar\u00e9 a la orden de:
      <strong>${Utils.esc(titularPagare)}</strong>, el d\u00eda ${diaExpedicion} de ${Utils.esc(mesExpedicion)} de ${anioExpedicion}.
      La cantidad de: <strong>$${totalConInteres.toFixed(2)} (${Utils.esc(montoLetras)})</strong>.
    </p>
    <p class="pagare-leyenda">
      CANTIDAD QUE CORRESPONDE AL IMPORTE DE LAS MERCANCIAS QUE SE DETALLAN EN EL PEDIDO CUYO N\u00daMERO COINCIDE CON EL DE ESTE DOCUMENTO QUE HE RECIBIDO DE CONFORMIDAD,
      SIENDO ESTE PAGAR\u00c9 MERCANTIL EN LOS T\u00c9RMINOS DE LOS ART\u00cdCULOS 170 Y 171 DE LA LEY GENERAL DE T\u00cdTULOS Y OPERACIONES DE CR\u00c9DITO; AS\u00cd MISMO,
      DE CONFORMIDAD CON EL ART\u00cdCULO 11 Y DEM\u00c1S RELATIVOS DE LA LEY CITADA, ME OBLIGO INCONDICIONALMENTE A PAGAR EL IMPORTE DE ESTE PAGAR\u00c9 CUANDO
      SEA ACEPTADO EN MI NOMBRE Y REPRESENTACI\u00d3N POR EMPLEADO O DEPENDIENTE DE MI NEGOCIO. EL PRESENTE PAGAR\u00c9 ES SIN PROTESTO; EN CASO DE MORA
      AL PLAZO SE CUBRIR\u00c1N INTERESES A LA TASA DEL <strong>${tasaMora}%</strong> MENSUAL.
    </p>
    <div class="pagare-pie">
      <div class="pagare-caja">
        <div class="pagare-caja-titulo">DATOS DEL(LOS) DEUDOR(ES) / AVAL</div>
        <table class="pagare-caja-tabla">
          <tr><td class="pagare-caja-campo">Nombre:</td><td>${Utils.esc(deudorNombre) || '______________'}</td></tr>
          <tr><td class="pagare-caja-campo">Direcci\u00f3n:</td><td>${Utils.esc(deudorDireccion) || '______________'}</td></tr>
          <tr><td class="pagare-caja-campo">Poblaci\u00f3n:</td><td>${Utils.esc(deudorPoblacion) || '______________'}</td></tr>
          <tr><td class="pagare-caja-campo">Tel.:</td><td>${Utils.esc(deudorTel) || '______________'}</td></tr>
        </table>
      </div>
      <div class="pagare-firma-area">
        <div class="pagare-linea-firma"></div>
        <div class="pagare-firma-rol">FIRMA(S) DEL(LOS) DEUDOR(ES) / AVAL</div>
        <div class="pagare-firma-nombre">${Utils.esc(deudorNombre)}</div>
      </div>
    </div>
  </div>` : '';

  const ticketStyle = `
    @page {
      size: letter;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #222;
      line-height: 1.35;
    }
    .print-copy {
      page-break-after: always;
      min-height: 100vh;
      position: relative;
      box-sizing: border-box;
      padding: 0.25in;
    }
    .print-copy:last-child { page-break-after: avoid; }
    .copy-label {
      text-align: center;
      font-size: 7.5pt;
      color: #999;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .header {
      text-align: center;
      padding-bottom: 8px;
      border-bottom: 3px solid #2563EB;
      margin-bottom: 10px;
    }
    .header h1 {
      font-size: 22pt;
      font-weight: 800;
      letter-spacing: 4px;
      color: #2563EB;
      text-transform: uppercase;
    }
    .header .sub {
      font-size: 8pt;
      color: #888;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header .folio {
      font-size: 13pt;
      color: #2563EB;
      font-weight: 700;
      margin-top: 4px;
      letter-spacing: 1px;
    }
    .info-grid {
      width: 100%;
      margin-bottom: 8px;
      border-collapse: collapse;
    }
    .info-grid td {
      padding: 2px 6px;
      font-size: 9pt;
      vertical-align: top;
    }
    .info-grid .label {
      font-weight: 600;
      color: #555;
      width: 90px;
      text-transform: uppercase;
      font-size: 7.5pt;
      letter-spacing: 0.5px;
    }
    .info-grid td:last-child { text-align: left; }
    .divider { border-top: 1px solid #ccc; margin: 6px 0; }
    table.detalles {
      width: 100%;
      border-collapse: collapse;
    }
    table.detalles thead { background: #2563EB; color: #fff; }
    table.detalles th {
      font-size: 7.5pt;
      text-align: left;
      padding: 5px 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.detalles th.right { text-align: right; }
    table.detalles th.center { text-align: center; }
    table.detalles td {
      padding: 4px 6px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 9pt;
      vertical-align: top;
    }
    table.detalles td.right { text-align: right; }
    table.detalles td.center { text-align: center; }
    table.detalles .detalle-attrs {
      font-size: 7.5pt;
      color: #666;
      font-style: italic;
    }
    .totals {
      width: 100%;
      border-collapse: collapse;
    }
    .totals td {
      padding: 2px 6px;
      font-size: 9.5pt;
    }
    .totals td.right { text-align: right; }
    .totals .total-row td {
      font-size: 13pt;
      font-weight: 700;
      border-top: 2px solid #222;
      padding-top: 6px;
      color: #2563EB;
    }
    .section { margin-top: 8px; }
    .section-title {
      font-weight: 600;
      font-size: 8pt;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .nota {
      margin-top: 6px;
      padding: 6px 8px;
      background: #f0f4f8;
      font-size: 8.5pt;
      border-left: 3px solid #2563EB;
    }
    .footer {
      text-align: center;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 7.5pt;
      color: #999;
      line-height: 1.5;
    }
    .footer strong { color: #666; }
    .bottom-section {
      position: absolute;
      bottom: 0.25in;
      left: 0.25in;
      right: 0.25in;
    }
    .pagare { margin-top: 8px; }
    .pagare-h2 {
      text-align: center;
      font-size: 22pt;
      font-weight: 800;
      letter-spacing: 10px;
      color: #1e3a5f;
      text-transform: uppercase;
      margin: 24px 0 2px;
    }
    .pagare-doc-no {
      text-align: center;
      font-size: 11pt;
      color: #2563EB;
      font-weight: 600;
      padding-bottom: 8px;
      border-bottom: 2px solid #2563EB;
      margin-bottom: 10px;
    }
    .pagare-lugar-fecha {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .pagare-bueno-por {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 8px 12px;
      margin: 12px 0;
      font-size: 11pt;
    }
    .pagare-bueno-por-label { font-weight: 700; letter-spacing: 1px; }
    .pagare-bueno-por-monto {
      font-size: 13pt;
      font-weight: 800;
      color: #1e3a5f;
      border-bottom: 2px solid #334155;
      min-width: 40%;
      text-align: right;
    }
    .pagare-leyenda {
      font-size: 10.5pt;
      text-align: justify;
      line-height: 1.6;
      margin-bottom: 9px;
    }
    .pagare-pie {
      display: flex;
      align-items: stretch;
      gap: 20px;
      margin-top: 26px;
    }
    .pagare-caja {
      width: 62%;
      border: 2px solid #334155;
      border-radius: 4px;
      padding: 8px 10px;
    }
    .pagare-caja-titulo {
      text-align: center;
      font-weight: 700;
      font-size: 8pt;
      letter-spacing: 1px;
      border-bottom: 1px solid #334155;
      padding-bottom: 4px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .pagare-caja-tabla { width: 100%; border-collapse: collapse; }
    .pagare-caja-tabla td {
      font-size: 9pt;
      padding: 3px 4px;
      vertical-align: top;
    }
    .pagare-caja-campo {
      width: 34%;
      font-weight: 700;
      white-space: nowrap;
    }
    .pagare-firma-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      text-align: center;
    }
    .pagare-linea-firma { border-bottom: 1px solid #222; height: 30px; }
    .pagare-firma-rol {
      margin-top: 6px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .pagare-firma-nombre {
      margin-top: 2px;
      font-size: 9pt;
      font-weight: 600;
    }
  `;

  function buildBodyHtml(copyIndex) {
    return `
  ${numCopies > 1 ? '<div class="copy-label">--- COPIA ' + (copyIndex + 1) + ' DE ' + numCopies + ' ---</div>' : ''}
  <div class="header">
    <h1>BONDS</h1>
    <div class="sub">Sistema de Administraci\u00f3n</div>
    <div class="folio">FACTURA #${venta.idVenta}</div>
  </div>
  <table class="info-grid">
    <tr><td class="label">Fecha</td><td class="value">${fechaStr}</td><td class="label">Caja</td><td class="value">${Utils.esc(venta.cajaNombre || state.caja?.nombre || '')}</td></tr>
    <tr><td class="label">Hora</td><td class="value">${horaStr}</td><td class="label">Sucursal</td><td class="value">${Utils.esc(venta.sucursalNombre || state.caja?.sucursalNombre || '')}</td></tr>
    <tr><td class="label">Cliente</td><td class="value">${Utils.esc(venta.clienteNombre || 'Mostrador')}</td><td class="label">Atendi\u00f3</td><td class="value">${Utils.esc(venta.usuario || '')}</td></tr>
    <tr><td class="label">Tipo</td><td class="value">${venta.tipoVenta || 'CONTADO'}</td><td class="label">Folio</td><td class="value">#${venta.idVenta}</td></tr>
  </table>
  <div class="divider"></div>
  <table class="detalles">
    <thead>
      <tr>
        <th style="width:42%">Descripci\u00f3n</th>
        <th class="center" style="width:10%">Cant</th>
        <th class="right" style="width:20%">Precio</th>
        <th class="right" style="width:28%">Importe</th>
      </tr>
    </thead>
    <tbody>
      ${detalleRows}
    </tbody>
  </table>
  <div class="bottom-section">
    <div class="divider"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td class="right">$${(venta.subtotal || 0).toFixed(2)}</td></tr>
      <tr><td>Descuento</td><td class="right">-$${(venta.descuento || 0).toFixed(2)}</td></tr>
      <tr class="total-row"><td>TOTAL</td><td class="right">$${(isCredit ? totalConInteres : venta.total || 0).toFixed(2)}</td></tr>
    </table>
    <div class="divider"></div>
    <div class="section">
      <div class="section-title">Desglose de Pagos</div>
      <table class="totals">
        ${pagoRows}
      </table>
    </div>
    ${venta.nota ? `<div class="nota"><strong>Nota:</strong> ${Utils.esc(venta.nota)}</div>` : ''}
    <div class="footer">
      <strong>BONDS</strong> &mdash; Sistema de Administraci\u00f3n<br>
      Este documento es un comprobante interno de venta<br>
      ${fechaStr} ${horaStr}
    </div>
  </div>`;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  let fullHtml = '<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <title>Factura - Venta #' + venta.idVenta + '</title>\n  <style>' + ticketStyle + '</style>\n</head>\n<body>';
  for (let i = 0; i < numCopies; i++) {
    fullHtml += '<div class="print-copy">' + buildBodyHtml(i) + '</div>';
    if (isCredit) {
      const pagareLabel = numCopies > 1
        ? '<div class="copy-label">--- COPIA ' + (i + 1) + ' DE ' + numCopies + ' (PAGAR\u00c9) ---</div>'
        : '';
      fullHtml += '<div class="print-copy">' + pagareLabel + pagareHtml + '</div>';
    }
  }
  fullHtml += '\n</body>\n</html>';
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
}

function imprimirTicketCorte(corte) {
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const horaStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Corte de Caja #${corte.idCorte || ''}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 20px; }
    .header { text-align: center; margin-bottom: 16px; }
    .header h1 { font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #2563EB; margin-bottom: 2px; }
    .header .sub { font-size: 10px; color: #666; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .info-table { width: 100%; font-size: 11px; margin-bottom: 8px; }
    .info-table td { padding: 2px 4px; }
    .info-table td:last-child { text-align: right; }
    .section-title { font-size: 13px; font-weight: bold; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .data-table td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
    .data-table td:last-child { text-align: right; font-weight: 600; }
    .data-table .total-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #000; border-bottom: none; padding-top: 8px; }
    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>BONDS</h1>
    <div class="sub">Corte de Caja</div>
  </div>
  <div class="divider"></div>
  <table class="info-table">
    <tr><td><strong>Corte #</strong></td><td>${corte.idCorte || '-'}</td></tr>
    <tr><td><strong>Fecha de Corte</strong></td><td>${fechaStr}</td></tr>
    <tr><td><strong>Hora</strong></td><td>${horaStr}</td></tr>
    <tr><td><strong>Caja</strong></td><td>${Utils.esc(corte.cajaNombre || '')}</td></tr>
    <tr><td><strong>Sucursal</strong></td><td>${Utils.esc(corte.sucursalNombre || '')}</td></tr>
    <tr><td><strong>Usuario</strong></td><td>${Utils.esc(corte.usuario || '')}</td></tr>
    <tr><td><strong>Apertura</strong></td><td>${corte.fechaApertura ? new Date(corte.fechaApertura).toLocaleString('es-MX') : '-'}</td></tr>
    <tr><td><strong>Cierre</strong></td><td>${corte.fechaCierre ? new Date(corte.fechaCierre).toLocaleString('es-MX') : now.toLocaleString('es-MX')}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="section-title">Resumen del Corte</div>
  <table class="data-table">
    <tr><td>Saldo Inicial</td><td>$${(corte.saldoInicial || 0).toFixed(2)}</td></tr>
    <tr><td>Total Ventas</td><td>$${(corte.totalVentas || 0).toFixed(2)}</td></tr>
    <tr><td style="padding-left:20px">Ventas Contado</td><td>$${(corte.totalVentasContado || 0).toFixed(2)}</td></tr>
    <tr><td style="padding-left:20px">Ventas Cr\u00e9dito</td><td>$${(corte.totalVentasCredito || 0).toFixed(2)}</td></tr>
    <tr><td>Total Ingresos</td><td style="color:#059669">+$${(corte.totalIngresos || 0).toFixed(2)}</td></tr>
    <tr><td>Total Egresos</td><td style="color:#dc2626">-$${(corte.totalEgresos || 0).toFixed(2)}</td></tr>
    <tr class="total-row"><td>Saldo Final</td><td>$${(corte.saldoFinalContado || 0).toFixed(2)}</td></tr>
  </table>
  ${corte.detallePagos && corte.detallePagos.length > 0 ? `
  <div class="divider"></div>
  <div class="section-title">Desglose por Forma de Pago</div>
  <table class="data-table" style="font-size:11px">
    <tr style="font-weight:bold;border-bottom:1px solid #000">
      <td style="width:40%">M\u00e9todo</td>
      <td style="width:20%;text-align:center">Sistema</td>
      <td style="width:20%;text-align:center">Real</td>
      <td style="width:20%;text-align:center">Diferencia</td>
    </tr>
    ${corte.detallePagos.map(d => {
      const diff = (d.montoReal != null) ? (d.montoReal - (d.monto || 0)) : null;
      const diffStr = diff != null ? ((diff >= 0 ? '+' : '') + '$' + diff.toFixed(2)) : 'Sin conteo';
      return `
    <tr>
      <td>${Utils.esc(d.tipoPagoNombre || '')}</td>
      <td style="text-align:center">$${(d.monto || 0).toFixed(2)}</td>
      <td style="text-align:center">${d.montoReal != null ? '$' + d.montoReal.toFixed(2) : '-'}</td>
      <td style="text-align:center">${diffStr}</td>
    </tr>`;
    }).join('')}
    <tr style="font-weight:bold;border-top:2px solid #000;border-bottom:none">
      <td style="padding-top:6px">Total</td>
      <td style="text-align:center;padding-top:6px">$${corte.detallePagos.reduce((s, d) => s + (d.monto || 0), 0).toFixed(2)}</td>
      <td style="text-align:center;padding-top:6px">${corte.totalReal != null ? '$' + corte.totalReal.toFixed(2) : '-'}</td>
      <td style="text-align:center;padding-top:6px">${corte.diferencia != null ? ((corte.diferencia >= 0 ? '+' : '') + '$' + corte.diferencia.toFixed(2)) : '-'}</td>
    </tr>
  </table>` : ''}
  ${corte.saldoEsperado != null ? `
  <div class="divider"></div>
  <table class="data-table">
    <tr><td>Saldo Esperado en Caja</td><td>$${corte.saldoEsperado.toFixed(2)}</td></tr>
  </table>` : ''}
  <div class="footer">
    <p>--- Fin del Corte ---</p>
    <p>${fechaStr} ${horaStr}</p>
  </div>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
}

async function ponerEnEspera() {
  if (state.cart.length === 0 || !state.caja) return;
  const total = parseFloat(document.getElementById('posTotal').textContent.replace('$', ''));
  const subtotal = parseFloat(document.getElementById('posSubtotal').textContent.replace('$', ''));
  const tipoVenta = document.querySelector('input[name="tipoVenta"]:checked')?.value || 'CONTADO';
  const clienteId = parseInt(document.getElementById('posCliente').value) || null;

  const request = {
    idCaja: state.caja.idCaja,
    idCliente: clienteId || null,
    tipoVenta: tipoVenta,
    precioSeleccionado: 1,
    subtotal: subtotal,
    descuento: subtotal - total,
    total: total,
    nota: null,
    detalles: state.cart.map(d => ({
      idProducto: d.idProducto,
      descripcion: null,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.cantidad * d.precioUnitario,
    })),
    pagos: null,
  };

  try {
    const venta = await API.post('/ventas', request);
    await API.post('/ventas/' + venta.idVenta + '/espera', {});
    Utils.showToast('Venta puesta en espera', 'success');
    await limpiarCart();
    await cargarEsperas();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function ingresarEfectivo() {
  const monto = parseFloat(document.getElementById('posIngresoMonto').value);
  const motivo = document.getElementById('posIngresoMotivo').value.trim();
  if (!monto || monto <= 0) { Utils.showToast('Monto inv\u00e1lido', 'warning'); return; }
  if (!motivo) { Utils.showToast('Motivo requerido', 'warning'); return; }

  try {
    await API.post('/cajas/' + state.caja.idCaja + '/ingresos', { monto, motivo });
    Utils.showToast('Ingreso registrado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posIngresoModal'))?.hide();
    document.getElementById('posIngresoMonto').value = '';
    document.getElementById('posIngresoMotivo').value = '';
    await refreshCaja();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function solicitarGasto() {
  const desc = document.getElementById('posGastoDesc').value.trim();
  const monto = parseFloat(document.getElementById('posGastoMonto').value);
  if (!desc) { Utils.showToast('Descripci\u00f3n requerida', 'warning'); return; }
  if (!monto || monto <= 0) { Utils.showToast('Monto inv\u00e1lido', 'warning'); return; }

  try {
    await API.post('/gastos', { idCaja: state.caja.idCaja, descripcion: desc, monto });
    Utils.showToast('Gasto solicitado, espera autorizaci\u00f3n', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posGastoModal'))?.hide();
    document.getElementById('posGastoDesc').value = '';
    document.getElementById('posGastoMonto').value = '';
    await verificarGastosPendientes();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function previewCorte() {
  if (!state.caja) return;
  try {
    const corte = await API.get('/cajas/' + state.caja.idCaja + '/corte-preview');
    state.lastCortePreview = corte;
    const body = document.getElementById('posCorteBody');
    const gastos = corte.gastos || [];
    const gastosHtml = (gastos.length === 0)
      ? '<div class="text-center text-muted small py-2">No hubo gastos en este per\u00edodo</div>'
      : '<div class="table-responsive"><table class="table table-sm table-custom mb-0">' +
        '<thead><tr><th>Descripci\u00f3n</th><th class="text-end">Monto</th><th>Solicit\u00f3</th><th>Estado</th></tr></thead>' +
        '<tbody>' + gastos.map(g => {
          const badge = { 'PENDIENTE': 'badge-warning', 'AUTORIZADO': 'badge-active', 'RECHAZADO': 'badge-inactive' }[g.estado] || 'badge-inactive';
          return '<tr><td>' + Utils.esc(g.descripcion) + '</td>' +
            '<td class="text-end"><strong>$' + g.monto.toFixed(2) + '</strong></td>' +
            '<td>' + Utils.esc(g.usuario || '-') + '</td>' +
            '<td><span class="badge-status ' + badge + '">' + g.estado + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    body.innerHTML = `
      <div class="row g-3">
        <div class="col-4"><div class="panel-card p-3 text-center">
          <small class="text-muted">Saldo Inicial</small>
          <h5 class="mb-0">$${corte.saldoInicial.toFixed(2)}</h5>
        </div></div>
        <div class="col-4"><div class="panel-card p-3 text-center">
          <small class="text-muted">Ventas</small>
          <h5 class="mb-0 text-success">$${corte.totalVentas.toFixed(2)}</h5>
        </div></div>
        <div class="col-4"><div class="panel-card p-3 text-center">
          <small class="text-muted">Saldo Esperado</small>
          <h5 class="mb-0" style="color:var(--primary)">$${corte.saldoEsperado.toFixed(2)}</h5>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Contado</small>
          <div>$${corte.totalVentasContado.toFixed(2)}</div>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Cr\u00e9dito</small>
          <div>$${corte.totalVentasCredito.toFixed(2)}</div>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Ingresos</small>
          <div class="text-success fw-semibold">+$${corte.totalIngresos.toFixed(2)}</div>
        </div></div>
        <div class="col-6"><div class="panel-card p-3 text-center">
          <small class="text-muted">Egresos</small>
          <div class="text-danger fw-semibold">-$${corte.totalEgresos.toFixed(2)}</div>
        </div></div>
        <div class="col-12"><div class="panel-card p-3 text-center">
          <small class="text-muted">Total Gastos</small>
          <div class="text-danger fw-semibold">-$${corte.totalGastos.toFixed(2)}</div>
        </div></div>
      </div>
      <hr>
      <h6 class="fw-semibold"><i class="fas fa-money-bill-wave me-1" style="color:var(--primary)"></i>Gastos del per\u00edodo</h6>
      ${gastosHtml}
      ${corte.detallePagos && corte.detallePagos.length > 0 ? `
      <hr>
      <h6 class="fw-semibold">Desglose por Forma de Pago</h6>
      <p class="text-muted small mb-2">Ingresa el monto real contado para cada forma de pago</p>
      <div class="table-responsive">
        <table class="table table-sm table-custom mb-0">
          <thead>
            <tr>
              <th>Forma de Pago</th>
              <th class="text-end" style="width:180px">Monto Real</th>
            </tr>
          </thead>
          <tbody>
            ${corte.detallePagos.map((d, i) => `
            <tr>
              <td>${Utils.esc(d.tipoPagoNombre || '')}</td>
              <td class="text-end">
                <input type="number" class="form-control form-control-sm corte-real-input text-end" data-id="${d.idTipoPago}" data-sistema="${(d.monto || 0)}" step="0.01" min="0" value="${(d.monto || 0).toFixed(2)}">
              </td>
            </tr>`).join('')}
            <tr class="border-top">
              <td class="fw-bold">Total</td>
              <td class="text-end fw-bold" id="posCorteTotalReal">$${corte.detallePagos.reduce((s, d) => s + (d.monto || 0), 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <script>
        document.querySelectorAll('.corte-real-input').forEach(inp => {
          inp.addEventListener('input', function() {
            let totalReal = 0;
            document.querySelectorAll('.corte-real-input').forEach(i => totalReal += parseFloat(i.value) || 0);
            document.getElementById('posCorteTotalReal').textContent = '$' + totalReal.toFixed(2);
          });
        });
      </script>` : ''}
      <hr>
      <div class="text-center">
        <h5>Saldo Final</h5>
        <h3 class="fw-bold" style="color:var(--primary)">$${corte.saldoFinalContado.toFixed(2)}</h3>
      </div>
    `;
    new bootstrap.Modal(document.getElementById('posCorteModal')).show();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function realizarCorte() {
  if (!state.caja) return;
  if (state.esperaVentas.length > 0) {
    const ok = await Utils.confirm('Ventas en Espera',
      'Hay ' + state.esperaVentas.length + ' venta(s) en espera. \u00bfRealizar corte de todas formas?');
    if (!ok) return;
  }
  try {
    const pendientes = await API.get('/gastos/pendientes/' + state.caja.idCaja + '/count');
    if (pendientes > 0) {
      Utils.showToast('No se puede realizar el corte. Hay ' + pendientes + ' gasto(s) pendiente(s) por autorizar.', 'error');
      return;
    }
  } catch (_) {}
  try {
    const corteCreado = await API.post('/cajas/' + state.caja.idCaja + '/corte', {});
    const inputs = document.querySelectorAll('.corte-real-input');
    if (inputs.length > 0 && corteCreado?.idCorte) {
      const pagos = [];
      inputs.forEach(inp => {
        pagos.push({ idTipoPago: parseInt(inp.dataset.id), montoReal: parseFloat(inp.value) || 0 });
      });
      await API.put('/cortes/' + corteCreado.idCorte + '/detalle-pagos', { pagos });
    }
    Utils.showToast('Corte realizado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posCorteModal'))?.hide();
    const cortePrint = corteCreado || state.lastCortePreview;
    if (cortePrint) imprimirTicketCorte(cortePrint);
    localStorage.removeItem('lastCajaId');
    state.caja = null;
    entrarCajaNormal();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cargarEsperas() {
  if (!state.caja) return;
  try {
    state.esperaVentas = await API.get('/ventas/caja/' + state.caja.idCaja + '/espera');
    renderEsperas();
  } catch (_) {}
}

function renderEsperas() {
  const list = document.getElementById('posEsperaList');
  const count = document.getElementById('posEsperaCount');
  if (!list) return;
  count.textContent = state.esperaVentas.length;
  if (state.esperaVentas.length === 0) {
    list.innerHTML = '<small class="text-muted">Sin ventas en espera</small>';
    return;
  }
  list.innerHTML = state.esperaVentas.map(v =>
    `<div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size:0.8rem">
      <div>
        <div class="fw-semibold">#${v.idVenta} ${v.clienteNombre ? Utils.esc(v.clienteNombre) : 'Mostrador'}</div>
        <small class="text-muted">$${v.total.toFixed(2)}</small>
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-success px-2 pos-espera-tab" data-id="${v.idVenta}" data-accion="cobrar" title="Cobrar" style="font-size:0.65rem"><i class="fas fa-cash-register"></i> Cobrar</button>
        <button class="btn btn-sm btn-primary px-2 pos-espera-tab" data-id="${v.idVenta}" data-accion="factura" title="Imprimir factura" style="font-size:0.65rem"><i class="fas fa-print"></i> Factura</button>
        <button class="btn btn-sm btn-outline-primary px-2 pos-espera-tab" data-id="${v.idVenta}" data-accion="editar" title="Editar" style="font-size:0.65rem"><i class="fas fa-edit"></i> Editar</button>
        <button class="btn btn-sm btn-outline-danger px-2 pos-cancelar-espera" data-id="${v.idVenta}" title="Cancelar venta" style="font-size:0.7rem">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>`
  ).join('');

  list.querySelectorAll('.pos-espera-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const accion = btn.dataset.accion;
      const id = parseInt(btn.dataset.id);
      if (accion === 'cobrar') cobrarEspera(id);
      else if (accion === 'factura') imprimirEspera(id);
      else if (accion === 'editar') reanudarEspera(id);
    });
  });

  list.querySelectorAll('.pos-cancelar-espera').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelarEspera(parseInt(btn.dataset.id));
    });
  });
}

async function reanudarEspera(idVenta) {
  try {
    await API.post('/ventas/' + idVenta + '/cancelar', {});

    const venta = await API.get('/ventas/' + idVenta);
    if (!venta.detalles || venta.detalles.length === 0) {
      Utils.showToast('La venta no tiene productos', 'warning');
      return;
    }

    for (const d of venta.detalles) {
      await API.post('/carrito/agregar', {
        idCaja: state.caja.idCaja,
        idProducto: d.idProducto,
        cantidad: 1,
      });
      if (d.cantidad > 1) {
        await API.put('/carrito/actualizar', {
          idCaja: state.caja.idCaja,
          idProducto: d.idProducto,
          cantidad: d.cantidad,
        });
      }
    }

    state.reanudandoVentaId = null;
    state.cart = venta.detalles.map(d => ({
      idProducto: d.idProducto,
      nombre: d.productoNombre || d.descripcion || 'Producto',
      sku: d.productoSku || '',
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
    }));
    actualizarPreciosCart();

    Utils.showToast('Venta #' + idVenta + ' reanudada. Modifica y cobra.', 'info');
    await cargarEsperas();

    const tipoRadios = document.querySelectorAll('input[name="tipoVenta"]');
    tipoRadios.forEach(r => {
      if (r.value === venta.tipoVenta) r.checked = true;
    });

    if (venta.clienteId) {
      const sel = document.getElementById('posCliente');
      if (sel) {
        const opt = sel.querySelector(`option[value="${venta.clienteId}"]`);
        if (opt) opt.selected = true;
      }
    }

    document.getElementById('posProductSearch')?.focus();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cobrarEspera(idVenta) {
  await reanudarEspera(idVenta);
  document.getElementById('btnCobrarPOS')?.click();
}

async function imprimirEspera(idVenta) {
  try {
    const venta = await API.get('/ventas/' + idVenta);
    imprimirTicketVenta(venta, venta.tipoVenta === 'CREDITO' ? 2 : 1, venta.tipoVenta === 'CREDITO',
      venta.plazoMeses, venta.porcentajeInteres, state.clientes.find(c => c.idCliente === venta.idCliente));
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cancelarEspera(idVenta) {
  const ok = await Utils.confirm('Cancelar Venta en Espera',
    'La venta #' + idVenta + ' est\u00e1 en espera. \u00bfCancelarla definitivamente?');
  if (!ok) return;
  try {
    await API.post('/ventas/' + idVenta + '/cancelar', {});
    Utils.showToast('Venta en espera cancelada', 'success');
    await cargarEsperas();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function abrirCancelarVentaModal() {
  if (!state.caja) return;
  state.cancelarSelectedId = null;
  document.getElementById('btnConfirmarCancelarPOS').classList.add('d-none');
  document.getElementById('posCancelarEmpty').classList.add('d-none');

  try {
    state.cancelarVentas = await API.get('/ventas/sucursal/' + state.caja.idSucursal);
  } catch (_) {
    state.cancelarVentas = [];
  }

  const body = document.getElementById('posCancelarVentaBody');
  if (state.cancelarVentas.length === 0) {
    body.innerHTML = '';
    document.getElementById('posCancelarEmpty').classList.remove('d-none');
  } else {
    body.innerHTML = state.cancelarVentas.map(v =>
      `<tr class="pos-cancelar-row ${v.estado === 'CANCELADA' ? 'text-muted' : ''}" data-id="${v.idVenta}" style="cursor:pointer">
        <td>
          <input type="radio" name="cancelarSel" value="${v.idVenta}" ${v.estado === 'CANCELADA' ? 'disabled' : ''}
            class="form-check-input pos-cancelar-radio">
        </td>
        <td>${v.idVenta}</td>
        <td>${v.clienteNombre ? Utils.esc(v.clienteNombre) : 'Mostrador'}</td>
        <td>$${v.total.toFixed(2)}</td>
        <td>${new Date(v.fecha).toLocaleString()}</td>
      </tr>`
    ).join('');

    body.querySelectorAll('.pos-cancelar-radio').forEach(r => {
      r.addEventListener('change', () => {
        state.cancelarSelectedId = parseInt(r.value);
        document.getElementById('btnConfirmarCancelarPOS').classList.remove('d-none');
      });
    });

    body.querySelectorAll('.pos-cancelar-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        const radio = row.querySelector('.pos-cancelar-radio');
        if (radio && !radio.disabled) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  new bootstrap.Modal(document.getElementById('posCancelarModal')).show();
}

async function confirmarCancelarVenta() {
  if (!state.cancelarSelectedId) { Utils.showToast('Selecciona una venta', 'warning'); return; }
  const modalEl = document.getElementById('posCancelarModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal && modal._isShown) {
    const ocultado = new Promise(resolve => modalEl.addEventListener('hidden.bs.modal', resolve, { once: true }));
    modal.hide();
    await ocultado;
  }
  const motivo = await Utils.promptInput('Solicitar cancelaci\u00f3n',
    'Motivo de la cancelaci\u00f3n de la venta #' + state.cancelarSelectedId + ':');
  if (!motivo) return;
  const ok = await Utils.confirm('Se enviar\u00e1 una solicitud de cancelaci\u00f3n para la venta #' + state.cancelarSelectedId +
    '. Un administrador deber\u00e1 autorizarla para revertir el stock.',
    'Solicitar cancelaci\u00f3n');
  if (!ok) return;
  try {
    await API.post('/ventas/' + state.cancelarSelectedId + '/solicitar-cancelacion', { motivo });
    Utils.showToast('Solicitud de cancelaci\u00f3n enviada. Espera la autorizaci\u00f3n del administrador', 'success');
    state.cancelarSelectedId = null;
    await cargarEsperas();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function realizarVentaRapida() {
  if (!state.caja) return;
  const desc = document.getElementById('posVrDescripcion').value.trim();
  const precioVenta = parseFloat(document.getElementById('posVrVenta').value);
  const precioCompra = parseFloat(document.getElementById('posVrCompra').value) || null;
  const cantidad = parseInt(document.getElementById('posVrCantidad').value) || 1;

  if (!desc) { Utils.showToast('Descripci\u00f3n requerida', 'warning'); return; }
  if (!precioVenta || precioVenta <= 0) { Utils.showToast('Precio inv\u00e1lido', 'warning'); return; }

  try {
    const resp = await API.post('/carrito/rapidos', {
      idCaja: state.caja.idCaja,
      descripcion: desc,
      precioVenta: precioVenta,
      precioCompra: precioCompra,
      cantidad: cantidad,
    });

    state.cart.push({
      idProducto: -resp.idItemRapido,
      nombre: desc,
      sku: 'VR',
      cantidad: cantidad,
      precioUnitario: precioVenta,
      stockActual: 999999,
      _idRapido: resp.idItemRapido,
    });

    renderCart();
    bootstrap.Modal.getInstance(document.getElementById('posVentaRapidaModal'))?.hide();
    document.getElementById('posVrDescripcion').value = '';
    document.getElementById('posVrVenta').value = '';
    document.getElementById('posVrCantidad').value = '1';
    document.getElementById('posVrCompra').value = '';
    Utils.showToast('Item agregado al carrito', 'success');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function abandonarCaja() {
  if (state.cart.length > 0) {
    const ok = await Utils.confirm('Carrito lleno',
      'Tienes productos en el carrito. \u00bfAbandonar de todas formas?');
    if (!ok) return;
  }
  try {
    const pendientes = await API.get('/gastos/pendientes/' + state.caja.idCaja + '/count');
    if (pendientes > 0) {
      const ok = await Utils.confirm('Gastos Pendientes',
        'Hay ' + pendientes + ' gasto(s) pendiente(s) por autorizar. \u00bfAbandonar caja de todas formas?');
      if (!ok) return;
    }
  } catch (_) {}
  window.__cajaAbierta = false;
  detenerPollingCaja();
  localStorage.removeItem('lastCajaId');
  await limpiarCart();
  state.caja = null;
  state.reanudandoVentaId = null;
  state.esperaVentas = [];
  entrarCajaNormal();
}

function abrirClienteModal() {
  document.getElementById('formPosCliente').reset();
  document.getElementById('posClienteEstado').value = '';
  document.getElementById('posClienteMunicipio').value = '';
  document.getElementById('posClienteColonia').innerHTML = '<option value="">Seleccionar...</option>';
  const group = document.getElementById('posClienteLimiteCreditoGroup');
  if (group) group.style.display = 'none';
  cargarPaises('posClientePais');
  cargarRegimenes('posClienteRegimen');
  new bootstrap.Modal(document.getElementById('posClienteModal')).show();
}

async function guardarClienteDesdePOS() {
  function buildDireccionPOS() {
    const calle = document.getElementById('posClienteCalle')?.value?.trim() || '';
    const numExt = document.getElementById('posClienteNumExt')?.value?.trim() || '';
    const numInt = document.getElementById('posClienteNumInt')?.value?.trim() || '';
    const colonia = document.getElementById('posClienteColonia')?.value || '';
    const municipio = document.getElementById('posClienteMunicipio')?.value?.trim() || '';
    const estado = document.getElementById('posClienteEstado')?.value?.trim() || '';
    const cp = document.getElementById('posClienteCp')?.value?.trim() || '';
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

  const tieneCredito = document.getElementById('posClienteTieneCredito').checked;
  const data = {
    nombre: document.getElementById('posClienteNombre').value.trim(),
    apellidoPaterno: document.getElementById('posClienteApaterno').value.trim(),
    apellidoMaterno: document.getElementById('posClienteAmaterno').value.trim(),
    telefono: document.getElementById('posClienteTelefono').value.trim(),
    codigoPais: document.getElementById('posClientePais').value,
    whatsapp: document.getElementById('posClienteWhatsapp').value.trim(),
    empresa: document.getElementById('posClienteEmpresa').value.trim(),
    regimenFiscal: document.getElementById('posClienteRegimen').value,
    cp: document.getElementById('posClienteCp')?.value?.trim() || null,
    direccion: buildDireccionPOS() || null,
    tieneCredito: tieneCredito,
    limiteCredito: tieneCredito ? (parseFloat(document.getElementById('posClienteLimiteCredito').value) || 0) : 0,
  };

  if (!data.nombre) { Utils.showToast('Nombre requerido', 'warning'); return; }
  if (!data.apellidoPaterno) { Utils.showToast('Apellido paterno requerido', 'warning'); return; }
  if (!data.telefono) { Utils.showToast('Tel\u00e9fono requerido', 'warning'); return; }
  if (!data.regimenFiscal) { Utils.showToast('R\u00e9gimen fiscal requerido', 'warning'); return; }

  try {
    await API.post('/clientes', data);
    Utils.showToast('Cliente creado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('posClienteModal'))?.hide();
    await cargarClientesSelect('posCliente');
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

const cpCachePOS = {};

async function cargarColoniasPOS(cp, selectedColonia) {
  if (!cp || cp.length !== 5) return;
  if (cpCachePOS[cp]) {
    aplicarDatosCPPOS(cpCachePOS[cp], selectedColonia);
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
      cpCachePOS[cp] = result;
      aplicarDatosCPPOS(result, selectedColonia);
    }
  } catch (_) {
    document.getElementById('posClienteEstado').value = '';
    document.getElementById('posClienteColonia').innerHTML = '<option value="">No disponible</option>';
  }
}

function aplicarDatosCPPOS(result, selectedColonia) {
  const sel = document.getElementById('posClienteColonia');
  if (sel) {
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      result.colonias.map(c => `<option value="${c}" ${c === selectedColonia ? 'selected' : ''}>${c}</option>`).join('');
    sel.disabled = false;
  }
  const estadoInput = document.getElementById('posClienteEstado');
  if (estadoInput) estadoInput.value = result.estado;
}

// --- Promociones y Combos POS Integration ---

async function abrirPromocionesModal() {
  new bootstrap.Modal(document.getElementById('posPromocionModal')).show();
  await Promise.all([cargarPromosActivas(), cargarCombosActivos()]);
}

async function cargarPromosActivas() {
  const container = document.getElementById('posPromosContainer');
  if (!container) return;
  try {
    const promos = await API.get('/promociones/activas');
    const filtered = promos.filter(p => p.tipo === 'PROMOCION');
    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-muted"><i class="fas fa-percent fa-2x mb-2"></i><p>No hay promociones activas</p></div>';
      return;
    }
    container.innerHTML = filtered.map(p => `
      <div class="col-md-6">
        <div class="card card-sm border-primary promo-card" data-id="${p.idPromocion}" data-tipo="PROMOCION" style="cursor:pointer">
          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold small">${Utils.esc(p.nombre)}</div>
                <small class="text-muted">${p.productoNombre ? Utils.esc(p.productoNombre) : ''}</small>
              </div>
              <div class="text-end">
                <div class="badge bg-danger">-${p.descuentoPorcentaje}%</div>
                <div class="fw-bold mt-1" style="color:var(--primary)">$${(p.precioFinal || 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`).join('');

    container.querySelectorAll('.promo-card').forEach(card => {
      card.addEventListener('click', () => aplicarPromocion(parseInt(card.dataset.id)));
    });
  } catch (_) {
    container.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar promociones</div>';
  }
}

async function cargarCombosActivos() {
  const container = document.getElementById('posCombosContainer');
  if (!container) return;
  try {
    const combos = await API.get('/promociones/activas');
    const filtered = combos.filter(c => c.tipo === 'COMBO');
    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-muted"><i class="fas fa-boxes fa-2x mb-2"></i><p>No hay combos activos</p></div>';
      return;
    }
    container.innerHTML = filtered.map(c => `
      <div class="col-md-6">
        <div class="card card-sm border-info combo-card" data-id="${c.idPromocion}" data-tipo="COMBO" style="cursor:pointer">
          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold small">${Utils.esc(c.nombre)}</div>
                <small class="text-muted">${(c.detalles || []).length} producto(s)</small>
              </div>
              <div class="text-end">
                <div class="badge bg-info">-${c.descuentoPorcentaje}%</div>
                <div class="fw-bold mt-1" style="color:var(--primary)">$${(c.precioFinal || 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`).join('');

    container.querySelectorAll('.combo-card').forEach(card => {
      card.addEventListener('click', () => aplicarCombo(parseInt(card.dataset.id)));
    });
  } catch (_) {
    container.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar combos</div>';
  }
}

async function aplicarPromocion(promoId) {
  try {
    const promo = await API.get('/promociones/' + promoId);
    if (!promo.idProducto) {
      Utils.showToast('La promoci\u00f3n no tiene producto asignado', 'warning');
      return;
    }

    const productExists = state.productos.find(p => p.idProducto === promo.idProducto);
    if (!productExists) {
      const data = await API.get('/productos?search=&activo=true&page=0&size=500');
      state.productos = data.content || [];
    }

    const prod = state.productos.find(p => p.idProducto === promo.idProducto);
    if (!prod) {
      Utils.showToast('Producto no encontrado en el inventario', 'warning');
      return;
    }

    if (getStockSucursal(prod) <= 0) {
      Utils.showToast('Producto sin stock en esta sucursal', 'warning');
      return;
    }

    const idx = state.cart.findIndex(d => d.idProducto === promo.idProducto);
    if (idx >= 0) {
      const stockSuc = getStockSucursal(prod);
      if (state.cart[idx].cantidad >= stockSuc) {
        Utils.showToast('Stock insuficiente', 'warning');
        return;
      }
      state.cart[idx].cantidad++;
    } else {
      state.cart.push({
        idProducto: promo.idProducto,
        nombre: prod.nombre,
        sku: prod.sku,
        cantidad: 1,
        precioUnitario: promo.precioFinal || 0,
        stockActual: getStockSucursal(prod),
        _promoNombre: promo.nombre,
        _promoId: promoId,
      });
    }

    renderCart();
    Utils.showToast('Promoci\u00f3n aplicada: ' + promo.nombre, 'success');
    bootstrap.Modal.getInstance(document.getElementById('posPromocionModal'))?.hide();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function aplicarCombo(comboId) {
  try {
    const combo = await API.get('/promociones/' + comboId);
    const detalles = combo.detalles || [];
    if (detalles.length === 0) {
      Utils.showToast('El combo no tiene productos', 'warning');
      return;
    }

    const data = await API.get('/productos?activo=true&page=0&size=500');
    const allProductos = data.content || [];
    const desc = combo.descuentoPorcentaje || 0;

    let skipped = 0;
    for (const det of detalles) {
      const prod = allProductos.find(p => p.idProducto === det.idProducto);
      if (!prod) { skipped++; continue; }

      const unitPrice = (prod.precioBase || 0) * (1 - desc / 100);
      const stockSuc = state.caja?.idSucursal
        ? (prod.inventarioSucursales || []).find(i => i.idSucursal === state.caja.idSucursal)?.stock || 0
        : prod.stockActual || 0;

      if (stockSuc < det.cantidad) { skipped++; continue; }

      const existing = state.cart.find(d => d.idProducto === det.idProducto);
      if (existing) {
        existing.cantidad += det.cantidad;
      } else {
        state.cart.push({
          idProducto: det.idProducto,
          nombre: prod.nombre,
          sku: prod.sku,
          cantidad: det.cantidad,
          precioUnitario: unitPrice,
          stockActual: stockSuc,
          _comboNombre: combo.nombre,
          _comboId: comboId,
        });
      }
    }

    if (skipped === detalles.length) {
      Utils.showToast('No se pudo agregar ning\u00fan producto del combo (sin stock)', 'warning');
      return;
    }

    renderCart();
    Utils.showToast('Combo aplicado: ' + combo.nombre + (skipped > 0 ? ' (' + skipped + ' producto(s) sin stock omitidos)' : ''), 'success');
    bootstrap.Modal.getInstance(document.getElementById('posPromocionModal'))?.hide();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
