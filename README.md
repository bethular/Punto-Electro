# Punto Electro — Registro de Reparaciones

App offline (PWA) para llevar el registro de reparaciones, clientes,
ingresos y gastos, con respaldo/sincronización en Google Drive.

Funciona sin internet (los datos quedan guardados en el celular) y
cuando volvés a tener conexión podés mandar la copia a tu Google Drive
con un botón.

---

## Paso 1 — Subir la app a GitHub Pages (gratis)

1. Creá una cuenta en https://github.com si no tenés.
2. Creá un repositorio nuevo (botón verde "New"), por ejemplo
   `punto-electro-app`. Marcalo como **Público**.
3. Subí TODOS los archivos de esta carpeta al repositorio
   (botón "Add file" → "Upload files", arrastrás todo).
4. Andá a **Settings → Pages** (menú de la izquierda) del repositorio.
5. En "Branch" elegí `main` y carpeta `/ (root)`, guardá.
6. Esperá 1-2 minutos. Te va a quedar una URL como:
   `https://TU_USUARIO.github.io/punto-electro-app/`

Esa es la dirección que vas a compartir con tus colegas y que vas a
usar en el celular (Chrome → menú → "Agregar a pantalla de inicio",
para que quede instalada como una app).

**Importante:** anotá esta URL exacta, la vas a necesitar en el paso 2.

---

## Paso 2 — Crear las credenciales de Google (una sola vez)

1. Entrá a https://console.cloud.google.com con tu cuenta de Google.
2. Arriba a la izquierda, "Seleccionar proyecto" → "Proyecto nuevo".
   Ponele un nombre, por ejemplo `Punto Electro`. Creá.
3. Con el proyecto ya seleccionado, andá al buscador de arriba y escribí
   **"Google Drive API"** → entrá y tocá **Habilitar**.
4. Andá a **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo** → Crear.
   - Nombre de la app: `Punto Electro`. Tu email en los campos de contacto.
   - Guardá y avanzá (podés dejar el resto de los campos vacíos).
   - En la sección **"Usuarios de prueba"**, agregá tu propio email de
     Google y el de cada colega que vaya a usar la app (hasta 100).
     **Esto es obligatorio** — sin agregar el email de un colega ahí,
     Google no lo va a dejar entrar.
5. Andá a **APIs y servicios → Credenciales → Crear credenciales →
   ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - En "Orígenes de JavaScript autorizados" agregá la URL del Paso 1
     SIN la barra final, por ejemplo:
     `https://TU_USUARIO.github.io`
   - Creá. Te va a mostrar un **Client ID** (termina en
     `.apps.googleusercontent.com`). Copialo.

---

## Paso 3 — Pegar el Client ID en la app

1. Abrí el archivo `config.js` (lo podés editar directo en GitHub,
   tocando el lápiz ✏️ arriba a la derecha del archivo).
2. Reemplazá `PEGÁ_ACÁ_TU_CLIENT_ID...` por el Client ID que copiaste.
3. Guardá los cambios ("Commit changes").
4. Esperá un minuto y recargá la app en el celu — ya debería andar el
   botón "Conectar con Google" en la pestaña **Sincronizar**.

---

## Cómo compartir los datos con colegas

1. Vos cargás algunos trabajos y tocás **"Guardar en Drive"** una vez
   (esto crea el archivo `punto-electro-backup.json` en tu Drive).
2. Entrá a https://drive.google.com, buscá ese archivo, click derecho
   → **Compartir**, y dale acceso de **Editor** al email de cada colega
   (el mismo que agregaste como "usuario de prueba" en el Paso 2).
3. Tu colega abre la app, va a **Sincronizar → Conectar con Google**,
   y toca **"Traer de Drive"** para bajar los datos existentes.
4. **Recomendación para evitar conflictos:** antes de empezar a cargar
   trabajos, cada uno toca "Traer de Drive"; al terminar, toca
   "Guardar en Drive". Si dos personas cargan al mismo tiempo sin
   sincronizar antes, el último que guarda pisa los datos del otro.

---

## Respaldo manual (sin Google)

En la pestaña **Sincronizar** también hay botones para descargar un
archivo `.json` con todos los datos, y para cargar uno — sirve como
respaldo extra o para pasar datos entre dispositivos sin depender de
Drive.

---

## Preguntas frecuentes

**Me aparece un cartel de "Google no verificó esta app"**
Es normal en apps chicas de uso interno. Tocá "Configuración avanzada"
→ "Ir a Punto Electro (no seguro)". Solo pasa la primera vez.

**¿Necesito pagar algo?**
No. GitHub Pages y Google Cloud (dentro de estos límites) son gratis.

**¿Puedo cambiar el nombre o los colores de la app?**
Sí — decile a Claude qué querés cambiar y te edita los archivos.
