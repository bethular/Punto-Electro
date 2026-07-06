// -----------------------------------------------------------------
// App principal — Punto Electro
// -----------------------------------------------------------------

let currentClients = [];
let currentJobs = [];
let currentCaja = [];
let pendingFotos = []; // fotos cargadas en el form, esperando "Agregar"
let viendoClienteId = null;
let filterPagoState = 'todos';
let cajaQuickAddTipo = 'ingreso';
let resumenTipo = 'semana';
let resumenOffset = 0;

function fmtMoney(n) {
  return '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function fmtDate(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return d && m ? `${d}/${m}/${y}` : fecha;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function genLocalId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function waLink(telefono) {
  const digits = (telefono || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

// ---------------- MIGRACIÓN / NORMALIZACIÓN DE TRABAJOS ----------------
// Los trabajos viejos tenían ingreso/gasto sueltos en vez de "movimientos".
// Esto los convierte al vuelo para que no se pierda nada.
function normalizeJob(job) {
  if (!job.movimientos) {
    job.movimientos = [];
    if (Number(job.ingreso) > 0) {
      job.movimientos.push({ id: genLocalId(), tipo: 'ingreso', subtipo: 'otro', monto: Number(job.ingreso), detalle: 'Ingreso (migrado)', fecha: job.fecha });
    }
    if (Number(job.gasto) > 0) {
      job.movimientos.push({ id: genLocalId(), tipo: 'gasto', monto: Number(job.gasto), detalle: 'Gasto (migrado)', fecha: job.fecha });
    }
  }
  if (job.presupuesto === undefined) job.presupuesto = 0;
  return job;
}

function totalIngresoJob(job) {
  return (job.movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0);
}
function totalGastoJob(job) {
  return (job.movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto || 0), 0);
}
function saldoJob(job) {
  return Number(job.presupuesto || 0) - totalIngresoJob(job);
}
function pagoEstadoJob(job) {
  const presupuesto = Number(job.presupuesto || 0);
  if (presupuesto <= 0) return 'pagado'; // sin presupuesto definido, no se rastrea deuda
  const saldo = saldoJob(job);
  if (saldo > 0.01) return totalIngresoJob(job) > 0 ? 'parcial' : 'debe';
  return 'pagado';
}

// ---------------- TABS ----------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------------- INIT ----------------
document.getElementById('f_fecha').value = todayStr();

let autoPushTimer = null;
function scheduleAutoPush() {
  if (typeof accessToken === 'undefined' || !accessToken) return;
  clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(() => { saveToDrive(); }, 2500);
}

async function renderAll(skipAutoPush) {
  currentClients = await getAllClients();
  currentJobs = (await getAllJobs()).map(normalizeJob);
  currentCaja = await getAllCaja();
  renderClientDatalist();
  renderLedger();
  renderClientesLista();
  renderCajaLista();
  renderResumen();
  if (viendoClienteId) renderClienteDetalle(viendoClienteId);
  if (!skipAutoPush) scheduleAutoPush();
}

function renderClientDatalist() {
  const dl = document.getElementById('clientesList');
  dl.innerHTML = currentClients.map(c => `<option value="${escapeHtml(c.nombre)}">`).join('');
}

// Autocompletar teléfono cuando el nombre coincide con un cliente existente
document.getElementById('f_cliente').addEventListener('input', (e) => {
  const nombre = e.target.value.trim().toLowerCase();
  const match = currentClients.find(c => c.nombre.trim().toLowerCase() === nombre);
  if (match) document.getElementById('f_telefono').value = match.telefono || '';
});

// Mostrar/ocultar subtipo de ingreso según el tipo de movimiento inicial
document.getElementById('f_mov_tipo').addEventListener('change', (e) => {
  document.getElementById('f_mov_subtipo_wrap').style.display = e.target.value === 'ingreso' ? 'block' : 'none';
});

// ---------------- FOTOS EN EL FORM ----------------
document.getElementById('f_fotos').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    pendingFotos.push(dataUrl);
  }
  renderFotoPreview();
  e.target.value = '';
});

