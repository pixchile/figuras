// Servidor para catálogo de productos basado en carpetas
// ============================================================================
// Para ejecutar: node server.js
// Luego visita: http://localhost:3000
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

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
    '.glb': 'model/gltf-binary'
};

// Carpetas y archivos a ignorar
const IGNORE_ITEMS = [
    'node_modules',
    '.git',
    '.vscode',
    '.idea',
    'package.json',
    'package-lock.json',
    'server.js',
    'script.js',
    'styles.css',
    'config.json',
    'index.html',
    'README.md',
    'LICENSE',
    'docs'          // ← carpeta generada por export.js
];

// Cargar configuración
let config = { tipos: {} };
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
        config = JSON.parse(configData);
    }
} catch (e) {
    console.warn('Warning: No se pudo leer config.json, usando valores por defecto');
}

// Verificar si es un producto (carpeta empieza con "1", "2" o "3")
function isProductFolder(folderName) {
    return /^[123]/.test(folderName);
}

// Verificar si debemos ignorar un item
function shouldIgnoreItem(itemName) {
    return IGNORE_ITEMS.includes(itemName);
}

// Obtener el tipo de producto (1, 2 o 3)
function getProductType(folderName) {
    const match = folderName.match(/^([123])/);
    return match ? match[1] : '1';
}

// Extraer nombre del producto y multiplicador (si existe)
function parseProductName(folderName) {
    let name = folderName.replace(/^[123][-]?/, '');
    const multiplierMatch = name.match(/\((\d+)\)$/);
    let multiplier = 1;

    if (multiplierMatch) {
        multiplier = parseInt(multiplierMatch[1], 10) || 1;
        name = name.replace(/\((\d+)\)$/, '').trim();
    }

    name = name.replace(/-/g, ' ');

    return {
        displayName: name,
        multiplier: multiplier
    };
}

// ✅ NUEVO: Verificar si es una variable (nombre con precio entre paréntesis)
// Formato: "Rojo(15)" o "Azul-Cielo(20)"
function isVariableFolder(folderName) {
    // No empieza con 1, 2 o 3 y tiene paréntesis con número
    return !/^[123]/.test(folderName) && /\(\d+\)$/.test(folderName);
}

// ✅ NUEVO: Extraer nombre de variable y precio personalizado
function parseVariableInfo(folderName) {
    const match = folderName.match(/^(.+)\((\d+)\)$/);
    if (match) {
        let name = match[1].replace(/-/g, ' ').trim();
        let customPrice = parseInt(match[2], 10) || 0;
        return { name, customPrice };
    }
    return { name: folderName.replace(/-/g, ' ').trim(), customPrice: null };
}

// Calcular horas de armado (300 piezas = 1 hora)
function calculateBuildHours(pieces) {
    const hours = pieces / 300;
    return Math.round(hours);
}

// ✅ NUEVO: Redondear precio hacia arriba para que termine en 90
// Ejemplo: 1718 → 1790, 1700 → 1790, 1750 → 1790
function roundTo90(price) {
    // Si ya termina en 90 (múltiplo de 10 donde el dígito de decenas es 9), dejar como está
    // 1790, 1890, 1990, etc.
    if (price % 10 === 0 && Math.floor(price / 10) % 10 === 9) {
        return price;
    }

    // Si el precio es menor a 90, retornar 90
    if (price < 90) {
        return 90;
    }

    // Calcular el siguiente número que termine en 90
    // Encontrar el siguiente múltiplo de 10
    let nextTen = Math.ceil(price / 10) * 10;
    // Asegurar que termine en 90 (no en 00)
    if (nextTen % 100 === 0) {
        nextTen += 90;
    } else {
        nextTen = Math.floor(nextTen / 100) * 100 + 90;
    }
    return nextTen;
}

