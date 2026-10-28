// ============================================================================
// scanner.js — Escaneo de carpetas de productos (lógica compartida)
// ============================================================================
// Lo usan server.js (modo dinámico) y export.js (modo estático) para que
// ambos generen exactamente los mismos datos.
//
// Convenciones de carpetas:
//   1-Nombre(piezas)/                        → Kit de Armado
//   2-Nombre(1)/                             → Pack Color (cada imagen es una variante)
//   3-Nombre(piezas)/                        → Plantilla digital
//   Otra carpeta/                            → categoría
//   Nombre(precio)/ dentro de un producto    → variante con precio propio
//
// Archivos opcionales dentro de la carpeta del producto:
//   descripcion.txt / descripcion.md         → texto adicional
//   *.glb / *.gltf                           → modelo 3D
// ============================================================================

const fs   = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);
const DESCRIPTION_FILES = ['descripcion.txt', 'descripcion.md', 'description.txt', 'description.md'];

// Carpetas/archivos que no son productos ni categorías
const DEFAULT_IGNORE_ITEMS = [
    'node_modules', '.git', '.vscode', '.idea', '.claude', '.commandcode',
    'package.json', 'package-lock.json',
    'server.js', 'export.js', 'scanner.js',
    'script.js', 'banner.js', 'styles.css', 'config.json', 'index.html',
    'README.md', 'LICENSE', 'docs', '.gitignore', 'products.json',
    'packs.json', 'admin.html',
    'banner',  // se copia explícitamente en export.js
    'packs'    // imágenes propias de packs; también se copian explícitamente
];

// ─── PARSERS ────────────────────────────────────────────────────────────────

function isProductFolder(name)  { return /^[123]/.test(name); }
function isVariableFolder(name) { return !/^[123]/.test(name) && /\(\d+\)$/.test(name); }
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

// ID determinístico a partir de una clave (no cambia entre reinicios)
function hashId(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
    }
    return 'p' + Math.abs(hash).toString(36);
}

// 300 piezas = 1 hora
function calculateBuildHours(pieces) { return Math.round(pieces / 300); }

// Redondear hacia arriba para que el precio termine en 90 (1718 → 1790)
function roundTo90(price) {
    if (price % 10 === 0 && Math.floor(price / 10) % 10 === 9) return price;
    if (price < 90) return 90;
    let next = Math.ceil(price / 10) * 10;
    next = next % 100 === 0 ? next + 90 : Math.floor(next / 100) * 100 + 90;
    return next;
}

// ─── LECTURA DE ARCHIVOS ────────────────────────────────────────────────────

function getProductImages(productPath, relPath) {
    if (!fs.existsSync(productPath)) return [];
    const base = relPath.startsWith('/') ? relPath : '/' + relPath;
    return fs.readdirSync(productPath)
        .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .map(f => `${base}/${f}`);
}

function getModelFile(productPath, relPath) {
    if (!fs.existsSync(productPath)) return null;
    const model = fs.readdirSync(productPath)
        .find(f => MODEL_EXTENSIONS.has(path.extname(f).toLowerCase()));
    if (!model) return null;
    const base = relPath.startsWith('/') ? relPath : '/' + relPath;
    return `${base}/${model}`;
}

function getExtraDescription(folderPath) {
    for (const filename of DESCRIPTION_FILES) {
        const filepath = path.join(folderPath, filename);
        if (fs.existsSync(filepath)) {
            return fs.readFileSync(filepath, 'utf8').trim() || null;
        }
    }
    return null;
}

// ─── INFO DE PRODUCTO ───────────────────────────────────────────────────────

function processTemplate(tpl, name, category, pcs, hours) {
    return tpl
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{category\}\}/g, category)
        .replace(/\{\{pcs\}\}/g, pcs)
        .replace(/\{\{hours\}\}/g, hours);
}

/**
 * Crea un escáner con la configuración de precios/textos ya cargada.
 */
