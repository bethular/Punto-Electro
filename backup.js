// -----------------------------------------------------------------
// Backup automático por correo (programable)
// -----------------------------------------------------------------
// Usa EmailJS (servicio gratuito) para mandar, cada tanto, un resumen
// de todos los datos a la casilla de correo que configures en
// config.js — sin que nadie tenga que apretar ningún botón.
//
// Cómo decide "cuándo toca": guarda la fecha del último envío en la
// base de datos compartida (Firestore), así no importa qué celular
// abra la app primero — solo se manda un correo por período,
// aunque uses la app desde varios dispositivos.
//
// Ver el README para los pasos de configuración (crear cuenta en
// EmailJS y pegar los datos en config.js).
// -----------------------------------------------------------------

function isEmailBackupConfigured() {
  return typeof EMAILJS_CONFIG !== 'undefined' &&
    EMAILJS_CONFIG.publicKey && !EMAILJS_CONFIG.publicKey.includes('PEGÁ_ACÁ') &&
    EMAILJS_CONFIG.serviceId && !EMAILJS_CONFIG.serviceId.includes('PEGÁ_ACÁ') &&
    EMAILJS_CONFIG.templateId && !EMAILJS_CONFIG.templateId.includes('PEGÁ_ACÁ') &&
    EMAILJS_CONFIG.backupEmail && !EMAILJS_CONFIG.backupEmail.includes('PEGÁ_ACÁ');
}

function setBackupStatus(text) {
  const el = document.getElementById('backupStatus');
  if (el) el.textContent = text;
}

async function checkAndSendBackup() {
  if (!isEmailBackupConfigured()) {
    setBackupStatus('Backup por correo: no configurado todavía (ver README.md).');
    return;
  }
  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
  }

  const intervalDays = EMAILJS_CONFIG.backupIntervalDays || 7;

  try {
    const db = firestore();
    const ref = db.collection('meta').doc('backup');
    const snap = await ref.get();
    const last = snap.exists ? snap.data().lastBackupAt : null;
    const ahora = new Date();

    if (last) {
      const diasPasados = (ahora - new Date(last)) / (1000 * 60 * 60 * 24);
      if (diasPasados < intervalDays) {
        setBackupStatus('Backup por correo: al día (último envío ' + new Date(last).toLocaleDateString('es-AR') + ').');
        return;
      }
    }

    // Se marca ANTES de mandar, para que si dos dispositivos abren la
    // app casi al mismo tiempo, no se manden dos correos duplicados.
    await ref.set({ lastBackupAt: ahora.toISOString() }, { merge: true });

    await enviarBackupPorCorreo();
    setBackupStatus('Backup por correo: enviado recién (' + ahora.toLocaleDateString('es-AR') + ').');
  } catch (e) {
    console.error('Error en backup automático por correo:', e);
    setBackupStatus('Backup por correo: hubo un error al enviarlo.');
  }
}

async function enviarBackupPorCorreo() {
  const json = await exportAllData();
  const data = JSON.parse(json);

  // Se sacan las fotos del correo (son base64 y pueden ser muy pesadas
  // para un email) — solo se manda un aviso de cuántas tiene cada
  // trabajo. Las fotos siguen a salvo en Firebase y en el respaldo
  // manual (.json) de la pestaña Sincronizar.
  const dataLiviana = {
    ...data,
    jobs: (data.jobs || []).map(j => ({
      ...j,
      fotos: (j.fotos || []).length ? [`(${j.fotos.length} foto(s) — no incluidas en el correo por tamaño)`] : [],
    })),
  };

  const resumen =
    `Clientes: ${data.clients.length}\n` +
    `Trabajos: ${data.jobs.length}\n` +
    `Movimientos de caja: ${data.caja.length}\n` +
    `Generado: ${new Date().toLocaleString('es-AR')}`;

  await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
    to_email: EMAILJS_CONFIG.backupEmail,
    resumen: resumen,
    backup_json: JSON.stringify(dataLiviana, null, 2),
  });
}