// ✅ FUNCIÓN MEJORADA: Obtener imágenes con rutas correctas
function getProductImages(productPath, relPath) {
    if (!fs.existsSync(productPath)) {
        console.log(`   ⚠️  Ruta no existe: ${productPath}`);
        return [];
    }
    
    const files = fs.readdirSync(productPath);
    const images = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext);
    });
    
    // ✅ Construir rutas correctas con / al inicio
    const imagePaths = images.map(file => {
        // Asegurar que la ruta comience con /
        const fullPath = relPath.startsWith('/') ? relPath : '/' + relPath;
        return `${fullPath}/${file}`;
    });
    
    console.log(`   📸 Imágenes encontradas en ${relPath}:`, imagePaths);
    
    return imagePaths;
}

// ✅ NUEVO: Detectar archivo .glb en la carpeta del producto (el primero que encuentre)
function getProductGlb(productPath, relPath) {
    if (!fs.existsSync(productPath)) return null;
    const files = fs.readdirSync(productPath);
    const glb = files.find(file => path.extname(file).toLowerCase() === '.glb');
    if (!glb) return null;
    const base = relPath.startsWith('/') ? relPath : '/' + relPath;
    return `${base}/${glb}`;
}

// Procesar template con TODOS los placeholders
function processTemplate(template, productName, category, pieces, buildHours) {
    return template
        .replace(/\{\{name\}\}/g, productName)
        .replace(/\{\{category\}\}/g, category)
        .replace(/\{\{pcs\}\}/g, pieces)
        .replace(/\{\{hours\}\}/g, buildHours);
}

// Obtener información del producto con nuevos placeholders
function getProductInfo(productPath, folderName, category, customPrice = null, variableName = null) {
    const type = getProductType(folderName);
    const parsedName = parseProductName(folderName);
    let displayName = parsedName.displayName;
    const multiplier = parsedName.multiplier;
    const buildHours = calculateBuildHours(multiplier);

    const typeConfig = config.tipos[type] || {
        nombre: 'Producto',
        descripcion: '{{name}} es un producto de alta calidad.',
        precio: 0,
        specs: []
    };

    // Si es una variable, agregar el nombre de la variable al nombre del producto
    if (variableName) {
        displayName = `${displayName} - ${variableName}`;
    }

    const description = processTemplate(
        typeConfig.descripcion,
        displayName,
        category,
        multiplier,
        buildHours
    );

    const processedSpecs = typeConfig.specs.map(spec =>
        processTemplate(spec, displayName, category, multiplier, buildHours)
    );

    const basePrice = typeConfig.precio || 0;
    // Usar precio personalizado si existe, sino calcular normalmente
    let calculatedPrice = customPrice !== null ? customPrice : (basePrice * multiplier);

    // ✅ APLICAR REDONDEO A 90 PARA TIPO 1
    if (type === '1') {
        calculatedPrice = roundTo90(calculatedPrice);
    }

    return {
        name: displayName,
        type: type,
        typeName: typeConfig.nombre,
        description: description,
        price: calculatedPrice,
        specs: processedSpecs,
        pieces: multiplier,
        buildHours: buildHours,
        // ✅ NUEVO: Información de variable
        isVariable: variableName !== null,
        variableName: variableName,
        customPrice: customPrice
    };
}

