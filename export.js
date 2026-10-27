// ============================================================================
// export.js — Generador de sitio estático para GitHub Pages
// ============================================================================
// Uso: node export.js
// Resultado: carpeta docs/ lista para subir a GitHub Pages
//
// Genera docs/productos/{slug}/index.html por cada producto,
// con datos embebidos y meta tags / schema markup propios.
//
// El escaneo de productos vive en scanner.js (compartido con server.js).
// ============================================================================

const fs   = require('fs');
const path = require('path');
const { scanProducts, DEFAULT_IGNORE_ITEMS } = require('./scanner');

const ROOT     = __dirname;
const OUT_DIR  = path.join(ROOT, 'docs');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const IGNORE_ITEMS = DEFAULT_IGNORE_ITEMS;

// ─── CONFIG ─────────────────────────────────────────────────────────────────

let config = { tipos: {} };
try {
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (e) {
    console.warn('⚠️  No se pudo leer config.json');
}

// ─── COPY HELPERS ────────────────────────────────────────────────────────────

function copyFileSync(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ─── SEO: GENERACIÓN DE PÁGINAS POR PRODUCTO ─────────────────────────────────

/**
 * Convierte un nombre de producto en un slug URL-amigable.
 * Ej: "Silla Gamer Pro - Azul" → "silla-gamer-pro-azul"
 */
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')                        // descomponer acentos
        .replace(/[\u0300-\u036f]/g, '')         // eliminar marcas diacríticas
        .replace(/[^a-z0-9\s-]/g, '')            // solo letras, números, espacios y guiones
        .trim()
        .replace(/\s+/g, '-')                    // espacios → guiones
        .replace(/-+/g, '-');                    // colapsar guiones dobles
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Genera el HTML completo para una página de producto individual.
 * Los datos del producto se embeben en un <script> para que la página
 * sea completamente autónoma y rastreable por Google.
 *
 * La ruta es siempre docs/productos/{slug}/, por eso las rutas relativas
 * suben dos niveles con "../../".
 */
function generateProductHTML(product, options) {
    const siteTitle = options.siteTitle;
    const siteUrl   = options.siteUrl;
    const currency  = options.currency;

    const title        = `${product.name} | ${siteTitle}`;
    const description  = (product.description || product.name).slice(0, 160);
    const productUrl   = `${siteUrl}/productos/${product.slug}/`;

    // Ajustar rutas de imágenes al nivel actual (../../)
    const adjustPath  = p => p ? `../../${encodeURI(p)}` : '';
    const absoluteUrl = p => p ? `${siteUrl}/${encodeURI(p)}` : '';

    const images      = (product.images || []).map(adjustPath);
    const mainImage   = absoluteUrl(product.mainImage);
    const specsHTML   = (product.specs || [])
        .map(s => `<li>${escapeHtml(s)}</li>`)
        .join('\n            ');

    // Schema.org Product para rich results en Google
    const schema = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        description: product.description || product.name,
        image: (product.images || []).map(absoluteUrl),
        category: product.category,
        offers: {
            '@type': 'Offer',
            priceCurrency: currency,
            price: product.price,
            availability: 'https://schema.org/InStock'
        }
    };

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(productUrl)}" />

  <!-- Open Graph (WhatsApp, Facebook, etc.) -->
  <meta property="og:title"       content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type"        content="product" />
  <meta property="og:url"         content="${escapeHtml(productUrl)}" />
  ${mainImage ? `<meta property="og:image" content="${escapeHtml(mainImage)}" />` : ''}

  <!-- Schema.org structured data (Google rich results) -->
  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>

  <style>
    /* Pantalla de carga mientras se redirige */
    body { margin: 0; font-family: sans-serif; background: #fff; }
    .seo-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh; gap: 1rem; color: #555;
    }
    .seo-loading__spinner {
      width: 40px; height: 40px; border: 3px solid #eee;
      border-top-color: #555; border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Contenido SEO: oculto visualmente pero legible para Google */
    .seo-content { display: none; }
  </style>
</head>
<body>

  <!-- Lo que ve el visitante humano: spinner mientras se carga el catálogo -->
  <div class="seo-loading" aria-hidden="true">
    <div class="seo-loading__spinner"></div>
    <p>Cargando producto…</p>
  </div>

  <!-- Lo que lee Google: contenido completo del producto en el DOM -->
  <div class="seo-content">
    <h1>${escapeHtml(product.name)}</h1>
    <p>${escapeHtml(product.category || 'General')} · ${escapeHtml(product.typeName || '')}</p>
    <p>$${product.price.toLocaleString('es-CL')}</p>
    <p>${escapeHtml(product.description || '')}</p>
    ${specsHTML ? `<ul>${specsHTML}</ul>` : ''}
    ${product.extraDescription ? `<section><h2>Información adicional</h2><p>${escapeHtml(product.extraDescription)}</p></section>` : ''}
    <div>${images.map(img => `<img src="${img}" alt="${escapeHtml(product.name)}">`).join('')}</div>
  </div>

  <script>
    // Redirigir al catálogo y abrir el modal del producto automáticamente.
    // La página del catálogo leerá ?producto= y abrirá el modal correspondiente.
    (function () {
      var slug = ${JSON.stringify(product.slug)};
      var base = '../../';
      window.location.replace(base + '?producto=' + encodeURIComponent(slug));
    })();
  </script>

</body>
</html>`;
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────

function main() {
    console.log('\n🚀 Iniciando exportación estática...\n');

    // 1. Limpiar y recrear docs/
    if (fs.existsSync(OUT_DIR)) {
        fs.rmSync(OUT_DIR, { recursive: true, force: true });
        console.log('🗑️  docs/ anterior eliminada.');
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 2. Escanear productos
    console.log('📦 Escaneando productos...');
    const products = scanProducts(ROOT, config, IGNORE_ITEMS);
    console.log(`   ✅ ${products.length} producto(s) encontrados.\n`);

    // 3. Normalizar rutas de imágenes a relativas (sin / inicial)
    // GitHub Pages sirve desde /tu-repo/, no desde /, así que rutas absolutas no funcionan
    const fixPath = p => (p ? p.replace(/^\/+/, '') : p);
    products.forEach(product => {
        product.images      = (product.images      || []).map(fixPath);
        product.mainImage   =  fixPath(product.mainImage);
        product.allVariants = (product.allVariants  || []).map(fixPath);
        if (product.variantImage) product.variantImage = fixPath(product.variantImage);
        if (product.glbFile)      product.glbFile      = fixPath(product.glbFile);
    });

    // 3b. Escribir products.json y config.json en docs/
    fs.writeFileSync(path.join(OUT_DIR, 'products.json'), JSON.stringify(products, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'config.json'),   JSON.stringify(config,   null, 2), 'utf8');
    console.log('📄 products.json y config.json generados.');

    // 4. Copiar styles.css
    copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT_DIR, 'styles.css'));

    // 5. Copiar script.js y banner.js
    copyFileSync(path.join(ROOT, 'script.js'),  path.join(OUT_DIR, 'script.js'));
    copyFileSync(path.join(ROOT, 'banner.js'),  path.join(OUT_DIR, 'banner.js'));
    console.log('📄 script.js y banner.js copiados.');

    // 6. Copiar index.html asegurando que window.STATIC_MODE esté presente
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    if (!html.includes('window.STATIC_MODE')) {
        html = html.replace(
            '<script src="./banner.js"></script>',
            '<script>window.STATIC_MODE = true;</script>\n    <script src="./banner.js"></script>'
        );
    }
    html = html.replace('href="styles.css"', 'href="./styles.css"');
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
    console.log('📄 index.html copiado (modo estático activado).');

    // 7. Copiar carpetas de productos (imágenes)
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico']);
    let copiedFolders = 0;
    let copiedImages  = 0;

    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (IGNORE_ITEMS.includes(entry.name) || !entry.isDirectory()) continue;
        const src  = path.join(ROOT, entry.name);
        const dest = path.join(OUT_DIR, entry.name);
        copyDirSync(src, dest);
        copiedFolders++;

        const countImages = (dir) => {
            if (!fs.existsSync(dir)) return 0;
            let count = 0;
            for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
                if (f.isDirectory()) count += countImages(path.join(dir, f.name));
                else if (imageExts.has(path.extname(f.name).toLowerCase())) count++;
            }
            return count;
        };
        copiedImages += countImages(src);
    }
    console.log(`🖼️  ${copiedFolders} carpeta(s) copiada(s) con ${copiedImages} imagen(es).\n`);

    // 8b. Copiar carpeta banner/ y archivos sueltos de imagen en la raíz
    const bannerSrc = path.join(ROOT, 'banner');
    if (fs.existsSync(bannerSrc)) {
        copyDirSync(bannerSrc, path.join(OUT_DIR, 'banner'));
        console.log('🖼️  Carpeta banner/ copiada.');
    } else {
        console.warn('⚠️  No se encontró la carpeta banner/ — el banner no tendrá imágenes.');
    }

    const rootImageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico']);
    const rootIgnore    = new Set(IGNORE_ITEMS);
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (entry.isDirectory() || rootIgnore.has(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (rootImageExts.has(ext)) {
            const src  = path.join(ROOT, entry.name);
            const dest = path.join(OUT_DIR, entry.name);
            fs.copyFileSync(src, dest);
            console.log(`🖼️  Archivo raíz copiado: ${entry.name}`);
        }
    }

    // ── Generar páginas HTML individuales por producto (SEO) ─────────────────
    console.log('\n🔍 Generando páginas individuales de producto (SEO)...');

    const siteTitle = config.titulo || config.nombre || config.siteTitle || 'Mi Tienda';
    const siteUrl   = (config.siteUrl || 'https://pixchile.github.io/figuras').replace(/\/+$/, '');
    const currency  = config.moneda || 'CLP';

    // Rastrear slugs para detectar duplicados
    const usedSlugs = new Map();

    const productosDir = path.join(OUT_DIR, 'productos');
    fs.mkdirSync(productosDir, { recursive: true });

    for (const product of products) {
        let slug = slugify(product.name);

        // Resolver duplicados agregando un sufijo numérico
        if (usedSlugs.has(slug)) {
            const count = usedSlugs.get(slug) + 1;
            usedSlugs.set(slug, count);
            slug = `${slug}-${count}`;
        } else {
            usedSlugs.set(slug, 1);
        }

        // Guardar el slug en el producto para que products.json lo incluya
        product.slug = slug;

        const pageDir = path.join(productosDir, slug);
        fs.mkdirSync(pageDir, { recursive: true });
        fs.writeFileSync(
            path.join(pageDir, 'index.html'),
            generateProductHTML(product, { siteTitle, siteUrl, currency }),
            'utf8'
        );
    }

    // Reescribir products.json con los slugs añadidos
    fs.writeFileSync(path.join(OUT_DIR, 'products.json'), JSON.stringify(products, null, 2), 'utf8');

    console.log(`   ✅ ${products.length} página(s) generadas en docs/productos/\n`);

    // Generar sitemap.xml
    const today = new Date().toISOString().split('T')[0];

    const sitemapEntries = [
        `  <url><loc>${siteUrl}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
        ...products.map(p =>
            `  <url><loc>${siteUrl}/productos/${p.slug}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
        )
    ].join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;

    fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap, 'utf8');
    console.log('🗺️  sitemap.xml generado.');

    // 8. Resumen
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  ✅ Exportación completada                         ║');
    console.log('║                                                   ║');
    console.log('║  Archivos generados en: docs/                     ║');
    console.log('║  Páginas de producto:   docs/productos/           ║');
    console.log('║  Sitemap:               docs/sitemap.xml          ║');
    console.log('║                                                   ║');
    console.log('║  Próximos pasos:                                  ║');
    console.log('║  1. git add docs/                                 ║');
    console.log('║  2. git commit -m "Exportar sitio estático"       ║');
    console.log('║  3. git push                                      ║');
    console.log('║                                                   ║');
    console.log('║  En GitHub → Settings → Pages:                   ║');
    console.log('║  Source: "Deploy from a branch"                  ║');
    console.log('║  Branch: main / docs                             ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
}

main();
