// -----------------------------------------------------------------
// App principal — Punto Electro
// -----------------------------------------------------------------

let currentClients = [];
let currentJobs = [];
let pendingFotos = []; // fotos cargadas en el form, esperando "Agregar"
let viendoClienteId = null;

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

async function renderAll() {
  currentClients = await getAllClients();
  currentJobs = await getAllJobs();
  renderClientDatalist();
  renderLedger();
  renderClientesLista();
  if (viendoClienteId) renderClienteDetalle(viendoClienteId);
}

function renderClientDatalist() {
  const dl = document.getElementById('clientesList');
  dl.innerHTML = currentClients.map(c => `<option value="${escapeHtml(c.nombre)}">`).join('');
}

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

// ---------------- REPARACIONES ----------------
document.getElementById('btnAdd').addEventListener('click', async () => {
  const clienteNombre = document.getElementById('f_cliente').value.trim();
  const fecha = document.getElementById('f_fecha').value || todayStr();
  const equipo = document.getElementById('f_equipo').value.trim();
  const desc = document.getElementById('f_desc').value.trim();
  const ingreso = parseFloat(document.getElementById('f_ingreso').value) || 0;
  const gasto = parseFloat(document.getElementById('f_gasto').value) || 0;
  const estado = document.getElementById('f_estado').value;

  if (!clienteNombre) {
    alert('Ingresá el nombre del cliente.');
    return;
  }
  if (!equipo && !desc) {
    alert('Cargá al menos el equipo o la descripción.');
    return;
  }

  const cliente = await findOrCreateClientByName(clienteNombre);

  await saveJob({
    clientId: cliente.id,
    fecha, equipo, desc, ingreso, gasto, estado,
    fotos: [...pendingFotos],
  });

  // reset form
  document.getElementById('f_cliente').value = '';
  document.getElementById('f_equipo').value = '';
  document.getElementById('f_desc').value = '';
  document.getElementById('f_ingreso').value = '';
  document.getElementById('f_gasto').value = '';
  document.getElementById('f_estado').value = 'pendiente';
  document.getElementById('f_fecha').value = todayStr();
  pendingFotos = [];
  renderFotoPreview();

  await renderAll();
});

function clienteNombrePorId(id) {
  const c = currentClients.find(c => c.id === id);
  return c ? c.nombre : 'Cliente eliminado';
}

async function toggleEstado(id) {
  const job = currentJobs.find(j => j.id === id);
  if (!job) return;
  job.estado = job.estado === 'pendiente' ? 'entregado' : 'pendiente';
  await saveJob(job);
  await renderAll();
}

async function deleteJobConfirm(id) {
  if (!confirm('¿Eliminar esta reparación?')) return;
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

function renderJobCard(job) {
  const profit = Number(job.ingreso || 0) - Number(job.gasto || 0);
  const fotosHtml = (job.fotos || []).map(f =>
    `<img src="${f}" onclick="abrirLightbox('${f.replace(/'/g, "\\'")}')">`
  ).join('');
  return `
    <div class="entry ${job.estado}">
      <div class="entry-top">
        <div class="entry-title" onclick="irACliente('${job.clientId}')">${escapeHtml(clienteNombrePorId(job.clientId))}${job.equipo ? ' · ' + escapeHtml(job.equipo) : ''}</div>
        <div class="entry-date">${fmtDate(job.fecha)}</div>
      </div>
      ${job.desc ? `<div class="entry-desc">${escapeHtml(job.desc)}</div>` : ''}
      ${fotosHtml ? `<div class="entry-fotos">${fotosHtml}</div>` : ''}
      <div class="entry-money">
        <div><b>Ingreso</b><span class="income">${fmtMoney(job.ingreso)}</span></div>
        <div><b>Gasto</b><span class="expense">${fmtMoney(job.gasto)}</span></div>
        <div><b>Ganancia</b><span class="profit">${fmtMoney(profit)}</span></div>
      </div>
      <div class="entry-bottom">
        <span class="status-tag" onclick="toggleEstado('${job.id}')">${job.estado}</span>
        <div class="entry-actions">
          <button class="btn-danger" onclick="deleteJobConfirm('${job.id}')">Eliminar</button>
        </div>
      </div>
    </div>`;
}

function renderLedger() {
  const filterText = document.getElementById('filterText').value.toLowerCase();
  const filterEstado = document.getElementById('filterEstado').value;

  const filtered = currentJobs.filter(j => {
    const nombreCliente = clienteNombrePorId(j.clientId).toLowerCase();
    const matchesText = !filterText || (nombreCliente + ' ' + (j.equipo || '')).toLowerCase().includes(filterText);
    const matchesEstado = filterEstado === 'todos' || j.estado === filterEstado;
    return matchesText && matchesEstado;
  });

  const totalIngresos = currentJobs.reduce((s, j) => s + Number(j.ingreso || 0), 0);
  const totalGastos = currentJobs.reduce((s, j) => s + Number(j.gasto || 0), 0);
  const neto = totalIngresos - totalGastos;

  document.getElementById('totalIngresos').textContent = fmtMoney(totalIngresos);
  document.getElementById('totalGastos').textContent = fmtMoney(totalGastos);
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
      ? 'Todavía no cargaste ninguna reparación.'
      : 'No hay resultados con ese filtro.';
    return;
  }
  emptyMsg.style.display = 'none';
  ledger.innerHTML = filtered.map(renderJobCard).join('');
}

document.getElementById('filterText').addEventListener('input', renderLedger);
document.getElementById('filterEstado').addEventListener('change', renderLedger);

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
  const filtered = currentClients.filter(c => !filterText || c.nombre.toLowerCase().includes(filterText));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty">${currentClients.length === 0 ? 'Todavía no cargaste ningún cliente.' : 'No hay resultados.'}</div>`;
    return;
  }

  wrap.innerHTML = filtered.map(c => {
    const jobs = currentJobs.filter(j => j.clientId === c.id);
    const neto = jobs.reduce((s, j) => s + Number(j.ingreso || 0) - Number(j.gasto || 0), 0);
    return `
      <div class="cliente-card">
        <div class="cliente-info">
          <h3 onclick="irACliente('${c.id}')">${escapeHtml(c.nombre)}</h3>
          <p>${c.telefono ? escapeHtml(c.telefono) + ' · ' : ''}${jobs.length} trabajo${jobs.length !== 1 ? 's' : ''}</p>
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
  const totalIngresos = jobs.reduce((s, j) => s + Number(j.ingreso || 0), 0);
  const totalGastos = jobs.reduce((s, j) => s + Number(j.gasto || 0), 0);

  document.getElementById('clienteDetalleInfo').innerHTML = `
    <h2>${escapeHtml(cliente.nombre)}</h2>
    ${cliente.telefono ? `<p class="hint">📞 ${escapeHtml(cliente.telefono)}</p>` : ''}
    ${cliente.notas ? `<p class="hint">${escapeHtml(cliente.notas)}</p>` : ''}
    <div class="entry-money" style="margin-top:10px;">
      <div><b>Ingresos totales</b><span class="income">${fmtMoney(totalIngresos)}</span></div>
      <div><b>Gastos totales</b><span class="expense">${fmtMoney(totalGastos)}</span></div>
      <div><b>Ganancia total</b><span class="profit">${fmtMoney(totalIngresos - totalGastos)}</span></div>
    </div>
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
renderAll();
