// -----------------------------------------------------------------
// Base de datos local (IndexedDB) - funciona sin internet
// Dos tablas vinculadas: clients (clientes) y jobs (trabajos/reparaciones)
// -----------------------------------------------------------------

const DB_NAME = 'punto-electro-db';
const DB_VERSION = 2;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('clients')) {
        const clients = db.createObjectStore('clients', { keyPath: 'id' });
        clients.createIndex('nombre', 'nombre', { unique: false });
      }
      if (!db.objectStoreNames.contains('jobs')) {
        const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
        jobs.createIndex('clientId', 'clientId', { unique: false });
        jobs.createIndex('fecha', 'fecha', { unique: false });
      }
      if (!db.objectStoreNames.contains('caja')) {
        const caja = db.createObjectStore('caja', { keyPath: 'id' });
        caja.createIndex('fecha', 'fecha', { unique: false });
      }
    };

    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function txStore(storeName, mode) {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// ---------- CLIENTES ----------

async function getAllClients() {
  const store = await txStore('clients', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    req.onerror = () => reject(req.error);
  });
}

async function saveClient(client) {
  if (!client.id) client.id = genId();
  if (!client.creado) client.creado = new Date().toISOString();
  const store = await txStore('clients', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(client);
    req.onsuccess = () => resolve(client);
    req.onerror = () => reject(req.error);
  });
}

async function deleteClient(id) {
  const store = await txStore('clients', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function findOrCreateClientByName(nombre) {
  const all = await getAllClients();
  const existing = all.find(c => c.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (existing) return existing;
  return saveClient({ nombre: nombre.trim(), telefono: '', notas: '' });
}

async function findOrCreateClientByNameAndPhone(nombre, telefono) {
  const all = await getAllClients();
  const existing = all.find(c => c.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (existing) {
    const tel = (telefono || '').trim();
    if (tel && tel !== (existing.telefono || '').trim()) {
      existing.telefono = tel;
      await saveClient(existing);
    }
    return existing;
  }
  return saveClient({ nombre: nombre.trim(), telefono: (telefono || '').trim(), notas: '' });
}

// ---------- TRABAJOS (reparaciones) ----------

async function getAllJobs() {
  const store = await txStore('jobs', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
    req.onerror = () => reject(req.error);
  });
}

async function getJobsByClient(clientId) {
  const all = await getAllJobs();
  return all.filter(j => j.clientId === clientId);
}

async function saveJob(job) {
  if (!job.id) job.id = genId();
  if (!job.creado) job.creado = new Date().toISOString();
  if (!job.fotos) job.fotos = [];
  const store = await txStore('jobs', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(job);
    req.onsuccess = () => resolve(job);
    req.onerror = () => reject(req.error);
  });
}

async function deleteJob(id) {
  const store = await txStore('jobs', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- CAJA GENERAL (movimientos no ligados a un trabajo) ----------

async function getAllCaja() {
  const store = await txStore('caja', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
    req.onerror = () => reject(req.error);
  });
}

async function saveCajaMov(mov) {
  if (!mov.id) mov.id = genId();
  const store = await txStore('caja', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(mov);
    req.onsuccess = () => resolve(mov);
    req.onerror = () => reject(req.error);
  });
}

async function deleteCajaMov(id) {
  const store = await txStore('caja', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- EXPORTAR / IMPORTAR (para Drive y respaldo manual) ----------

async function exportAllData() {
  const clients = await getAllClients();
  const jobs = await getAllJobs();
  const caja = await getAllCaja();
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), clients, jobs, caja });
}

async function importAllData(jsonOrObj) {
  const data = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
  const db = await openDB();
  const tx = db.transaction(['clients', 'jobs', 'caja'], 'readwrite');
  const clientsStore = tx.objectStore('clients');
  const jobsStore = tx.objectStore('jobs');
  const cajaStore = tx.objectStore('caja');

  await new Promise((resolve) => { clientsStore.clear().onsuccess = resolve; });
  await new Promise((resolve) => { jobsStore.clear().onsuccess = resolve; });
  await new Promise((resolve) => { cajaStore.clear().onsuccess = resolve; });

  (data.clients || []).forEach(c => clientsStore.put(c));
  (data.jobs || []).forEach(j => jobsStore.put(j));
  (data.caja || []).forEach(m => cajaStore.put(m));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
