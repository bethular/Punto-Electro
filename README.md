# Punto Electro — Registro de Reparaciones

App offline (PWA) para llevar el registro de reparaciones, clientes,
ingresos y gastos. Se sincroniza sola entre todos los dispositivos que
abran la app, sin login y sin botones — usando Firebase.

---

## Paso 1 — Subir la app a GitHub Pages

(Si ya hiciste este paso antes, salteálo y andá directo al Paso 2 —
solo hace falta configurarlo una vez.)

1. Creá una cuenta en https://github.com si no tenés.
2. Creá un repositorio nuevo, público, y subí todos los archivos de
   esta carpeta (Add file → Upload files, arrastrás todo).
3. Settings → Pages → Branch: `main`, carpeta `/ (root)` → Save.
4. Esperá 1-2 minutos. Tu URL va a ser algo como:
   `https://TU_USUARIO.github.io/TU_REPO/`

---

## Paso 2 — Crear el proyecto de Firebase (una sola vez)

1. Entrá a https://console.firebase.google.com con tu cuenta de Google.
2. **"Crear un proyecto"** (o "Agregar proyecto"). Nombre: `Punto Electro`.
   Podés desactivar Google Analytics si te lo pregunta (no lo necesitamos).
3. Creá el proyecto y esperá a que termine.

### Activar la base de datos (Firestore)

1. En el menú de la izquierda: **Compilación → Firestore Database**.
2. **"Crear base de datos"**.
3. Elegí **"Iniciar en modo de prueba"** (test mode) — después ajustamos
   los permisos en el Paso 4.
4. Elegí la ubicación del servidor (cualquiera de Sudamérica, ej.
   `southamerica-east1`) y confirmá.

### Activar el inicio de sesión anónimo

1. Menú de la izquierda: **Compilación → Authentication**.
2. **"Comenzar"** (Get started).
3. En la lista de proveedores, buscá **"Anónimo"** (Anonymous) → activalo
   → Guardar.

### Obtener la configuración para pegar en la app

1. Tocá el ícono de **engranaje ⚙️** (arriba a la izquierda) →
   **"Configuración del proyecto"**.
2. Bajá hasta **"Tus apps"** → tocá el ícono **`</>`** (Web).
3. Ponele un apodo (ej: "Punto Electro Web") → **"Registrar app"**.
4. Te va a mostrar un bloque de código con `const firebaseConfig = {...}`
   — copiá esos valores (apiKey, authDomain, projectId, etc.).

---

## Paso 3 — Pegar la configuración en la app

1. En GitHub, abrí el archivo `config.js` → lápiz ✏️ para editar.
2. Reemplazá cada valor `"PEGÁ_ACÁ..."` por el que te dio Firebase.
   Tiene que quedar algo así (con tus valores reales):
   ```js
   const FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "punto-electro-xxxxx.firebaseapp.com",
     projectId: "punto-electro-xxxxx",
     storageBucket: "punto-electro-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
3. Guardá ("Commit changes").

---

## Paso 4 — Ajustar los permisos de la base de datos (importante)

Por defecto, el "modo de prueba" de Firestore deja de funcionar solo
a los 30 días. Vamos a poner un permiso permanente y seguro:

1. En Firebase, andá a **Firestore Database → Reglas** (Rules).
2. Reemplazá todo el contenido por esto:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **"Publicar"**.

Esto significa: cualquiera que abra la app (que se conecta sola y de
forma anónima) puede leer y escribir los datos — no hace falta que
sepan ni vean ninguna contraseña. La seguridad depende de que la
dirección de tu app no esté publicada en ningún lado público (no la
compartas fuera de tu equipo de trabajo).

---

## Cómo compartir la app con colegas

Simplemente pasales el link de la app (`https://TU_USUARIO.github.io/TU_REPO/`).
La primera vez que la abran, se conectan solos (sin login) y ya
comparten los mismos datos que vos — sin ningún paso extra.

---

## Respaldo manual (por las dudas)

En la pestaña **Sincronizar** hay botones para descargar un archivo
`.json` con todos los datos, y para cargar uno — sirve como copia de
seguridad extra, aunque con Firebase ya no es imprescindible (los
datos quedan guardados en la nube todo el tiempo).

---

## Preguntas frecuentes

**¿Necesito pagar algo?**
No. El plan gratuito de Firebase ("Spark") alcanza de sobra para un
negocio como este — miles de operaciones gratis por día.

**¿Puedo cambiar el nombre o los colores de la app?**
Sí — decile a Claude qué querés cambiar y te edita los archivos.