// ✅ FUNCIÓN MEJORADA: Escanear directorio con rutas relativas correctas
function scanDirectory(dirPath, currentCategory, products, relativeBase = '') {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

        if (isProductFolder(entry.name)) {
            const productType = getProductType(entry.name);
            const images = getProductImages(fullPath, relativePath);

            // ✅ MODIFICADO: Manejo especial para productos tipo 2
            if (productType === '2') {
                // Para tipo 2, cada imagen es una variante
                const productInfo = getProductInfo(fullPath, entry.name, currentCategory);
                const parsedName = parseProductName(entry.name);
                const baseName = parsedName.displayName;
                const multiplier = parsedName.multiplier;

                console.log(`   📦 Producto tipo 2 con ${images.length} variantes (imágenes): ${entry.name}`);

                // ✅ SOLO AGREGAR LA PRIMERA VARIANTE (STANDARD) AL LISTADO DE PRODUCTOS
                // Las demás variantes solo se podrán ver en el modal de detalles
                if (images.length > 0) {
                    const img = images[0]; // Solo la primera imagen (Standard)
                    const variantName = "Standard";

                    // Para la primera imagen, usar el nombre base del producto
                    const productName = baseName;

                    // El precio se calcula igual para todas las variantes
                    const price = productInfo.price;

                    // Crear descripción específica para esta variante
                    const variantDescription = processTemplate(
                        productInfo.description,
                        productName,
                        currentCategory,
                        multiplier,
                        productInfo.buildHours
                    );

                    // Crear especificaciones específicas para esta variante
                    const variantSpecs = productInfo.specs.map(spec =>
                        processTemplate(spec, productName, currentCategory, multiplier, productInfo.buildHours)
                    );

                    // Crear ID único para esta variante
                    const variantId = `${entry.name}-0`.replace(/[^a-zA-Z0-9-]/g, '');

                    products.push({
                        id: variantId,
                        name: productName,
                        type: '2',
                        typeName: productInfo.typeName,
                        category: currentCategory || 'General',
                        price: price,
                        description: variantDescription,
                        specs: variantSpecs,
                        pieces: multiplier,
                        buildHours: productInfo.buildHours,
                        images: [img], // Solo una imagen por variante
                        mainImage: img,
                        isVariable: true,
                        variableName: variantName,
                        customPrice: null,
                        parentProduct: entry.name, // Referencia al producto padre
                        allVariants: images, // ✅ Guardar todas las imágenes para el selector en el modal
                        totalVariants: images.length, // ✅ Indicar cuántas variantes hay en total
                        glbFile: getProductGlb(fullPath, relativePath)
                    });
                }
            } else {
                // Para tipos 1 y 3, comportamiento original
                const productInfo = getProductInfo(fullPath, entry.name, currentCategory);

                // ✅ NUEVO: Verificar si hay subcarpetas (variables) dentro del producto
                const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
                const variableFolders = subEntries.filter(e =>
                    e.isDirectory() && isVariableFolder(e.name)
                );

                if (variableFolders.length > 0) {
                    // Hay variables, crear un producto por cada variable
                    console.log(`   📦 Producto con ${variableFolders.length} variables: ${entry.name}`);

                    for (const varEntry of variableFolders) {
                        const varFullPath = path.join(fullPath, varEntry.name);
                        const varRelativePath = `${relativePath}/${varEntry.name}`;
                        const varInfo = parseVariableInfo(varEntry.name);

                        const varProductInfo = getProductInfo(
                            varFullPath,
                            entry.name,
                            currentCategory,
                            varInfo.customPrice,
                            varInfo.name
                        );
                        const varImages = getProductImages(varFullPath, varRelativePath);

                        products.push({
                            id: Date.now() + Math.random().toString(36).substr(2, 9),
                            name: varProductInfo.name,
                            type: varProductInfo.type,
                            typeName: varProductInfo.typeName,
                            category: currentCategory || 'General',
                            price: varProductInfo.price,
                            description: varProductInfo.description,
                            specs: varProductInfo.specs,
                            pieces: varProductInfo.pieces,
                            buildHours: varProductInfo.buildHours,
                            images: varImages,
                            mainImage: varImages[0] || null,
                            // ✅ NUEVO: Información de variable
                            isVariable: true,
                            variableName: varInfo.name,
                            customPrice: varInfo.customPrice,
                            parentProduct: entry.name, // Referencia al producto padre
                            glbFile: getProductGlb(fullPath, relativePath) // GLB en carpeta padre
                        });
                    }
                } else {
                    // No hay variables, crear producto normal
                    products.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        name: productInfo.name,
                        type: productInfo.type,
                        typeName: productInfo.typeName,
                        category: currentCategory || 'General',
                        price: productInfo.price,
                        description: productInfo.description,
                        specs: productInfo.specs,
                        pieces: productInfo.pieces,
                        buildHours: productInfo.buildHours,
                        images: images,
                        mainImage: images[0] || null,
                        // ✅ NUEVO: Marcar como no variable
                        isVariable: false,
                        variableName: null,
                        customPrice: null,
                        glbFile: getProductGlb(fullPath, relativePath)
                    });
                }
            }
        } else {
            const newCategory = currentCategory ? `${currentCategory} / ${entry.name}` : entry.name;
            scanDirectory(fullPath, newCategory, products, relativePath);
        }
    }
}

