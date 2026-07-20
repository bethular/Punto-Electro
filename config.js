// -----------------------------------------------------------------
// Configuración de Firebase
// -----------------------------------------------------------------
// OJO: esta app carga Firebase con <script> normales (versión
// "compat", ver index.html), NO con un empaquetador tipo Webpack/Vite.
// Por eso acá NO se usa "import" ni "initializeApp()" — solo se define
// el objeto de configuración. db.js se encarga de inicializar Firebase
// con la variable global "firebase" que cargan esos <script>.
// -----------------------------------------------------------------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBDatOJokTydq5P_FLL0adqDG5FimzyHHQ",
  authDomain: "punto-electro-f3b73.firebaseapp.com",
  projectId: "punto-electro-f3b73",
  storageBucket: "punto-electro-f3b73.firebasestorage.app",
  messagingSenderId: "435564136124",
  appId: "1:435564136124:web:d961f471696291014672b9"
};

// -----------------------------------------------------------------
// Backup automático por correo (opcional) — ver README.md para los
// pasos de configuración (crear cuenta gratis en EmailJS).
// Mientras diga "PEGÁ_ACÁ..." el backup automático queda desactivado
// y el resto de la app sigue funcionando normal.
// -----------------------------------------------------------------
const EMAILJS_CONFIG = {
  publicKey: "PEGÁ_ACÁ_TU_PUBLIC_KEY",
  serviceId: "PEGÁ_ACÁ_TU_SERVICE_ID",
  templateId: "PEGÁ_ACÁ_TU_TEMPLATE_ID",
  backupEmail: "PEGÁ_ACÁ_TU_CORREO@gmail.com",
  backupIntervalDays: 7,
};
