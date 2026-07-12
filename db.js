// -----------------------------------------------------------------
// Sincronización con Firebase (Firestore) — reemplaza el uso directo
// de IndexedDB. Mantiene EXACTAMENTE las mismas funciones que usaba
// el resto de la app, así que app.js no necesita casi ningún cambio.
//
// Cómo funciona: cada dispositivo se conecta solo (sin login visible,
// autenticación anónima de Firebase), y queda escuchando cambios en
// tiempo real — cuando vos cargás algo en un celu, se refleja en los
// demás dispositivos en segundos, sin botones de "sincronizar".
// Firestore además cachea todo localmente, así que funciona offline
// y sincroniza solo cuando vuelve la conexión.
// -----------------------------------------------------------------

let _clients = [];
let _jobs = [];
let _caja = [];
let _onChangeCallback = null;
let _firestoreReady = false;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isFirebaseConfigured() {
  return typeof FIREBASE_CONFIG !== 'undefined' &&
    FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes('PEGÁ_ACÁ');
}

function setOnChangeCallback(cb) {
  _onChangeCallback = cb;
}

async function initFirestoreSync() {
  if (!isFirebaseConfigured()) {
    console.warn('Firebase no está configurado todavía (ver config.js).');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.firestore();
    try {
      await db.enablePersistence({ synchronizeTabs: true });
    } catch (e) {
      console.warn('Persistencia offline no disponible en este navegador:', e.code);
    }
    await firebase.auth().signInAnonymously();

    db.collection('clients').onSnapshot((snap) => {
      _clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      _firestoreReady = true;
      if (_onChangeCallback) _onChangeCallback();
    });
    db.collection('jobs').onSnapshot((snap) => {
      _jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (_onChangeCallback) _onChangeCallback();
    });
    db.collection('caja').onSnapshot((snap) => {
      _caja = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (_onChangeCallback) _onChangeCallback();
    });
  } catch (e) {
    console.error('Error iniciando Firebase:', e);
  }
}

function firestore() {
  return firebase.firestore();
}

// ---------- CLIENTES ----------

async function getAllClients() {
  return [..._clients].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

async function saveClient(client) {
  if (!client.id) client.id = genId();
  if (!client.creado) client.creado = new Date().toISOString();
  await firestore().collection('clients').doc(client.id).set(client);
  return client;
}

async function deleteClient(id) {
  await firestore().collection('clients').doc(id).delete();
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
  return [..._jobs].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

async function getJobsByClient(clientId) {
  const all = await getAllJobs();
  return all.filter(j => j.clientId === clientId);
}

async function saveJob(job) {
  if (!job.id) job.id = genId();
  if (!job.creado) job.creado = new Date().toISOString();
  if (!job.movimientos) job.movimientos = [];
  await firestore().collection('jobs').doc(job.id).set(job);
  return job;
}

async function deleteJob(id) {
  await firestore().collection('jobs').doc(id).delete();
}

// ---------- CAJA GENERAL ----------

async function getAllCaja() {
  return [..._caja].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

async function saveCajaMov(mov) {
  if (!mov.id) mov.id = genId();
  await firestore().collection('caja').doc(mov.id).set(mov);
  return mov;
}

async function deleteCajaMov(id) {
  await firestore().collection('caja').doc(id).delete();
}

// ---------- EXPORTAR / IMPORTAR (respaldo manual) ----------

async function exportAllData() {
  return JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    clients: _clients,
    jobs: _jobs,
    caja: _caja,
  });
}

async function importAllData(jsonOrObj) {
  const data = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
  const db = firestore();
  const batch = db.batch();

  // Borra lo que hay actualmente en las 3 colecciones
  const [clientsSnap, jobsSnap, cajaSnap] = await Promise.all([
    db.collection('clients').get(),
    db.collection('jobs').get(),
    db.collection('caja').get(),
  ]);
  clientsSnap.docs.forEach(d => batch.delete(d.ref));
  jobsSnap.docs.forEach(d => batch.delete(d.ref));
  cajaSnap.docs.forEach(d => batch.delete(d.ref));

  // Carga lo nuevo
  (data.clients || []).forEach(c => batch.set(db.collection('clients').doc(c.id || genId()), c));
  (data.jobs || []).forEach(j => batch.set(db.collection('jobs').doc(j.id || genId()), j));
  (data.caja || []).forEach(m => batch.set(db.collection('caja').doc(m.id || genId()), m));

  await batch.commit();
}
