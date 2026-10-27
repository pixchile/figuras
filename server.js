// Servidor para catálogo de productos basado en carpetas
// ============================================================================
// Para ejecutar: node server.js
// Luego visita: http://localhost:3000
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { scanProducts, DEFAULT_IGNORE_ITEMS } = require('./scanner');

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
    cachedProducts = scanProducts(__dirname, config, DEFAULT_IGNORE_ITEMS);
    return cachedProducts;
}

function refreshProducts() {
    cachedProducts = null;
    return getProductsFromFolders();
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
function handleApiRequest(url, res) {
    if (url === '/api/products') {
        const products = getProductsFromFolders();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(products));
    } else if (url === '/api/categories') {
        const products = getProductsFromFolders();
        const categories = [...new Set(products.map(p => p.category))];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(categories));
    } else if (url === '/api/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
    } else if (url === '/api/refresh') {
        refreshProducts();
        console.log('🔄 Productos re-escaneados (vía /api/refresh)');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    } else {
        res.writeHead(404);
        res.end('Endpoint no encontrado');
    }
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Rutas de API
    if (url.startsWith('/api/')) {
        handleApiRequest(url, res);
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

// Iniciar servidor
server.listen(PORT, () => {
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

    if (products.length === 0) {
        console.log('   No se encontraron productos.');
        return;
    }

    console.log(`\n✅ Se encontraron ${products.length} productos:`);

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