function renderFotoPreview() {
  const wrap = document.getElementById('fotoPreview');
  wrap.innerHTML = pendingFotos.map((f, i) =>
    `<img src="${f}" onclick="quitarFotoPendiente(${i})" title="Tocar para quitar">`
  ).join('');
}
function quitarFotoPendiente(i) {
  pendingFotos.splice(i, 1);
  renderFotoPreview();
}

// ---------------- NUEVA ORDEN DE TRABAJO ----------------
document.getElementById('btnAdd').addEventListener('click', async () => {
  const clienteNombre = document.getElementById('f_cliente').value.trim();
  const telefono = document.getElementById('f_telefono').value.trim();
  const fecha = document.getElementById('f_fecha').value || todayStr();
  const equipo = document.getElementById('f_equipo').value.trim();
  const desc = document.getElementById('f_desc').value.trim();
  const presupuesto = parseFloat(document.getElementById('f_presupuesto').value) || 0;
  const estado = document.getElementById('f_estado').value;

  const movTipo = document.getElementById('f_mov_tipo').value;
  const movSubtipo = document.getElementById('f_mov_subtipo').value;
  const movMonto = parseFloat(document.getElementById('f_mov_monto').value) || 0;
  const movDetalle = document.getElementById('f_mov_detalle').value.trim();

  if (!clienteNombre) { alert('Ingresá el nombre del cliente.'); return; }
  if (!equipo && !desc) { alert('Cargá al menos el equipo o la descripción.'); return; }

  const cliente = await findOrCreateClientByNameAndPhone(clienteNombre, telefono);

  const movimientos = [];
  if (movMonto > 0) {
    movimientos.push({
      id: genLocalId(),
      tipo: movTipo,
      subtipo: movTipo === 'ingreso' ? movSubtipo : undefined,
      monto: movMonto,
      detalle: movDetalle || (movTipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
      fecha,
    });
  }

  await saveJob({
    clientId: cliente.id,
    fecha, equipo, desc, estado, presupuesto,
    movimientos,
    fotos: [...pendingFotos],
  });

  // reset form
  document.getElementById('f_cliente').value = '';
  document.getElementById('f_telefono').value = '';
  document.getElementById('f_equipo').value = '';
  document.getElementById('f_desc').value = '';
  document.getElementById('f_presupuesto').value = '';
  document.getElementById('f_estado').value = 'pendiente';
  document.getElementById('f_mov_tipo').value = 'ingreso';
  document.getElementById('f_mov_subtipo').value = 'adelanto';
  document.getElementById('f_mov_subtipo_wrap').style.display = 'block';
  document.getElementById('f_mov_monto').value = '';
  document.getElementById('f_mov_detalle').value = '';
  document.getElementById('f_fecha').value = todayStr();
  pendingFotos = [];
  renderFotoPreview();

  await renderAll();
});

function clienteNombrePorId(id) {
  const c = currentClients.find(c => c.id === id);
  return c ? c.nombre : 'Cliente eliminado';
}
function clienteTelefonoPorId(id) {
  const c = currentClients.find(c => c.id === id);
  return c ? c.telefono : '';
}

async function toggleEstado(id) {
  const job = currentJobs.find(j => j.id === id);
  if (!job) return;
  job.estado = job.estado === 'pendiente' ? 'entregado' : 'pendiente';
  await saveJob(job);
  await renderAll();
}

async function deleteJobConfirm(id) {
  if (!confirm('¿Eliminar esta orden de trabajo?')) return;
  await deleteJob(id);
  await renderAll();
}

function abrirLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${src}">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

// ---------------- PRESUPUESTO ----------------
async function editarPresupuesto(id) {
  const job = currentJobs.find(j => j.id === id);
  if (!job) return;
  const val = prompt('Presupuesto para este trabajo:', job.presupuesto || 0);
  if (val === null) return;
  job.presupuesto = parseFloat(val) || 0;
  await saveJob(job);
  await renderAll();
}

// ---------------- MOVIMIENTOS (ingresos/gastos independientes) ----------------
function toggleMovForm(jobId) {
  const el = document.getElementById('movform-' + jobId);
  if (el) el.classList.toggle('open');
}

document.addEventListener('change', (e) => {
  if (e.target.matches('.mov-tipo-select')) {
    const jobId = e.target.dataset.job;
    const subWrap = document.getElementById('mov-sub-wrap-' + jobId);
    if (subWrap) subWrap.style.display = e.target.value === 'ingreso' ? 'block' : 'none';
  }
});

async function agregarMovimiento(jobId) {
  const job = currentJobs.find(j => j.id === jobId);
  if (!job) return;
  const tipo = document.getElementById('mov-tipo-' + jobId).value;
  const subtipo = document.getElementById('mov-subtipo-' + jobId) ? document.getElementById('mov-subtipo-' + jobId).value : undefined;
  const monto = parseFloat(document.getElementById('mov-monto-' + jobId).value) || 0;
  const detalle = document.getElementById('mov-detalle-' + jobId).value.trim();

  if (monto <= 0) { alert('Ingresá un monto mayor a 0.'); return; }

  job.movimientos = job.movimientos || [];
  job.movimientos.push({
    id: genLocalId(),
    tipo,
    subtipo: tipo === 'ingreso' ? subtipo : undefined,
    monto,
    detalle: detalle || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
    fecha: todayStr(),
  });
  await saveJob(job);
  await renderAll();
}

async function eliminarMovimiento(jobId, movId) {
  const job = currentJobs.find(j => j.id === jobId);
  if (!job) return;
  if (!confirm('¿Eliminar este movimiento?')) return;
  job.movimientos = (job.movimientos || []).filter(m => m.id !== movId);
  await saveJob(job);
  await renderAll();
}

async function cobrarSaldo(jobId) {
  const job = currentJobs.find(j => j.id === jobId);
  if (!job) return;
  const saldo = saldoJob(job);
  if (saldo <= 0) return;
  if (!confirm(`¿Registrar el cobro del saldo pendiente (${fmtMoney(saldo)})?`)) return;
  job.movimientos = job.movimientos || [];
  job.movimientos.push({
    id: genLocalId(),
    tipo: 'ingreso',
    subtipo: 'pago_final',
    monto: saldo,
    detalle: 'Pago del saldo pendiente',
    fecha: todayStr(),
  });
  await saveJob(job);
  await renderAll();
}

// ---------------- RENDER DE TARJETA DE TRABAJO ----------------
function subtipoLabel(subtipo) {
  if (subtipo === 'adelanto') return 'Adelanto';
  if (subtipo === 'pago_final') return 'Pago final';
  return '';
}

function renderJobCard(job) {
  const ingresos = totalIngresoJob(job);
  const gastos = totalGastoJob(job);
  const ganancia = ingresos - gastos;
  const presupuesto = Number(job.presupuesto || 0);
  const saldo = saldoJob(job);
  const pagoEstado = pagoEstadoJob(job);
  const telefono = clienteTelefonoPorId(job.clientId);
  const wa = waLink(telefono);

  const fotosHtml = (job.fotos || []).map(f =>
    `<img src="${f}" onclick="abrirLightbox('${f.replace(/'/g, "\\'")}')">`
  ).join('');

  const movHtml = (job.movimientos || []).length
    ? (job.movimientos || []).map(m => `
      <div class="mov-item">
        <span class="mov-detalle">${escapeHtml(m.detalle)}${m.subtipo ? ' · ' + subtipoLabel(m.subtipo) : ''} <span style="opacity:.6">(${fmtDate(m.fecha)})</span></span>
        <span class="mov-monto ${m.tipo}">${m.tipo === 'gasto' ? '−' : '+'}${fmtMoney(m.monto)}</span>
        <button class="mov-del" onclick="eliminarMovimiento('${job.id}','${m.id}')">✕</button>
      </div>`).join('')
    : '<div class="mov-item"><span class="mov-detalle">Todavía no hay movimientos cargados.</span></div>';

  const pagoTagClass = pagoEstado === 'debe' ? 'debe' : (pagoEstado === 'parcial' ? 'parcial' : 'pagado');
  const pagoTagText = pagoEstado === 'debe' ? 'Debe' : (pagoEstado === 'parcial' ? 'Parcial' : 'Pagado');

  return `
    <div class="entry ${job.estado}">
      <div class="entry-top">
        <div>
          <div class="entry-title" onclick="irACliente('${job.clientId}')">${escapeHtml(clienteNombrePorId(job.clientId))}${job.equipo ? ' · ' + escapeHtml(job.equipo) : ''}</div>
          ${wa ? `<a class="phone-link" href="${wa}" target="_blank" rel="noopener">💬 ${escapeHtml(telefono)}</a>` : ''}
        </div>
        <div class="entry-date">${fmtDate(job.fecha)}</div>
      </div>
      ${fotosHtml ? `<div class="entry-fotos">${fotosHtml}</div>` : ''}
      ${job.desc ? `<div class="entry-desc">${escapeHtml(job.desc)}</div>` : ''}

      <div class="presupuesto-line" onclick="editarPresupuesto('${job.id}')">
        Presupuesto: <b>${presupuesto > 0 ? fmtMoney(presupuesto) : 'sin definir'}</b> (tocar para editar)
        ${presupuesto > 0 && saldo > 0.01 ? ` · <span class="saldo-line">saldo: ${fmtMoney(saldo)}</span>` : ''}
      </div>

      <div class="entry-money">
        <div><b>Ingresos</b><span class="income">${fmtMoney(ingresos)}</span></div>
        <div><b>Gastos</b><span class="expense">${fmtMoney(gastos)}</span></div>
        <div><b>Ganancia</b><span class="profit">${fmtMoney(ganancia)}</span></div>
      </div>

      <div class="movimientos-list">${movHtml}</div>

      <div class="btn-row">
        <button class="btn-ghost btn-sm" onclick="toggleMovForm('${job.id}')">+ Movimiento</button>
        ${presupuesto > 0 && saldo > 0.01 ? `<button class="btn-cobrar btn-sm" onclick="cobrarSaldo('${job.id}')">Cobrar saldo (${fmtMoney(saldo)})</button>` : ''}
      </div>

      <div class="mov-add-form" id="movform-${job.id}">
        <div class="grid2">
          <div class="field">
            <label>Tipo</label>
            <select id="mov-tipo-${job.id}" class="mov-tipo-select" data-job="${job.id}">
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </select>
          </div>
          <div class="field" id="mov-sub-wrap-${job.id}">
            <label>¿Qué es?</label>
            <select id="mov-subtipo-${job.id}">
              <option value="adelanto">Adelanto / seña</option>
              <option value="pago_final">Pago final</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div class="grid2">
          <div class="field">
            <label>Monto</label>
            <input type="number" id="mov-monto-${job.id}" placeholder="0" min="0" step="1">
          </div>
          <div class="field">
            <label>Detalle</label>
            <input type="text" id="mov-detalle-${job.id}" placeholder="Ej: repuesto, adelanto...">
          </div>
        </div>
        <button class="btn-primary" onclick="agregarMovimiento('${job.id}')">Guardar movimiento</button>
      </div>

      <div class="entry-bottom">
        <div class="status-group">
          <span class="status-tag" onclick="toggleEstado('${job.id}')">${job.estado}</span>
          <span class="pago-tag ${pagoTagClass}">${pagoTagText}</span>
        </div>
        <div class="entry-actions">
          <button class="btn-danger" onclick="deleteJobConfirm('${job.id}')">Eliminar</button>
        </div>
      </div>
    </div>`;
}

function renderLedger() {
  const filterText = document.getElementById('filterText').value.toLowerCase();
  const filterEstado = document.getElementById('filterEstado').value;
  const filterPago = document.getElementById('filterPago').value;

  const filtered = currentJobs.filter(j => {
    const nombreCliente = clienteNombrePorId(j.clientId).toLowerCase();
    const telefono = (clienteTelefonoPorId(j.clientId) || '').toLowerCase();
    const matchesText = !filterText || (nombreCliente + ' ' + telefono + ' ' + (j.equipo || '')).toLowerCase().includes(filterText);
    const matchesEstado = filterEstado === 'todos' || j.estado === filterEstado;
    const pagoEstado = pagoEstadoJob(j);
    const matchesPago = filterPago === 'todos' || (filterPago === 'debe' ? (pagoEstado === 'debe' || pagoEstado === 'parcial') : pagoEstado === 'pagado');
    return matchesText && matchesEstado && matchesPago;
  });

  const totalIngresos = currentJobs.reduce((s, j) => s + totalIngresoJob(j), 0)
    + currentCaja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalGastos = currentJobs.reduce((s, j) => s + totalGastoJob(j), 0)
    + currentCaja.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto || 0), 0);
  const neto = totalIngresos - totalGastos;
  const totalPorCobrar = currentJobs.reduce((s, j) => s + Math.max(0, saldoJob(j)), 0);

  document.getElementById('totalIngresos').textContent = fmtMoney(totalIngresos);
  document.getElementById('totalGastos').textContent = fmtMoney(totalGastos);
  document.getElementById('totalPorCobrar').textContent = fmtMoney(totalPorCobrar);
  const netoEl = document.getElementById('totalNeto');
  netoEl.textContent = fmtMoney(neto);
  netoEl.classList.remove('positive', 'negative');
  netoEl.classList.add(neto >= 0 ? 'positive' : 'negative');

  const ledger = document.getElementById('ledger');
  const emptyMsg = document.getElementById('emptyMsg');

  if (filtered.length === 0) {
    ledger.innerHTML = '';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = currentJobs.length === 0
      ? 'Todavía no cargaste ninguna orden de trabajo.'
      : 'No hay resultados con ese filtro.';
    return;
  }
  emptyMsg.style.display = 'none';
  ledger.innerHTML = filtered.map(renderJobCard).join('');
}