// Escanear el directorio raíz
function scanRootDirectory(rootPath) {
    const products = [];

    if (!fs.existsSync(rootPath)) {
        console.log('Directorio raíz no encontrado');
        return products;
    }

    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    console.log('📂 Escaneando directorio raíz...');

    for (const entry of entries) {
        if (shouldIgnoreItem(entry.name)) {
            console.log(`   Ignorando: ${entry.name}`);
            continue;
        }

        if (!entry.isDirectory()) continue;

        const fullPath = path.join(rootPath, entry.name);

        if (isProductFolder(entry.name)) {
            const productType = getProductType(entry.name);
            const images = getProductImages(fullPath, entry.name);

            // ✅ MODIFICADO: Manejo especial para productos tipo 2
            if (productType === '2') {
                // Para tipo 2, cada imagen es una variante
                const productInfo = getProductInfo(fullPath, entry.name, 'General');
                const parsedName = parseProductName(entry.name);
                const baseName = parsedName.displayName;
                const multiplier = parsedName.multiplier;

                console.log(`   📦 Producto tipo 2 con ${images.length} variantes (imágenes): ${entry.name}`);

                // ✅ SOLO AGREGAR LA PRIMERA VARIANTE (STANDARD) AL LISTADO DE PRODUCTOS
                // Las demás variantes solo se podrán ver en el modal de detalles
                if (images.length > 0) {
                    const img = images[0]; // Solo la primera imagen (Standard)
                    const variantName = "Standard";

                    // Para la primera imagen, usar el nombre base del producto
                    const productName = baseName;

                    // El precio se calcula igual para todas las variantes
                    const price = productInfo.price;

                    // Crear descripción específica para esta variante
                    const variantDescription = processTemplate(
                        productInfo.description,
                        productName,
                        'General',
                        multiplier,
                        productInfo.buildHours
                    );

                    // Crear especificaciones específicas para esta variante
                    const variantSpecs = productInfo.specs.map(spec =>
                        processTemplate(spec, productName, 'General', multiplier, productInfo.buildHours)
                    );

                    // Crear ID único para esta variante
                    const variantId = `${entry.name}-0`.replace(/[^a-zA-Z0-9-]/g, '');

                    products.push({
                        id: variantId,
                        name: productName,
                        type: '2',
                        typeName: productInfo.typeName,
                        category: 'General',
                        price: price,
                        description: variantDescription,
                        specs: variantSpecs,
                        pieces: multiplier,
                        buildHours: productInfo.buildHours,
                        images: [img], // Solo una imagen por variante
                        mainImage: img,
                        isVariable: true,
                        variableName: variantName,
                        customPrice: null,
                        parentProduct: entry.name, // Referencia al producto padre
                        allVariants: images, // ✅ Guardar todas las imágenes para el selector en el modal
                        totalVariants: images.length, // ✅ Indicar cuántas variantes hay en total
                        glbFile: getProductGlb(fullPath, relativePath)
                    });
                }
            } else {
                // Para tipos 1 y 3, comportamiento original
                const productInfo = getProductInfo(fullPath, entry.name, 'General');

                // ✅ NUEVO: Verificar si hay subcarpetas (variables) dentro del producto
                const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
                const variableFolders = subEntries.filter(e =>
                    e.isDirectory() && isVariableFolder(e.name)
                );

                if (variableFolders.length > 0) {
                    // Hay variables, crear un producto por cada variable
                    console.log(`   📦 Producto con ${variableFolders.length} variables: ${entry.name}`);

                    for (const varEntry of variableFolders) {
                        const varFullPath = path.join(fullPath, varEntry.name);
                        const varRelativePath = `${entry.name}/${varEntry.name}`;
                        const varInfo = parseVariableInfo(varEntry.name);

                        const varProductInfo = getProductInfo(
                            varFullPath,
                            entry.name,
                            'General',
                            varInfo.customPrice,
                            varInfo.name
                        );
                        const varImages = getProductImages(varFullPath, varRelativePath);

                        products.push({
                            id: Date.now() + Math.random().toString(36).substr(2, 9),
                            name: varProductInfo.name,
                            type: varProductInfo.type,
                            typeName: varProductInfo.typeName,
                            category: 'General',
                            price: varProductInfo.price,
                            description: varProductInfo.description,
                            specs: varProductInfo.specs,
                            pieces: varProductInfo.pieces,
                            buildHours: varProductInfo.buildHours,
                            images: varImages,
                            mainImage: varImages[0] || null,
                            // ✅ NUEVO: Información de variable
                            isVariable: true,
                            variableName: varInfo.name,
                            customPrice: varInfo.customPrice,
                            parentProduct: entry.name, glbFile: getProductGlb(fullPath, entry.name)
                        });
                    }
                } else {
                    // No hay variables, crear producto normal
                    products.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        name: productInfo.name,
                        type: productInfo.type,
                        typeName: productInfo.typeName,
                        category: 'General',
                        price: productInfo.price,
                        description: productInfo.description,
                        specs: productInfo.specs,
                        pieces: productInfo.pieces,
                        buildHours: productInfo.buildHours,
                        images: images,
                        mainImage: images[0] || null,
                        // ✅ NUEVO: Marcar como no variable
                        isVariable: false,
                        variableName: null,
                        customPrice: null,
                        glbFile: getProductGlb(fullPath, entry.name)
                    });
                }
            }
        } else {
            console.log(`   Procesando categoría: ${entry.name}`);
            scanDirectory(fullPath, entry.name, products, entry.name);
        }
    }

    return products;
}

