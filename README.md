# Catálogo de Productos

## Estructura del proyecto

```
tu-proyecto/
│
├── 📄 index.html          ← Frontend principal
├── 📄 script.js           ← Lógica del cliente (modo local + estático)
├── 📄 styles.css          ← Estilos
├── 📄 config.json         ← Precios, tipos, WhatsApp
│
├── 📄 server.js           ← Servidor local (Node.js)
├── 📄 export.js           ← Generador de sitio estático ← NUEVO
├── 📄 scanner.js          ← Escaneo de carpetas (compartido por server.js y export.js)
│
├── 📁 docs/               ← Sitio exportado para GitHub Pages ← GENERADO
│
└── 📁 [tus carpetas de productos]
    ├── 📁 1-NombreProducto(300)/   ← Tipo 1: Kit de Armado
    ├── 📁 2-NombreProducto(1)/     ← Tipo 2: Pack Color
    └── 📁 CategoriaX/
        └── 📁 3-NombreProducto(150)/  ← Tipo 3: Plantilla Digital
```

---

## Workflow completo

### 1. Trabajar localmente

```bash
node server.js
# Abre http://localhost:3000
```

Agrega/edita carpetas de productos normalmente. El servidor cachea el listado al arrancar: si agregás una carpeta con el servidor corriendo, reinicialo o abrí `http://localhost:3000/api/refresh` y recargá la página.

### 2. Exportar como sitio estático

Cuando quieras publicar:

```bash
node export.js
```

Esto genera la carpeta `docs/` con todo listo para GitHub Pages:
- `docs/index.html`
- `docs/script.js`
- `docs/styles.css`
- `docs/products.json`  ← productos escaneados
- `docs/config.json`
- `docs/[todas tus carpetas de imágenes]/`

### 3. Subir a GitHub

```bash
git add .
git commit -m "Actualizar catálogo"
git push
```

En Windows podés hacer las dos etapas (export + commit + push) de una vez con **`publicar.bat`** (doble clic, o `publicar.bat "mi mensaje"`). Si no hay cambios en el contenido, omite el commit y solo hace push.

**Primera vez:** En tu repositorio de GitHub:
- Ve a **Settings → Pages**
- Source: `Deploy from a branch`
- Branch: `main` | Folder: `/docs`
- Guarda, y en ~1 min tu sitio estará en `https://pixchile.github.io/figuras/`

---

## Convenciones de carpetas de productos

| Prefijo | Tipo          | Precio                    | Ejemplo                    |
|---------|---------------|---------------------------|----------------------------|
| `1-`    | Kit de Armado | `precio_base × piezas`    | `1-BumblebeeB(300)/`       |
| `2-`    | Pack Color    | `precio_base × 1`         | `2-BloquesMagic(1)/`       |
| `3-`    | Plantilla     | `precio_base × piezas`    | `3-Optimus(200)/`          |

- El número entre paréntesis al final del nombre = cantidad de piezas.
- Para **variantes de precio** (tipo 1 o 3), crea subcarpetas: `Rojo(1500)/`, `Azul-Cielo(2000)/`
- Las imágenes van directamente en la carpeta del producto.

---

## Notas

- `docs/` está en el repositorio a propósito (así lo requiere GitHub Pages).
- Nunca edites `docs/` a mano; siempre ejecuta `node export.js`.
- El `script.js` detecta automáticamente si está corriendo en modo local (servidor) o estático (GitHub Pages) gracias al flag `window.STATIC_MODE`.
- `server.js` y `export.js` comparten toda la lógica de escaneo en `scanner.js`. Si cambiás las convenciones de carpetas, cambialas ahí una sola vez.
- No se escanean ni se publican: `node_modules`, `.git`, `.claude`, `.commandcode`, `docs`, `banner`, `productos.json` y los archivos del sitio (`index.html`, `script.js`, `styles.css`, `config.json`, etc.). La lista está en `scanner.js` → `DEFAULT_IGNORE_ITEMS`.
#
