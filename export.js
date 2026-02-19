// ============================================================================
// export.js — Generador de sitio estático para GitHub Pages
// ============================================================================
// Uso: node export.js
// Resultado: carpeta docs/ lista para subir a GitHub Pages
// ============================================================================

const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const OUT_DIR  = path.join(ROOT, 'docs');

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const CONFIG_FILE   = path.join(ROOT, 'config.json');
const IGNORE_ITEMS  = [
    'node_modules', '.git', '.vscode', '.idea',
    'package.json', 'package-lock.json',
    'server.js', 'export.js',
    'script.js', 'styles.css', 'config.json', 'index.html',
    'README.md', 'LICENSE', 'docs', '.gitignore'
];

let config = { tipos: {} };
try {
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (e) {
    console.warn('⚠️  No se pudo leer config.json');
}

// ─── HELPERS (lógica idéntica a server.js) ──────────────────────────────────

function isProductFolder(name)  { return /^[123]/.test(name); }
function isVariableFolder(name) { return !/^[123]/.test(name) && /\(\d+\)$/.test(name); }
function shouldIgnore(name)     { return IGNORE_ITEMS.includes(name); }
function getProductType(name)   { const m = name.match(/^([123])/); return m ? m[1] : '1'; }

function parseProductName(folderName) {
    let name = folderName.replace(/^[123][-]?/, '');
    const m  = name.match(/\((\d+)\)$/);
    let multiplier = 1;
    if (m) { multiplier = parseInt(m[1], 10) || 1; name = name.replace(/\(\d+\)$/, '').trim(); }
    return { displayName: name.replace(/-/g, ' '), multiplier };
}

function parseVariableInfo(folderName) {
    const m = folderName.match(/^(.+)\((\d+)\)$/);
    if (m) return { name: m[1].replace(/-/g, ' ').trim(), customPrice: parseInt(m[2], 10) || 0 };
    return { name: folderName.replace(/-/g, ' ').trim(), customPrice: null };
}

function calculateBuildHours(pieces) { return Math.round(pieces / 300); }

function roundTo90(price) {
    if (price % 10 === 0 && Math.floor(price / 10) % 10 === 9) return price;
    if (price < 90) return 90;
    let next = Math.ceil(price / 10) * 10;
    next = next % 100 === 0 ? next + 90 : Math.floor(next / 100) * 100 + 90;
    return next;
}

function processTemplate(tpl, name, category, pcs, hours) {
    return tpl
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{category\}\}/g, category)
        .replace(/\{\{pcs\}\}/g, pcs)
        .replace(/\{\{hours\}\}/g, hours);
}

function getProductImages(productPath, relPath) {
    if (!fs.existsSync(productPath)) return [];
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    return fs.readdirSync(productPath)
        .filter(f => exts.includes(path.extname(f).toLowerCase()))
        .map(f => (relPath.startsWith('/') ? relPath : '/' + relPath) + '/' + f);
}

function getProductInfo(productPath, folderName, category, customPrice = null, variableName = null) {
    const type        = getProductType(folderName);
    const parsed      = parseProductName(folderName);
    let displayName   = parsed.displayName;
    const multiplier  = parsed.multiplier;
    const buildHours  = calculateBuildHours(multiplier);
    const typeCfg     = config.tipos[type] || { nombre: 'Producto', descripcion: '{{name}}', precio: 0, specs: [] };

    if (variableName) displayName = `${displayName} - ${variableName}`;

    const description = processTemplate(typeCfg.descripcion || '', displayName, category, multiplier, buildHours);
    const specs       = (typeCfg.specs || []).map(s => processTemplate(s, displayName, category, multiplier, buildHours));

    let price = customPrice !== null ? customPrice : (typeCfg.precio || 0) * multiplier;
    if (type === '1') price = roundTo90(price);

    return { name: displayName, type, typeName: typeCfg.nombre, description, price, specs, pieces: multiplier, buildHours };
}

// ─── SCANNER (lógica idéntica a server.js) ──────────────────────────────────