document.getElementById('filterText').addEventListener('input', renderLedger);
document.getElementById('filterEstado').addEventListener('change', renderLedger);
document.getElementById('filterPago').addEventListener('change', renderLedger);

// Tocar "Por cobrar" en el dashboard filtra directamente la lista
document.getElementById('cellPorCobrar').addEventListener('click', () => {
  document.getElementById('filterPago').value = 'debe';
  renderLedger();
  document.getElementById('ledger').scrollIntoView({ behavior: 'smooth' });
});

// ---------------- CARGA RÁPIDA DE CAJA (tocando Ingresos/Gastos en el dashboard) ----------------
function abrirCajaQuickAdd(tipo) {
  cajaQuickAddTipo = tipo;
  document.getElementById('cajaQuickAddLabel').textContent = tipo === 'ingreso'
    ? 'Cargar ingreso general (no ligado a un trabajo)'
    : 'Cargar gasto general (no ligado a un trabajo)';
  document.getElementById('cajaQuickAdd').style.display = 'block';
  document.getElementById('caja_monto').value = '';
  document.getElementById('caja_detalle').value = '';
  document.getElementById('cajaQuickAdd').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('cellIngresos').addEventListener('click', () => abrirCajaQuickAdd('ingreso'));
document.getElementById('cellGastos').addEventListener('click', () => abrirCajaQuickAdd('gasto'));
document.getElementById('btnCancelarCaja').addEventListener('click', () => {
  document.getElementById('cajaQuickAdd').style.display = 'none';
});
document.getElementById('btnGuardarCaja').addEventListener('click', async () => {
  const monto = parseFloat(document.getElementById('caja_monto').value) || 0;
  const detalle = document.getElementById('caja_detalle').value.trim();
  if (monto <= 0) { alert('Ingresá un monto mayor a 0.'); return; }
  await saveCajaMov({ tipo: cajaQuickAddTipo, monto, detalle: detalle || (cajaQuickAddTipo === 'ingreso' ? 'Ingreso' : 'Gasto'), fecha: todayStr() });
  document.getElementById('cajaQuickAdd').style.display = 'none';
  await renderAll();
});

// ---------------- PESTAÑA CAJA ----------------
document.getElementById('btnAddCajaTab').addEventListener('click', async () => {
  const tipo = document.getElementById('cajaTab_tipo').value;
  const monto = parseFloat(document.getElementById('cajaTab_monto').value) || 0;
  const detalle = document.getElementById('cajaTab_detalle').value.trim();
  if (monto <= 0) { alert('Ingresá un monto mayor a 0.'); return; }
  await saveCajaMov({ tipo, monto, detalle: detalle || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto'), fecha: todayStr() });
  document.getElementById('cajaTab_monto').value = '';
  document.getElementById('cajaTab_detalle').value = '';
  await renderAll();
});

async function eliminarCajaMov(id) {
  if (!confirm('¿Eliminar este movimiento de caja?')) return;
  await deleteCajaMov(id);
  await renderAll();
}

function renderCajaLista() {
  const filterText = (document.getElementById('filterCaja').value || '').toLowerCase();
  const filtered = currentCaja.filter(m => !filterText || (m.detalle || '').toLowerCase().includes(filterText));
  const wrap = document.getElementById('cajaLista');
  const emptyMsg = document.getElementById('cajaEmptyMsg');

  if (filtered.length === 0) {
    wrap.innerHTML = '';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = currentCaja.length === 0
      ? 'Todavía no cargaste movimientos generales de caja.'
      : 'No hay resultados con ese filtro.';
    return;
  }
  emptyMsg.style.display = 'none';

  wrap.innerHTML = filtered.map(m => `
    <div class="entry">
      <div class="entry-top">
        <div class="entry-title">${escapeHtml(m.detalle)}</div>
        <div class="entry-date">${fmtDate(m.fecha)}</div>
      </div>
      <div class="entry-bottom">
        <span class="mov-monto ${m.tipo}" style="font-size:15px;">${m.tipo === 'gasto' ? '−' : '+'}${fmtMoney(m.monto)}</span>
        <div class="entry-actions">
          <button class="btn-danger" onclick="eliminarCajaMov('${m.id}')">Eliminar</button>
        </div>
      </div>
    </div>`).join('');
}
document.getElementById('filterCaja').addEventListener('input', renderCajaLista);

// ---------------- RESUMEN POR PERÍODO (Semana / Mes / Año) ----------------
function getAllMovimientosGlobal() {
  const arr = [];
  currentJobs.forEach(j => (j.movimientos || []).forEach(m => arr.push(m)));
  currentCaja.forEach(m => arr.push(m));
  return arr;
}

function getRangoPeriodo(tipo, offset) {
  const hoy = new Date();
  if (tipo === 'semana') {
    const dia = hoy.getDay(); // 0=domingo
    const diffLunes = (dia === 0 ? -6 : 1 - dia);
    const lunes = new Date(hoy);
    lunes.setHours(0, 0, 0, 0);
    lunes.setDate(hoy.getDate() + diffLunes + offset * 7);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);
    const f = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    return { start: lunes, end: domingo, label: `${f(lunes)} — ${f(domingo)}` };
  }
  if (tipo === 'mes') {
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
    const start = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  // anio
  const year = hoy.getFullYear() + offset;
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end, label: String(year) };
}

function renderResumen() {
  const { start, end, label } = getRangoPeriodo(resumenTipo, resumenOffset);
  const movs = getAllMovimientosGlobal();
  let ingresos = 0, gastos = 0;
  movs.forEach(m => {
    if (!m.fecha) return;
    const d = new Date(m.fecha + 'T12:00:00');
    if (d >= start && d <= end) {
      if (m.tipo === 'ingreso') ingresos += Number(m.monto || 0);
      else gastos += Number(m.monto || 0);
    }
  });
  document.getElementById('resumenLabel').textContent = label;
  document.getElementById('resumenIngresos').textContent = fmtMoney(ingresos);
  document.getElementById('resumenGastos').textContent = fmtMoney(gastos);
  document.getElementById('resumenNeto').textContent = fmtMoney(ingresos - gastos);
}

document.querySelectorAll('.periodo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    resumenTipo = btn.dataset.periodo;
    resumenOffset = 0;
    renderResumen();
  });
});
document.getElementById('resumenPrev').addEventListener('click', () => {
  resumenOffset -= 1;
  renderResumen();
});
document.getElementById('resumenNext').addEventListener('click', () => {
  resumenOffset += 1;
  renderResumen();
});

