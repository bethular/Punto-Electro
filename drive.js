// -----------------------------------------------------------------
// Sincronización con Google Drive
// Guarda/lee un único archivo de respaldo (DRIVE_BACKUP_FILENAME)
// -----------------------------------------------------------------

let tokenClient = null;
let accessToken = null;

function isGoogleConfigured() {
  return typeof GOOGLE_CLIENT_ID === 'string' && !GOOGLE_CLIENT_ID.includes('PEGÁ_ACÁ');
}

function initGoogleClient() {
  if (!isGoogleConfigured()) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive',
    callback: (resp) => {
      if (resp.error) {
        console.error('Error de Google:', resp);
        setDriveStatus('Error al conectar. Probá de nuevo.', false);
        return;
      }
      accessToken = resp.access_token;
      setDriveStatus('Conectado a Google Drive ✓', true);
      onDriveConnected && onDriveConnected();
    },
  });
}

function connectGoogle() {
  if (!isGoogleConfigured()) {
    alert('Falta configurar el Client ID de Google en config.js (ver README.md).');
    return;
  }
  if (typeof google === 'undefined' || !google.accounts) {
    alert('Google todavía está cargando, esperá unos segundos y probá de nuevo.');
    return;
  }
  if (!tokenClient) initGoogleClient();
  tokenClient.requestAccessToken();
}

function disconnectGoogle() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  setDriveStatus('Desconectado', false);
}

async function findBackupFileId() {
  const q = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`,
    { headers: { Authorization: 'Bearer ' + accessToken } }
  );
  if (!res.ok) throw new Error('No se pudo buscar el archivo en Drive');
  const data = await res.json();
  return data.files && data.files.length ? data.files[0] : null;
}

async function saveToDrive() {
  if (!accessToken) return connectGoogle();
  setDriveStatus('Guardando en Drive...', true);
  try {
    const jsonData = await exportAllData();
    const existing = await findBackupFileId();
    const metadata = { name: DRIVE_BACKUP_FILENAME, mimeType: 'application/json' };
    const boundary = 'punto_electro_boundary_314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const body =
      delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
      delimiter + 'Content-Type: application/json\r\n\r\n' + jsonData +
      closeDelim;

    const url = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const method = existing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    });
    if (!res.ok) throw new Error('Error al subir a Drive');
    localStorage.setItem('pe_lastSyncedAt', JSON.parse(jsonData).exportedAt || new Date().toISOString());
    setDriveStatus('Guardado en Drive ✓ (' + new Date().toLocaleTimeString('es-AR') + ')', true);
  } catch (e) {
    console.error(e);
    setDriveStatus('No se pudo guardar en Drive.', false);
  }
}

async function loadFromDrive() {
  if (!accessToken) return connectGoogle();
  setDriveStatus('Buscando copia en Drive...', true);
  try {
    const existing = await findBackupFileId();
    if (!existing) {
      setDriveStatus('Todavía no hay copia guardada en Drive.', true);
      return;
    }
    if (!confirm('Esto va a REEMPLAZAR los datos de este dispositivo por la última copia guardada en Drive. ¿Continuar?')) {
      setDriveStatus('Conectado a Google Drive ✓', true);
      return;
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    if (!res.ok) throw new Error('Error al leer desde Drive');
    const json = await res.json();
    await importAllData(json);
    localStorage.setItem('pe_lastSyncedAt', json.exportedAt || new Date().toISOString());
    setDriveStatus('Datos traídos de Drive ✓ (' + new Date().toLocaleTimeString('es-AR') + ')', true);
    renderAll && renderAll();
  } catch (e) {
    console.error(e);
    setDriveStatus('No se pudo traer la copia de Drive.', false);
  }
}

async function attemptAutoSync() {
  if (!isGoogleConfigured()) return;
  if (!tokenClient) initGoogleClient();
  if (!tokenClient) return;
  try {
    const connected = await new Promise((resolve) => {
      tokenClient.callback = (resp) => {
        if (resp.error) { resolve(false); return; }
        accessToken = resp.access_token;
        resolve(true);
      };
      tokenClient.requestAccessToken({ prompt: 'none' });
    });
    if (!connected) return; // el usuario todavía no conectó su cuenta una primera vez
    setDriveStatus('Conectado a Google Drive ✓ (automático)', true);
    await silentPullIfNewer();
  } catch (e) {
    console.error('Auto-sync error:', e);
  }
}

async function silentPullIfNewer() {
  try {
    const existing = await findBackupFileId();
    if (!existing) return;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    if (!res.ok) return;
    const json = await res.json();
    const remoteTs = json.exportedAt || null;
    const localTs = localStorage.getItem('pe_lastSyncedAt');
    if (remoteTs && (!localTs || new Date(remoteTs) > new Date(localTs))) {
      await importAllData(json);
      localStorage.setItem('pe_lastSyncedAt', remoteTs);
      setDriveStatus('Datos actualizados automáticamente desde Drive ✓', true);
      await renderAll(true);
    }
  } catch (e) {
    console.error('Silent pull error:', e);
  }
}

function setDriveStatus(text, ok) {
  const el = document.getElementById('driveStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--teal)' : 'var(--danger)';
}