function createScanner(config) {
    const tipos = (config && config.tipos) || {};

    function getProductInfo(productPath, folderName, category, customPrice = null, variableName = null) {
        const type         = getProductType(folderName);
        const parsed       = parseProductName(folderName);
        let displayName    = parsed.displayName;
        const multiplier   = parsed.multiplier;
        const buildHours   = calculateBuildHours(multiplier);
        const typeCfg      = tipos[type] || { nombre: 'Producto', descripcion: '{{name}}', precio: 0, specs: [] };

        if (variableName) displayName = `${displayName} - ${variableName}`;

        const description = processTemplate(typeCfg.descripcion || '', displayName, category, multiplier, buildHours);
        const specs       = (typeCfg.specs || []).map(s => processTemplate(s, displayName, category, multiplier, buildHours));

        let price = customPrice !== null ? customPrice : (typeCfg.precio || 0) * multiplier;
        if (type === '1') price = roundTo90(price);

        return { name: displayName, type, typeName: typeCfg.nombre, description, price, specs, pieces: multiplier, buildHours };
    }

    // ─── ESCANEO RECURSIVO ──────────────────────────────────────────────────

    function scanDirectory(dirPath, currentCategory, products, relativeBase) {
        if (!fs.existsSync(dirPath)) return;

        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;

            const fullPath     = path.join(dirPath, entry.name);
            const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

            if (isProductFolder(entry.name)) {
                const productType = getProductType(entry.name);
                const images      = getProductImages(fullPath, relativePath);
                const glbFile     = getModelFile(fullPath, relativePath);

                if (productType === '2') {
                    // Cada imagen es una variante; solo la primera ("Standard") se lista
                    const productInfo      = getProductInfo(fullPath, entry.name, currentCategory);
                    const parsed           = parseProductName(entry.name);
                    const extraDescription = getExtraDescription(fullPath);

                    if (images.length > 0) {
                        products.push({
                            id: hashId(relativePath + '-0'), ref: relativePath, name: parsed.displayName, type: '2',
                            typeName: productInfo.typeName, category: currentCategory || 'General',
                            price: productInfo.price, description: productInfo.description,
                            specs: productInfo.specs, pieces: parsed.multiplier, buildHours: productInfo.buildHours,
                            images: [images[0]], mainImage: images[0],
                            isVariable: true, variableName: 'Standard', customPrice: null,
                            parentProduct: entry.name, allVariants: images, totalVariants: images.length,
                            glbFile, extraDescription
                        });
                    }
                } else {
                    const productInfo      = getProductInfo(fullPath, entry.name, currentCategory);
                    const extraDescription = getExtraDescription(fullPath);
                    const variableFolders  = fs.readdirSync(fullPath, { withFileTypes: true })
                        .filter(e => e.isDirectory() && isVariableFolder(e.name));

                    if (variableFolders.length > 0) {
                        for (const varEntry of variableFolders) {
                            const varFullPath     = path.join(fullPath, varEntry.name);
                            const varRelativePath = `${relativePath}/${varEntry.name}`;
                            const varInfo         = parseVariableInfo(varEntry.name);
                            const varProductInfo  = getProductInfo(varFullPath, entry.name, currentCategory, varInfo.customPrice, varInfo.name);
                            const varImages       = getProductImages(varFullPath, varRelativePath);
                            const varGlb          = getModelFile(varFullPath, varRelativePath) || glbFile;
                            // Las variantes heredan la descripción del producto padre
                            const varExtra        = getExtraDescription(varFullPath) || extraDescription;

                            products.push({
                                id: hashId(relativePath + '/' + varEntry.name), ref: varRelativePath,
                                name: varProductInfo.name, type: varProductInfo.type,
                                typeName: varProductInfo.typeName, category: currentCategory || 'General',
                                price: varProductInfo.price, description: varProductInfo.description,
                                specs: varProductInfo.specs, pieces: varProductInfo.pieces, buildHours: varProductInfo.buildHours,
                                images: varImages, mainImage: varImages[0] || null,
                                isVariable: true, variableName: varInfo.name, customPrice: varInfo.customPrice,
                                parentProduct: entry.name, glbFile: varGlb, extraDescription: varExtra
                            });
                        }
                    } else {
                        products.push({
                            id: hashId(relativePath), ref: relativePath,
                            name: productInfo.name, type: productInfo.type,
                            typeName: productInfo.typeName, category: currentCategory || 'General',
                            price: productInfo.price, description: productInfo.description,
                            specs: productInfo.specs, pieces: productInfo.pieces, buildHours: productInfo.buildHours,
                            images, mainImage: images[0] || null,
                            isVariable: false, variableName: null, customPrice: null, glbFile, extraDescription
                        });
                    }
                }
            } else {
                const newCategory = currentCategory ? `${currentCategory} / ${entry.name}` : entry.name;
                scanDirectory(fullPath, newCategory, products, relativePath);
            }
        }
    }

    function scanRootDirectory(rootPath, ignoreItems) {
        const products = [];
        if (!fs.existsSync(rootPath)) return products;

        for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
            if (ignoreItems.includes(entry.name) || !entry.isDirectory()) continue;
            const fullPath = path.join(rootPath, entry.name);

            if (isProductFolder(entry.name)) {
                const productType = getProductType(entry.name);
                const images      = getProductImages(fullPath, entry.name);
                const glbFile     = getModelFile(fullPath, entry.name);

                if (productType === '2') {
                    const productInfo      = getProductInfo(fullPath, entry.name, 'General');
                    const parsed           = parseProductName(entry.name);
                    const extraDescription = getExtraDescription(fullPath);

                    if (images.length > 0) {
                        products.push({
                            id: hashId(entry.name + '-0'), ref: entry.name, name: parsed.displayName, type: '2',
                            typeName: productInfo.typeName, category: 'General',
                            price: productInfo.price, description: productInfo.description,
                            specs: productInfo.specs, pieces: parsed.multiplier, buildHours: productInfo.buildHours,
                            images: [images[0]], mainImage: images[0],
                            isVariable: true, variableName: 'Standard', customPrice: null,
                            parentProduct: entry.name, allVariants: images, totalVariants: images.length,
                            glbFile, extraDescription
                        });
                    }
                } else {
                    const productInfo      = getProductInfo(fullPath, entry.name, 'General');
                    const extraDescription = getExtraDescription(fullPath);
                    const variableFolders  = fs.readdirSync(fullPath, { withFileTypes: true })
                        .filter(e => e.isDirectory() && isVariableFolder(e.name));

                    if (variableFolders.length > 0) {
                        for (const varEntry of variableFolders) {
                            const varFullPath     = path.join(fullPath, varEntry.name);
                            const varRelativePath = `${entry.name}/${varEntry.name}`;
                            const varInfo         = parseVariableInfo(varEntry.name);
                            const varProductInfo  = getProductInfo(varFullPath, entry.name, 'General', varInfo.customPrice, varInfo.name);
                            const varImages       = getProductImages(varFullPath, varRelativePath);
                            const varGlb          = getModelFile(varFullPath, varRelativePath) || glbFile;
                            const varExtra        = getExtraDescription(varFullPath) || extraDescription;

                            products.push({
                                id: hashId(entry.name + '/' + varEntry.name), ref: varRelativePath,
                                name: varProductInfo.name, type: varProductInfo.type,
                                typeName: varProductInfo.typeName, category: 'General',
                                price: varProductInfo.price, description: varProductInfo.description,
                                specs: varProductInfo.specs, pieces: varProductInfo.pieces, buildHours: varProductInfo.buildHours,
                                images: varImages, mainImage: varImages[0] || null,
                                isVariable: true, variableName: varInfo.name, customPrice: varInfo.customPrice,
                                parentProduct: entry.name, glbFile: varGlb, extraDescription: varExtra
                            });
                        }
                    } else {
                        products.push({
                            id: hashId(entry.name), ref: entry.name,
                            name: productInfo.name, type: productInfo.type,
                            typeName: productInfo.typeName, category: 'General',
                            price: productInfo.price, description: productInfo.description,
                            specs: productInfo.specs, pieces: productInfo.pieces, buildHours: productInfo.buildHours,
                            images, mainImage: images[0] || null,
                            isVariable: false, variableName: null, customPrice: null, glbFile, extraDescription
                        });
                    }
                }
            } else {
                scanDirectory(fullPath, entry.name, products, entry.name);
            }
        }
        return products;
    }

    return { scanRootDirectory };
}