// ---------------- CLIENTES ----------------
document.getElementById('btnAddClient').addEventListener('click', async () => {
  const nombre = document.getElementById('c_nombre').value.trim();
  const telefono = document.getElementById('c_telefono').value.trim();
  const notas = document.getElementById('c_notas').value.trim();
  if (!nombre) { alert('Ingresá el nombre del cliente.'); return; }

  await saveClient({ nombre, telefono, notas });

  document.getElementById('c_nombre').value = '';
  document.getElementById('c_telefono').value = '';
  document.getElementById('c_notas').value = '';
  await renderAll();
});

function renderClientesLista() {
  const filterText = document.getElementById('filterClientes').value.toLowerCase();
  const wrap = document.getElementById('clientesLista');
  const filtered = currentClients.filter(c =>
    !filterText ||
    c.nombre.toLowerCase().includes(filterText) ||
    (c.telefono || '').toLowerCase().includes(filterText)
  );

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty">${currentClients.length === 0 ? 'Todavía no cargaste ningún cliente.' : 'No hay resultados.'}</div>`;
    return;
  }

  wrap.innerHTML = filtered.map(c => {
    const jobs = currentJobs.filter(j => j.clientId === c.id);
    const neto = jobs.reduce((s, j) => s + totalIngresoJob(j) - totalGastoJob(j), 0);
    const wa = waLink(c.telefono);
    return `
      <div class="cliente-card">
        <div class="cliente-info">
          <h3 onclick="irACliente('${c.id}')">${escapeHtml(c.nombre)}</h3>
          <p>${wa ? `<a class="phone-link" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 ${escapeHtml(c.telefono)}</a> · ` : ''}${jobs.length} trabajo${jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="cliente-stats">${fmtMoney(neto)}</div>
      </div>`;
  }).join('');
}
document.getElementById('filterClientes').addEventListener('input', renderClientesLista);

