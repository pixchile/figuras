// Servidor para catálogo de productos basado en carpetas
// ============================================================================
// Para ejecutar: node server.js
// Luego visita: http://localhost:3000
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { scanProducts, readPacksFile, resolvePacks, DEFAULT_IGNORE_ITEMS } = require('./scanner');

const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Tipos MIME permitidos
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

// Cargar configuración
let config = { tipos: {} };
try {
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (e) {
    console.warn('Warning: No se pudo leer config.json, usando valores por defecto');
}

// Caché de productos para no re-escanear en cada request
let cachedProducts = null;

function getProductsFromFolders() {
    if (cachedProducts) return cachedProducts;
    const products = scanProducts(__dirname, config, DEFAULT_IGNORE_ITEMS);
    const packs = resolvePacks(products, readPacksFile(__dirname));
    cachedProducts = [...packs, ...products];
    return cachedProducts;
}

function refreshProducts() {
    cachedProducts = null;
    return getProductsFromFolders();
}

function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function writePacksFile(doc) {
    const file = path.join(__dirname, 'packs.json');
    const tmp  = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
}

function validatePacksDoc(doc) {
    if (!doc || !Array.isArray(doc.packs)) return 'El archivo debe tener un array "packs".';
    if (doc.packs.length > 300) return 'Hay demasiados packs.';

    for (let i = 0; i < doc.packs.length; i++) {
        const pack = doc.packs[i];
        const label = `Pack ${i + 1}`;
        if (!pack || typeof pack.name !== 'string' || !pack.name.trim()) {
            return `${label}: falta el nombre.`;
        }
        if (!Array.isArray(pack.items) || pack.items.length < 2) {
            return `"${pack.name}": necesita al menos 2 productos.`;
        }
        if (pack.discountType !== 'percent' && pack.discountType !== 'fixed') {
            return `"${pack.name}": el tipo de descuento debe ser "percent" o "fixed".`;
        }
        if (pack.discountType === 'percent') {
            const d = Number(pack.discount);
            if (!(d > 0 && d <= 90)) return `"${pack.name}": el descuento debe estar entre 1 y 90 %.`;
        } else {
            const price = Number(pack.price);
            if (!(price > 0)) return `"${pack.name}": el precio fijo debe ser mayor a 0.`;
        }
        for (const item of pack.items) {
            if (!item || (!item.ref && !item.name)) {
                return `"${pack.name}": hay un producto sin referencia.`;
            }
        }
    }
    return null;
}

function readJsonBody(req, cb) {
    let raw = '';
    let size = 0;
    let done = false;

    req.on('data', chunk => {
        if (done) return;
        size += chunk.length;
        if (size > 1024 * 1024) {
            done = true;
            cb(new Error('El cuerpo supera 1 MB.'));
            req.destroy();
            return;
        }
        raw += chunk.toString('utf8');
    });
    req.on('end', () => { if (!done) { done = true; cb(null, raw); } });
    req.on('error', err => { if (!done) { done = true; cb(err); } });
}

function isAllowedWriteOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // curl u otras herramientas locales
    return /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin);
}

// Servir archivos estáticos
function serveStaticFile(filePath, res) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Archivo no encontrado');
            } else {
                res.writeHead(500);
                res.end('Error del servidor');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
}