function getProductsFromFolders() {
    return scanRootDirectory(__dirname);
}

// Servir archivos estáticos
function serveStaticFile(filePath, res) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log(`   ❌ 404: ${filePath}`);
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
    } else {
        res.writeHead(404);
        res.end('Endpoint no encontrado');
    }
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    
    // Decodificar URL para manejar caracteres especiales
    url = decodeURIComponent(url);
    
    console.log(`📥 Solicitud: ${url}`);
    
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
    
    // ✅ MEJORADO: Servir cualquier archivo dentro de carpetas
    // Remover el / inicial para path.join
    const requestedPath = url.startsWith('/') ? url.slice(1) : url;
    const filePath = path.join(__dirname, requestedPath);
    
    // Verificar que el archivo existe y está dentro del directorio del proyecto
    const normalizedPath = path.normalize(filePath);
    const projectDir = path.normalize(__dirname);
    
    if (normalizedPath.startsWith(projectDir)) {
        // Verificar si el archivo existe
        if (fs.existsSync(normalizedPath)) {
            const stats = fs.statSync(normalizedPath);
            if (stats.isFile()) {
                console.log(`   ✅ Sirviendo: ${normalizedPath}`);
                serveStaticFile(normalizedPath, res);
                return;
            }
        }
    }
    
    // Si llegamos aquí, el archivo no fue encontrado
    console.log(`   ❌ No encontrado: ${url}`);
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
    
    console.log('📦 Escaneando estructura de carpetas...');
    const products = getProductsFromFolders();
    
    if (products.length === 0) {
        console.log('   No se encontraron productos.');
    } else {
        console.log(`\n✅ Se encontraron ${products.length} productos:`);
        
        const byCategory = {};
        products.forEach(p => {
            if (!byCategory[p.category]) {
                byCategory[p.category] = [];
            }
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
    }
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