// ─── PACKS ──────────────────────────────────────────────────────────────────
// Los packs viven en packs.json y referencian productos existentes por su
// ruta de carpeta (`ref`) o, como respaldo, por nombre. No duplican productos
// ni imágenes.

function readPacksFile(rootPath) {
    const file = path.join(rootPath, 'packs.json');
    try {
        if (!fs.existsSync(file)) return { version: 1, packs: [] };
        const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        const packs = Array.isArray(doc) ? doc : (Array.isArray(doc.packs) ? doc.packs : []);
        return { version: (doc && doc.version) || 1, packs };
    } catch (e) {
        console.warn('⚠️  No se pudo leer packs.json:', e.message);
        return { version: 1, packs: [] };
    }
}

function slugifyPack(text) {
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'pack';
}

/**
 * Convierte la configuración de packs en productos "tipo pack" listos para
 * la grilla y el carrito. Devuelve solo los packs válidos.
 */
function resolvePacks(products, packsDoc) {
    const configs = (packsDoc && packsDoc.packs) || [];
    const byRef  = new Map();
    const byName = new Map();

    for (const p of products) {
        if (p.ref) byRef.set(p.ref, p);
        byName.set(String(p.name).trim().toLowerCase(), p);
    }

    const usedPackIds = new Set();
    const result = [];

    for (const cfg of configs) {
        if (!cfg || cfg.enabled === false) continue;
        if (!cfg.name || !Array.isArray(cfg.items)) continue;

        const resolved = [];
        let missing = null;

        for (const item of cfg.items) {
            const ref  = typeof item === 'string' ? item : (item && item.ref);
            const name = typeof item === 'string' ? null : (item && item.name);

            let product = ref ? byRef.get(ref) : null;
            if (!product && name) product = byName.get(String(name).trim().toLowerCase());

            if (!product) { missing = ref || name || '(sin referencia)'; break; }
            if (!resolved.some(p => p.id === product.id)) resolved.push(product);
        }

        if (missing) {
            console.warn(`⚠️  Pack "${cfg.name}" omitido: no se encontró "${missing}".`);
            continue;
        }
        if (resolved.length < 2) {
            console.warn(`⚠️  Pack "${cfg.name}" omitido: necesita al menos 2 productos.`);
            continue;
        }

        const regularPrice = resolved.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
        const discountType = cfg.discountType === 'fixed' ? 'fixed' : 'percent';
        const percent = Math.min(90, Math.max(0, Number(cfg.discount) || 0));

        let price = discountType === 'fixed'
            ? Math.round(Number(cfg.price) || 0)
            : roundTo90(Math.round(regularPrice * (1 - percent / 100)));

        if (!(price > 0) || price >= regularPrice) {
            console.warn(`⚠️  Pack "${cfg.name}" omitido: el precio (${price}) no es menor al total (${regularPrice}).`);
            continue;
        }

        const baseId = slugifyPack(cfg.id || cfg.name);
        let packId = baseId;
        let n = 2;
        while (usedPackIds.has(packId)) packId = `${baseId}-${n++}`;
        usedPackIds.add(packId);

        const image = cfg.image
            ? (String(cfg.image).startsWith('/') ? String(cfg.image) : '/' + String(cfg.image))
            : (resolved[0].mainImage || null);

        const names = resolved.map(p => p.name);
        const listText = names.length === 2
            ? `${names[0]} y ${names[1]}`
            : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;

        result.push({
            id: hashId('pack:' + packId),
            ref: 'pack/' + packId,
            name: String(cfg.name).trim(),
            type: 'pack',
            typeName: 'Pack',
            category: cfg.category || 'Packs',
            price,
            regularPrice,
            savings: regularPrice - price,
            discountType,
            discount: discountType === 'percent' ? percent : null,
            description: (cfg.description && String(cfg.description).trim()) || `Incluye ${listText}.`,
            specs: [],
            pieces: resolved.reduce((sum, p) => sum + (p.pieces || 0), 0),
            buildHours: resolved.reduce((sum, p) => sum + (p.buildHours || 0), 0),
            images: image ? [image] : [],
            mainImage: image,
            isVariable: false,
            variableName: null,
            customPrice: null,
            glbFile: null,
            extraDescription: null,
            isPack: true,
            isDigital: resolved.every(p => p.type === '3'),
            memberIds: resolved.map(p => p.id),
            packItems: resolved.map(p => ({
                id: p.id,
                ref: p.ref,
                name: p.name,
                price: p.price,
                mainImage: p.mainImage,
                images: p.images || [],
                category: p.category
            }))
        });
    }

    return result;
}

/**
 * Escanea la raíz y devuelve el listado de productos.
 * Las rutas de imágenes/modelos se devuelven con "/" inicial.
 */
function scanProducts(rootPath, config, ignoreItems) {
    const scanner = createScanner(config || { tipos: {} });
    return scanner.scanRootDirectory(rootPath, ignoreItems || DEFAULT_IGNORE_ITEMS);
}

module.exports = {
    DEFAULT_IGNORE_ITEMS,
    isProductFolder,
    isVariableFolder,
    parseProductName,
    parseVariableInfo,
    scanProducts,
    readPacksFile,
    resolvePacks,
    slugifyPack
};