// Rutas de la API
function handleApiRequest(req, res, url) {
    if (url === '/api/products' && req.method === 'GET') {
        sendJson(res, 200, getProductsFromFolders());
    } else if (url === '/api/categories' && req.method === 'GET') {
        const products = getProductsFromFolders();
        sendJson(res, 200, [...new Set(products.map(p => p.category))]);
    } else if (url === '/api/config' && req.method === 'GET') {
        sendJson(res, 200, config);
    } else if (url === '/api/packs' && req.method === 'GET') {
        sendJson(res, 200, readPacksFile(__dirname));
    } else if (url === '/api/packs' && req.method === 'POST') {
        if (!isAllowedWriteOrigin(req)) {
            res.writeHead(403);
            res.end('Origen no permitido');
            return;
        }
        if (!/^application\/json/i.test(req.headers['content-type'] || '')) {
            res.writeHead(415);
            res.end('Se esperaba application/json');
            return;
        }
        readJsonBody(req, (err, raw) => {
            if (err) {
                res.writeHead(413);
                res.end(err.message);
                return;
            }
            let doc;
            try {
                doc = JSON.parse(raw);
            } catch {
                res.writeHead(400);
                res.end('JSON inválido');
                return;
            }
            const problem = validatePacksDoc(doc);
            if (problem) {
                res.writeHead(400);
                res.end(problem);
                return;
            }
            try {
                writePacksFile(doc);
                const products = refreshProducts();
                console.log(`💾 packs.json guardado (${doc.packs.length} pack(s))`);
                sendJson(res, 200, { ok: true, packs: doc.packs.length, total: products.length });
            } catch (e) {
                console.error('Error guardando packs.json:', e);
                res.writeHead(500);
                res.end('No se pudo guardar packs.json');
            }
        });
    } else if (url === '/api/refresh' && req.method === 'GET') {
        refreshProducts();
        console.log('🔄 Productos re-escaneados (vía /api/refresh)');
        sendJson(res, 200, { ok: true });
    } else if (url.startsWith('/api/')) {
        res.writeHead(404);
        res.end('Endpoint no encontrado');
    }
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Rutas de API
    if (url.startsWith('/api/')) {
        handleApiRequest(req, res, url);
        return;
    }

    // Herramienta local para armar packs (no se publica)
    if (url === '/admin' || url === '/admin.html') {
        serveStaticFile(path.join(__dirname, 'admin.html'), res);
        return;
    }

    // Servir archivos principales (index.html, script.js, styles.css)
    if (url === '/' || url === '/index.html') {
        serveStaticFile(path.join(__dirname, 'index.html'), res);
        return;
    }

    if (url === '/script.js') {
        serveStaticFile(path.join(__dirname, 'script.js'), res);
        return;
    }

    if (url === '/styles.css') {
        serveStaticFile(path.join(__dirname, 'styles.css'), res);
        return;
    }

    // Servir cualquier archivo dentro de carpetas, sin salir del proyecto
    const requestedPath = url.startsWith('/') ? url.slice(1) : url;
    const filePath = path.join(__dirname, requestedPath);
    const normalizedPath = path.normalize(filePath);
    const projectDir = path.normalize(__dirname);

    if (normalizedPath.startsWith(projectDir) && fs.existsSync(normalizedPath)) {
        if (fs.statSync(normalizedPath).isFile()) {
            serveStaticFile(normalizedPath, res);
            return;
        }
    }

    res.writeHead(404);
    res.end('Archivo no encontrado');
});

// Iniciar servidor (solo local, para poder guardar packs.json)
server.listen(PORT, '127.0.0.1', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏪 Catálogo de Productos                                ║
║                                                           ║
║   Servidor iniciado en: http://localhost:${PORT}           ║
║                                                           ║
║   📁 Estructura flexible de carpetas                      ║
║   ✨ Placeholders disponibles:                            ║
║      {{name}} - Nombre del producto                       ║
║      {{category}} - Categoría del producto                ║
║      {{pcs}} - Número de piezas (paréntesis)              ║
║      {{hours}} - Horas de armado (300pcs = 1h)            ║
║                                                           ║
║   🖼️  Formatos de imagen soportados:                      ║
║      JPG, JPEG, PNG, GIF, SVG, WEBP                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);

    const products = getProductsFromFolders();
    const packs = products.filter(p => p.isPack);
    const realProducts = products.length - packs.length;

    if (products.length === 0) {
        console.log('   No se encontraron productos.');
        return;
    }

    console.log(`\n✅ Se encontraron ${realProducts} productos y ${packs.length} pack(s):`);

    const byCategory = {};
    products.forEach(p => {
        if (!byCategory[p.category]) byCategory[p.category] = [];
        byCategory[p.category].push(p);
    });

    Object.keys(byCategory).sort().forEach(category => {
        console.log(`\n   📂 ${category}:`);
        byCategory[category].forEach(p => {
            const variantInfo = p.isVariable ? ` [${p.variableName}]` : '';
            console.log(`     • ${p.name}: $${p.price} (${p.pieces} piezas, ${p.buildHours}h)${variantInfo}`);
            if (p.type === '2' && p.allVariants) {
                console.log(`       Variantes: ${p.allVariants.length} imágenes`);
            } else {
                console.log(`       Imágenes: ${p.images.length > 0 ? p.images.length : 'ninguna'}`);
            }
        });
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: El puerto ${PORT} ya está en uso.`);
        console.error('Intenta detener otros servidores o usa otro puerto.');
    } else {
        console.error('Error del servidor:', err);
    }
    process.exit(1);
});