function irACliente(clientId) {
  document.querySelector('.tab-btn[data-tab="clientes"]').click();
  viendoClienteId = clientId;
  renderClienteDetalle(clientId);
}

function volverAClientes() {
  viendoClienteId = null;
  document.getElementById('clienteDetalle').style.display = 'none';
  document.getElementById('clientesListaWrap').style.display = 'block';
}
document.getElementById('btnVolverClientes').addEventListener('click', volverAClientes);

async function editarTelefonoCliente(id) {
  const cliente = currentClients.find(c => c.id === id);
  if (!cliente) return;
  const val = prompt('Teléfono del cliente:', cliente.telefono || '');
  if (val === null) return;
  cliente.telefono = val.trim();
  await saveClient(cliente);
  await renderAll();
}

async function deleteClienteConfirm(id) {
  const jobs = currentJobs.filter(j => j.clientId === id);
  const msg = jobs.length > 0
    ? `Este cliente tiene ${jobs.length} trabajo(s) cargado(s). ¿Eliminar el cliente igual? (los trabajos quedan sin cliente asignado)`
    : '¿Eliminar este cliente?';
  if (!confirm(msg)) return;
  await deleteClient(id);
  volverAClientes();
  await renderAll();
}

function renderClienteDetalle(clientId) {
  const cliente = currentClients.find(c => c.id === clientId);
  if (!cliente) { volverAClientes(); return; }

  document.getElementById('clientesListaWrap').style.display = 'none';
  document.getElementById('clienteDetalle').style.display = 'block';

  const jobs = currentJobs.filter(j => j.clientId === clientId);
  const totalIngresos = jobs.reduce((s, j) => s + totalIngresoJob(j), 0);
  const totalGastos = jobs.reduce((s, j) => s + totalGastoJob(j), 0);
  const totalPorCobrar = jobs.reduce((s, j) => s + Math.max(0, saldoJob(j)), 0);
  const wa = waLink(cliente.telefono);

  document.getElementById('clienteDetalleInfo').innerHTML = `
    <h2>${escapeHtml(cliente.nombre)}</h2>
    <p class="hint" style="cursor:pointer;" onclick="editarTelefonoCliente('${cliente.id}')">
      ${wa ? `<a class="phone-link" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 ${escapeHtml(cliente.telefono)}</a>` : '📞 sin teléfono'} (tocar para editar)
    </p>
    ${cliente.notas ? `<p class="hint">${escapeHtml(cliente.notas)}</p>` : ''}
    <div class="entry-money" style="margin-top:10px;">
      <div><b>Ingresos totales</b><span class="income">${fmtMoney(totalIngresos)}</span></div>
      <div><b>Gastos totales</b><span class="expense">${fmtMoney(totalGastos)}</span></div>
      <div><b>Ganancia total</b><span class="profit">${fmtMoney(totalIngresos - totalGastos)}</span></div>
    </div>
    ${totalPorCobrar > 0 ? `<p class="saldo-line" style="font-family:var(--font-mono);font-size:13px;margin-top:8px;">Saldo pendiente de este cliente: ${fmtMoney(totalPorCobrar)}</p>` : ''}
    <div class="btn-row">
      <button class="btn-danger" onclick="deleteClienteConfirm('${cliente.id}')">Eliminar cliente</button>
    </div>
  `;

  const jobsWrap = document.getElementById('clienteJobs');
  jobsWrap.innerHTML = jobs.length
    ? jobs.map(renderJobCard).join('')
    : '<div class="empty">Este cliente todavía no tiene trabajos cargados.</div>';
}

// ---------------- SINCRONIZAR: Drive ----------------
document.getElementById('btnConnect').addEventListener('click', connectGoogle);
document.getElementById('btnSaveDrive').addEventListener('click', saveToDrive);
document.getElementById('btnLoadDrive').addEventListener('click', loadFromDrive);

// ---------------- SINCRONIZAR: archivo manual ----------------
document.getElementById('btnExportFile').addEventListener('click', async () => {
  const json = await exportAllData();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `punto-electro-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnImportFileTrigger').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Esto va a REEMPLAZAR los datos actuales por los del archivo. ¿Continuar?')) {
    e.target.value = '';
    return;
  }
  const text = await file.text();
  try {
    await importAllData(text);
    alert('Datos importados correctamente.');
    await renderAll();
  } catch (err) {
    alert('El archivo no tiene un formato válido.');
  }
  e.target.value = '';
});

// ---------------- SERVICE WORKER ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  });
}

// ---------------- ARRANQUE ----------------
initGoogleClient();
renderAll(true).then(() => attemptAutoSync());