function scanDirectory(dirPath, currentCategory, products, relativeBase) {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath    = path.join(dirPath, entry.name);
        const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

        if (isProductFolder(entry.name)) {
            const productType = getProductType(entry.name);
            const images      = getProductImages(fullPath, relativePath);

            if (productType === '2') {
                const productInfo = getProductInfo(fullPath, entry.name, currentCategory);
                const parsed      = parseProductName(entry.name);
                if (images.length > 0) {
                    const variantId = `${entry.name}-0`.replace(/[^a-zA-Z0-9-]/g, '');
                    products.push({
                        id: variantId, name: parsed.displayName, type: '2',
                        typeName: productInfo.typeName, category: currentCategory || 'General',
                        price: productInfo.price, description: productInfo.description,
                        specs: productInfo.specs, pieces: parsed.multiplier, buildHours: productInfo.buildHours,
                        images: [images[0]], mainImage: images[0],
                        isVariable: true, variableName: 'Standard', customPrice: null,
                        parentProduct: entry.name, allVariants: images, totalVariants: images.length
                    });
                }
            } else {
                const productInfo   = getProductInfo(fullPath, entry.name, currentCategory);
                const subEntries    = fs.readdirSync(fullPath, { withFileTypes: true });
                const variableFolders = subEntries.filter(e => e.isDirectory() && isVariableFolder(e.name));

                if (variableFolders.length > 0) {
                    for (const varEntry of variableFolders) {
                        const varFullPath     = path.join(fullPath, varEntry.name);
                        const varRelativePath = `${relativePath}/${varEntry.name}`;
                        const varInfo         = parseVariableInfo(varEntry.name);
                        const varProductInfo  = getProductInfo(varFullPath, entry.name, currentCategory, varInfo.customPrice, varInfo.name);
                        const varImages       = getProductImages(varFullPath, varRelativePath);
                        products.push({
                            id: `${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                            name: varProductInfo.name, type: varProductInfo.type,
                            typeName: varProductInfo.typeName, category: currentCategory || 'General',
                            price: varProductInfo.price, description: varProductInfo.description,
                            specs: varProductInfo.specs, pieces: varProductInfo.pieces, buildHours: varProductInfo.buildHours,
                            images: varImages, mainImage: varImages[0] || null,
                            isVariable: true, variableName: varInfo.name, customPrice: varInfo.customPrice,
                            parentProduct: entry.name
                        });
                    }
                } else {
                    products.push({
                        id: `${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                        name: productInfo.name, type: productInfo.type,
                        typeName: productInfo.typeName, category: currentCategory || 'General',
                        price: productInfo.price, description: productInfo.description,
                        specs: productInfo.specs, pieces: productInfo.pieces, buildHours: productInfo.buildHours,
                        images, mainImage: images[0] || null,
                        isVariable: false, variableName: null, customPrice: null
                    });
                }
            }
        } else {
            const newCategory = currentCategory ? `${currentCategory} / ${entry.name}` : entry.name;
            scanDirectory(fullPath, newCategory, products, relativePath);
        }
    }
}

function scanRootDirectory(rootPath) {
    const products = [];
    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
        if (shouldIgnore(entry.name) || !entry.isDirectory()) continue;
        const fullPath = path.join(rootPath, entry.name);

        if (isProductFolder(entry.name)) {
            const productType = getProductType(entry.name);
            const images      = getProductImages(fullPath, entry.name);

            if (productType === '2') {
                const productInfo = getProductInfo(fullPath, entry.name, 'General');
                const parsed      = parseProductName(entry.name);
                if (images.length > 0) {
                    const variantId = `${entry.name}-0`.replace(/[^a-zA-Z0-9-]/g, '');
                    products.push({
                        id: variantId, name: parsed.displayName, type: '2',
                        typeName: productInfo.typeName, category: 'General',
                        price: productInfo.price, description: productInfo.description,
                        specs: productInfo.specs, pieces: parsed.multiplier, buildHours: productInfo.buildHours,
                        images: [images[0]], mainImage: images[0],
                        isVariable: true, variableName: 'Standard', customPrice: null,
                        parentProduct: entry.name, allVariants: images, totalVariants: images.length
                    });
                }
            } else {
                const productInfo     = getProductInfo(fullPath, entry.name, 'General');
                const subEntries      = fs.readdirSync(fullPath, { withFileTypes: true });
                const variableFolders = subEntries.filter(e => e.isDirectory() && isVariableFolder(e.name));

                if (variableFolders.length > 0) {
                    for (const varEntry of variableFolders) {
                        const varFullPath     = path.join(fullPath, varEntry.name);
                        const varRelativePath = `${entry.name}/${varEntry.name}`;
                        const varInfo         = parseVariableInfo(varEntry.name);
                        const varProductInfo  = getProductInfo(varFullPath, entry.name, 'General', varInfo.customPrice, varInfo.name);
                        const varImages       = getProductImages(varFullPath, varRelativePath);
                        products.push({
                            id: `${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                            name: varProductInfo.name, type: varProductInfo.type,
                            typeName: varProductInfo.typeName, category: 'General',
                            price: varProductInfo.price, description: varProductInfo.description,
                            specs: varProductInfo.specs, pieces: varProductInfo.pieces, buildHours: varProductInfo.buildHours,
                            images: varImages, mainImage: varImages[0] || null,
                            isVariable: true, variableName: varInfo.name, customPrice: varInfo.customPrice,
                            parentProduct: entry.name
                        });
                    }
                } else {
                    products.push({
                        id: `${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                        name: productInfo.name, type: productInfo.type,
                        typeName: productInfo.typeName, category: 'General',
                        price: productInfo.price, description: productInfo.description,
                        specs: productInfo.specs, pieces: productInfo.pieces, buildHours: productInfo.buildHours,
                        images, mainImage: images[0] || null,
                        isVariable: false, variableName: null, customPrice: null
                    });
                }
            }
        } else {
            scanDirectory(fullPath, entry.name, products, entry.name);
        }
    }
    return products;
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
    const products = scanRootDirectory(ROOT);
    console.log(`   ✅ ${products.length} producto(s) encontrados.\n`);

    // 3. Normalizar rutas de imágenes a relativas (sin / inicial)
    // GitHub Pages sirve desde /tu-repo/, no desde /, así que rutas absolutas no funcionan
    const fixPath = p => (p ? p.replace(/^\/+/, '') : p);
    products.forEach(product => {
        product.images      = (product.images      || []).map(fixPath);
        product.mainImage   =  fixPath(product.mainImage);
        product.allVariants = (product.allVariants  || []).map(fixPath);
        if (product.variantImage) product.variantImage = fixPath(product.variantImage);
    });

    // 3b. Escribir products.json y config.json en docs/
    fs.writeFileSync(path.join(OUT_DIR, 'products.json'), JSON.stringify(products, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'config.json'),   JSON.stringify(config,   null, 2), 'utf8');
    console.log('📄 products.json y config.json generados.');

    // 4. Copiar styles.css
    copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT_DIR, 'styles.css'));

    // 5. Copiar script.js
    copyFileSync(path.join(ROOT, 'script.js'), path.join(OUT_DIR, 'script.js'));

    // 6. Modificar index.html para modo estático (inyectar flag antes de script.js)
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    html = html.replace(
        '<script src="script.js"></script>',
        '<script>window.STATIC_MODE = true;</script>\n    <script src="./script.js"></script>'
    );
    html = html.replace('href="styles.css"', 'href="./styles.css"');
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
    console.log('📄 index.html copiado (modo estático activado).');

    // 7. Copiar carpetas de productos (imágenes)
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.glb', '.gltf']);
    let copiedFolders = 0;
    let copiedImages  = 0;

    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (shouldIgnore(entry.name) || !entry.isDirectory()) continue;
        // Copiar la carpeta completa (puede ser categoría o producto)
        const src  = path.join(ROOT, entry.name);
        const dest = path.join(OUT_DIR, entry.name);
        copyDirSync(src, dest);
        copiedFolders++;

        // Contar imágenes
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

    // 8. Resumen
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  ✅ Exportación completada                         ║');
    console.log('║                                                   ║');
    console.log('║  Archivos generados en: docs/                     ║');
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
