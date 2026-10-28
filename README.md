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
├── 📄 export.js           ← Generador de sitio estático
├── 📄 scanner.js          ← Escaneo de carpetas (compartido por server.js y export.js)
├── 📄 admin.html          ← Herramienta local para armar packs (no se publica)
├── 📄 packs.json          ← Packs creados desde admin.html
├── 📄 publicar.bat        ← Export + commit + push (Windows)
│
├── 📁 banner/             ← Imágenes del banner
├── 📁 packs/              ← Imágenes propias de packs (opcional)
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

Agrega o edita carpetas de productos normalmente. El servidor cachea el listado al arrancar: si agregas una carpeta con el servidor corriendo, reinícialo o abre `http://localhost:3000/api/refresh` y recarga la página.

### 2. Armar packs

Con el servidor corriendo, abre:

```
http://localhost:3000/admin
```

Selecciona dos o más productos, pon el nombre, elige porcentaje o precio fijo y guarda. La herramienta escribe `packs.json`; no tienes que editar JSON a mano. También puedes editar o eliminar packs ya creados.

### 3. Exportar como sitio estático

```bash
node export.js
```

Genera `docs/` con:
- `index.html`, `script.js`, `styles.css`, `config.json`
- `products.json` ← productos y packs resueltos
- `productos/{slug}/index.html` ← una página SEO por producto y por pack
- `sitemap.xml`
- las carpetas de imágenes y `banner/` (y `packs/` si existe)

### 4. Subir a GitHub

```bash
git add .
git commit -m "Actualizar catálogo"
git push
```

En Windows puedes hacer las etapas 3 y 4 de una vez con **`publicar.bat`** (doble clic, o `publicar.bat "mi mensaje"`). Si no hay cambios en el contenido, omite el commit y solo hace push.

**Primera vez:** En tu repositorio de GitHub:
- Ve a **Settings → Pages**
- Source: `Deploy from a branch`
- Branch: `main` | Folder: `/docs`
- Guarda, y en ~1 min tu sitio estará en `https://pixchile.github.io/figuras/`

---

## Packs

- Un pack **no duplica productos**: guarda referencias a la carpeta de cada producto (`ref`).
- El precio se calcula como **porcentaje de descuento** (redondeado a terminar en 90) o como **precio fijo**, que debe ser menor al total normal.
- En la tienda se muestra como una tarjeta con badge “Pack”, precio anterior tachado y ahorro. Al abrirlo se ven los productos incluidos; además, cada producto suelto muestra un bloque “También en pack”.
- En el carrito entra como una sola línea con el detalle de lo incluido. Un pack formado solo por plantillas digitales no paga envío.
- Los productos sueltos siguen visibles en el catálogo.
- Si renombras o mueves un producto incluido, el pack se omite con un aviso en la consola. Para corregirlo, edítalo en `/admin`.
- La imagen del pack es la del primer producto, salvo que indiques una propia en `packs/` desde el formulario.

`admin.html` y `packs.json` son locales: no se copian a `docs/`. La carpeta `packs/`, si existe, sí se publica.

---

## Convenciones de carpetas de productos

| Prefijo | Tipo          | Precio                    | Ejemplo                    |
|---------|---------------|---------------------------|----------------------------|
| `1-`    | Kit de Armado | `precio_base × piezas`    | `1-BumblebeeB(300)/`       |
| `2-`    | Pack Color    | `precio_base × 1`         | `2-BloquesMagic(1)/`       |
| `3-`    | Plantilla     | `precio_base × piezas`    | `3-Optimus(200)/`          |

- El número entre paréntesis al final del nombre es la cantidad de piezas.
- Para **variantes de precio** (tipo 1 o 3), crea subcarpetas: `Rojo(1500)/`, `Azul-Cielo(2000)/`
- Las imágenes van directamente en la carpeta del producto.

---

## Notas

- `docs/` está en el repositorio a propósito (así lo requiere GitHub Pages).
- Nunca edites `docs/` a mano; siempre ejecuta `node export.js`.
- `script.js` detecta si corre en modo local (servidor) o estático (GitHub Pages) con el flag `window.STATIC_MODE`.
- `server.js` y `export.js` comparten la lógica de escaneo en `scanner.js`. Si cambias las convenciones de carpetas, cámbialas ahí una sola vez.
- No se escanean ni se publican: `node_modules`, `.git`, `.claude`, `.commandcode`, `docs`, `banner`, `packs`, `packs.json`, `admin.html`, `products.json` y los archivos del sitio. La lista está en `scanner.js` → `DEFAULT_IGNORE_ITEMS`.
