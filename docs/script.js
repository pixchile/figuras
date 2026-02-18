let allProducts = [];
let cart = []; // ✅ CARRITO DE COMPRAS
let config = { tipos: {} }; // ✅ Configuración cargada desde el servidor

// ✅ CARGAR CARRITO DEL ALMACENAMIENTO LOCAL
function loadCart() {
    const savedCart = localStorage.getItem('shoppingCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartUI();
    }
}

// ✅ GUARDAR CARRITO EN ALMACENAMIENTO LOCAL
function saveCart() {
    localStorage.setItem('shoppingCart', JSON.stringify(cart));
}

// ✅ AGREGAR PRODUCTO AL CARRITO
function addToCart(productId, customPrice = null, customName = null) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const priceToUse = customPrice !== null ? customPrice : product.price;
    const nameToUse = customName !== null ? customName : product.name;

    // Para tipo 2, necesitamos un ID único que incluya la imagen de la variante
    let uniqueId = product.id;
    if (product.type === '2') {
        // Usar la imagen principal del producto (Standard cuando se agrega desde la página principal)
        uniqueId = `${product.id}-${product.mainImage}`;
    }

    // Verificar si el producto ya está en el carrito
    const existingItem = cart.find(item => {
        if (product.type === '2') {
            // Para tipo 2, comparar por uniqueId (incluye imagen) y precio
            return item.uniqueId === uniqueId && item.price === priceToUse;
        } else {
            // Para otros tipos, comparar por ID y precio
            return item.id === productId && item.price === priceToUse;
        }
    });

    if (existingItem) {
        existingItem.quantity++;
    } else {
        const cartItem = {
            uniqueId: uniqueId,
            id: product.id,
            name: nameToUse,
            price: priceToUse,
            image: product.mainImage,
            category: product.category,
            quantity: 1
        };

        // Agregar información específica por tipo
        if (product.type === '1') {
            cartItem.type = '1';
        } else if (product.type === '2') {
            cartItem.type = '2';
            cartItem.unitMultiplier = 1;
            cartItem.basePrice = product.price;
            cartItem.variantName = product.variableName || "Standard";
            cartItem.variantImage = product.mainImage;
        } else if (product.type === '3') {
            cartItem.type = '3';
        }

        cart.push(cartItem);
    }

    saveCart();
    updateCartUI();
    showCartNotification(nameToUse);
}

// ✅ NUEVO: AGREGAR SÓLO PLANTILLA DIGITAL (TIPO 1)
function addTemplateOnly(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    // Verificar que sea tipo 1
    if (product.type !== '1') return;

    // ✅ APLICAR REDONDEO A 90 AL PRECIO DE PLANTILLA
    const templatePrice = roundTo90(config.tipos['1']?.precioPlantillaDigital || 5);
    const templateName = `Sólo Plantilla - ${product.name}`;

    // Verificar si ya existe este producto con precio de plantilla
    const existingItem = cart.find(item =>
        item.id === productId &&
        item.name === templateName &&
        item.price === templatePrice
    );

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            uniqueId: `${productId}-template`,
            id: product.id,
            name: templateName,
            price: templatePrice,
            image: product.mainImage,
            category: product.category,
            quantity: 1,
            isTemplateOnly: true,
            type: '1'
        });
    }

    saveCart();
    updateCartUI();
    showCartNotification(templateName);
}

// ✅ ELIMINAR PRODUCTO DEL CARRITO
function removeFromCart(productId, price = null, uniqueId = null) {
    if (uniqueId) {
        cart = cart.filter(item => item.uniqueId !== uniqueId);
    } else if (price !== null) {
        cart = cart.filter(item => !(item.id === productId && item.price === price));
    } else {
        cart = cart.filter(item => item.id !== productId);
    }
    saveCart();
    updateCartUI();
}

// ✅ ACTUALIZAR CANTIDAD
function updateQuantity(productId, change, price = null, uniqueId = null) {
    let item;
    if (uniqueId) {
        item = cart.find(item => item.uniqueId === uniqueId);
    } else if (price !== null) {
        item = cart.find(item => item.id === productId && item.price === price);
    } else {
        item = cart.find(item => item.id === productId);
    }
    if (!item) return;

    item.quantity += change;

    if (item.quantity <= 0) {
        removeFromCart(productId, price, uniqueId);
    } else {
        saveCart();
        updateCartUI();
    }
}

// ✅ VACIAR CARRITO
function clearCart() {
    if (cart.length === 0) return;
    
    if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
        cart = [];
        saveCart();
        updateCartUI();
    }
}

// ✅ ACTUALIZAR UI DEL CARRITO
function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const emptyCartMessage = document.getElementById('emptyCartMessage');
    const cartFooter = document.getElementById('cartFooter');
    
    // Contar items totales
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    // Mostrar/ocultar badge
    const cartBadge = document.querySelector('.cart-badge');
    if (totalItems > 0) {
        cartBadge.style.display = 'flex';
    } else {
        cartBadge.style.display = 'none';
    }
    
    // Actualizar contenido del carrito
    if (cart.length === 0) {
        emptyCartMessage.style.display = 'block';
        cartFooter.style.display = 'none';
        cartItems.innerHTML = '';
    } else {
        emptyCartMessage.style.display = 'none';
        cartFooter.style.display = 'block';
        
        cartItems.innerHTML = cart.map(item => {
            // Calcular precio total por item
            const itemTotal = item.price * item.quantity;
            
            // Mostrar información adicional para tipo 2
            const variantInfo = item.variantName ? 
                `<p class="cart-item-variant">Variante: ${item.variantName}</p>` : '';
            
            const quantityInfo = item.displayQuantity ? 
                `<span class="cart-item-units">${item.displayQuantity} unidad(es)</span>` : '';

            return `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <h4 class="cart-item-name">${item.name}</h4>
                        <p class="cart-item-category">${item.category}</p>
                        ${variantInfo}
                        <p class="cart-item-price">${formatPrice(itemTotal)}</p>
                        ${quantityInfo}
                    </div>
                    <div class="cart-item-controls">
                        <div class="quantity-controls">
                            <button onclick="updateQuantity('${item.id}', -1, ${item.price}, '${item.uniqueId}')" class="qty-btn">−</button>
                            <span class="quantity">${item.quantity}</span>
                            <button onclick="updateQuantity('${item.id}', 1, ${item.price}, '${item.uniqueId}')" class="qty-btn">+</button>
                        </div>
                        <button onclick="removeFromCart('${item.id}', ${item.price}, '${item.uniqueId}')" class="remove-btn" title="Eliminar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Calcular total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = formatPrice(total);
}

// ✅ TOGGLE CARRITO (MINIMIZAR/MAXIMIZAR)
function toggleCart() {
    const cartPanel = document.getElementById('cartPanel');
    cartPanel.classList.toggle('minimized');
    
    const toggleIcon = document.querySelector('.cart-toggle-icon');
    if (cartPanel.classList.contains('minimized')) {
        toggleIcon.innerHTML = '▲';
    } else {
        toggleIcon.innerHTML = '▼';
    }
}

// ✅ NOTIFICACIÓN AL AGREGAR AL CARRITO
function showCartNotification(productName) {
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Agregado al carrito: ${productName}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}

// ✅ PROCESAR COMPRA - ENVIAR A WHATSAPP
function checkout() {
    if (cart.length === 0) return;

    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Construir mensaje para WhatsApp
    let message = encodeURIComponent(`🛒 *NUEVA COMPRA*\n\n`);
    message += encodeURIComponent(`*Lista de productos:*\n`);
    message += encodeURIComponent(`─────────────────\n`);

    cart.forEach((item, index) => {
        const itemSubtotal = item.price * item.quantity;
        message += encodeURIComponent(`${index + 1}. ${item.name}\n`);
        message += encodeURIComponent(`   • Precio: ${formatPrice(item.price)}\n`);
        message += encodeURIComponent(`   • Cantidad: ${item.quantity}\n`);
        if (item.variantName) {
            message += encodeURIComponent(`   • Variante: ${item.variantName}\n`);
        }
        message += encodeURIComponent(`   • Subtotal: ${formatPrice(itemSubtotal)}\n`);
        message += encodeURIComponent(`─────────────────\n`);
    });

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    message += encodeURIComponent(`📦 *Total de artículos:* ${itemCount}\n`);
    message += encodeURIComponent(`💰 *TOTAL A PAGAR:* ${formatPrice(total)}\n\n`);
    message += encodeURIComponent(`Por favor confirmar disponibilidad. Gracias! 🙏`);

    // Obtener número de WhatsApp desde la configuración
    const phoneNumber = config.whatsapp?.numero || '56954678849';

    // Abrir WhatsApp con el mensaje
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');

    // Opcional: Vaciar el carrito después de enviar a WhatsApp
    // clearCart();
}

async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    // ✅ MODO ESTÁTICO: usar products.json si window.STATIC_MODE está activo
    const endpoint = window.STATIC_MODE ? './products.json' : '/api/products';
    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Error al cargar productos');
        allProducts = await response.json();
        populateCategories();
        renderProducts(allProducts);
        grid.classList.remove('loading');
        grid.classList.add('loaded');
    } catch (error) {
        console.error('Error:', error);
        grid.innerHTML = `<div class="no-results"><p>Error al cargar los productos.</p></div>`;
        grid.classList.remove('loading');
    }
}

function formatPrice(price) {
    return '$' + price.toFixed(2);
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

function createProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('data-category', product.category);
    card.setAttribute('data-id', product.id);

    // ✅ IMAGEN CLICKEABLE CON OVERLAY "VER DETALLES" + BOTÓN AGREGAR AL CARRITO
    // ✅ MOSTRAR VARIABLE SI ES UNA VARIANTE
    const variableBadge = product.isVariable
        ? `<span class="variable-badge">${product.variableName}</span>`
        : '';

    // ✅ MOSTRAR BOTÓN EXTRA PARA TIPO 1
    const templateButton = product.type === '1'
        ? `<button class="add-to-cart-btn template-btn" onclick="event.stopPropagation(); addTemplateOnly('${product.id}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            ${formatPrice(roundTo90(config.tipos['1']?.precioPlantillaDigital || 5))} - Plantilla Digital
           </button>`
        : '';

    // ✅ APLICAR REDONDEO A 90 PARA TIPO 1
    const displayPrice = product.type === '1' ? roundTo90(product.price) : product.price;

    card.innerHTML = `
        <div class="product-image-wrapper" onclick="showProductDetails('${product.id}')">
            <img src="${product.mainImage}"
                 alt="${product.name}"
                 class="product-image"
                 width="280"
                 height="250"
                 loading="lazy"
                 decoding="async">
            <div class="image-overlay">
                <span class="overlay-text">Ver Detalles</span>
            </div>
            ${variableBadge}
        </div>
        <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <span class="product-category">${product.category}</span>
            <div class="product-price">${formatPrice(displayPrice)}</div>
            <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${product.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                Agregar al Carrito
            </button>
            ${templateButton}
        </div>
    `;
    return card;
}

function renderProducts(productsToRender) {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    if (productsToRender.length === 0) {
        grid.innerHTML = '<div class="no-results">No se encontraron productos.</div>';
        return;
    }
    productsToRender.forEach(product => grid.appendChild(createProductCard(product)));
}

function populateCategories() {
    const categoryFilter = document.getElementById('categoryFilter');
    const categories = [...new Set(allProducts.map(p => p.category))];
    categoryFilter.innerHTML = '<option value="all">Todas las categorías</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

function filterProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const selectedCategory = document.getElementById('categoryFilter').value;
    const filteredProducts = allProducts.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                             product.description.toLowerCase().includes(searchTerm);
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });
    renderProducts(filteredProducts);
}

// ✅ CARRUSEL DE IMÁGENES MEJORADO
let currentImageIndex = 0;

function showProductDetails(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    // ✅ GUARDAR REFERENCIA DEL PRODUCTO ACTUAL
    window.currentProduct = product;

    currentImageIndex = 0;
    const modalBody = document.getElementById('modalBody');

    // ✅ PARA TIPO 2: Mostrar todas las imágenes como variantes
    let imagesHtml = '';
    const hasMultipleImages = product.type === '2' ? 
        (product.allVariants && product.allVariants.length > 1) : 
        (product.images && product.images.length > 1);

    if (hasMultipleImages) {
        // Carrusel con controles
        imagesHtml = `
            <div class="carousel-container">
                <div class="carousel-main">
                    <button class="carousel-btn carousel-prev" onclick="navigateCarousel(-1)" aria-label="Imagen anterior">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>

                    <div class="carousel-image-wrapper">
                        <img src="${product.type === '2' ? product.allVariants[0] : product.images[0]}"
                             alt="${product.name}"
                             class="carousel-main-image"
                             id="carouselMainImage"
                             width="500"
                             height="400"
                             decoding="async">
                        <div class="carousel-counter">
                            <span id="currentImageNum">1</span> / ${product.type === '2' ? product.allVariants.length : product.images.length}
                        </div>
                    </div>

                    <button class="carousel-btn carousel-next" onclick="navigateCarousel(1)" aria-label="Imagen siguiente">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>

                <div class="carousel-thumbnails">
                    ${(product.type === '2' ? product.allVariants : product.images).map((img, idx) => `
                        <img src="${img}"
                             alt="${product.name} ${idx + 1}"
                             class="carousel-thumbnail ${idx === 0 ? 'active' : ''}"
                             data-index="${idx}"
                             width="80"
                             height="80"
                             loading="lazy"
                             decoding="async"
                             onclick="jumpToImage(${idx})">
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        // Imagen única
        imagesHtml = `
            <div class="single-image-container">
                <img src="${product.mainImage}"
                     alt="${product.name}"
                     class="modal-image"
                     width="500"
                     height="400"
                     decoding="async">
            </div>
        `;
    }

    // Crear lista de especificaciones
    const specsHtml = product.specs && product.specs.length > 0
        ? `<ul class="product-specs">
            ${product.specs.map(spec => `<li>${spec}</li>`).join('')}
           </ul>`
        : '';

    // ✅ MOSTRAR VARIABLE SI ES UNA VARIANTE
    const variableBadge = product.isVariable
        ? `<span class="variable-badge variable-badge-modal">${product.variableName}</span>`
        : '';

    // ✅ TIPO 1: MOSTRAR BOTÓN EXTRA "SÓLO PLANTILLA DIGITAL"
    const templateButtonHtml = product.type === '1'
        ? `<button class="add-to-cart-btn add-to-cart-modal template-btn" onclick="addTemplateOnly('${product.id}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            ${formatPrice(roundTo90(config.tipos['1']?.precioPlantillaDigital || 5))} - Sóla Plantilla Digital
           </button>`
        : '';

    // ✅ APLICAR REDONDEO A 90 PARA TIPO 1 EN EL MODAL
    const modalDisplayPrice = product.type === '1' ? roundTo90(product.price) : product.price;

    // ✅ TIPO 2: SELECTOR DE IMÁGENES COMO VARIANTES
    let variantSelectorHtml = '';
    if (product.type === '2' && product.allVariants && product.allVariants.length > 1) {
        variantSelectorHtml = `
            <div class="image-variant-selector">
                <label>Seleccionar Variante:</label>
                <div class="variant-images">
                    ${product.allVariants.map((img, idx) => {
                        // Buscar el producto correspondiente a esta imagen
                        const variantProduct = allProducts.find(p => 
                            p.parentProduct === product.parentProduct && 
                            p.images && p.images[0] === img
                        );
                        const variantName = variantProduct ? variantProduct.variableName : `Variante ${idx + 1}`;
                        return `
                            <div class="variant-image-container ${product.mainImage === img ? 'selected' : ''}" 
                                 onclick="selectImageVariant('${product.parentProduct || product.id}', ${idx})"
                                 title="${variantName}">
                                <img src="${img}" alt="${variantName}" class="variant-thumbnail">
                                <span class="variant-tooltip">${variantName}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ✅ TIPO 2: MOSTRAR SELECTOR DE UNIDADES CON BOTONES DE 100, 10, 1
    const quantitySelectorHtml = product.type === '2'
        ? `<div class="quantity-selector">
            <label for="productQuantity">Cantidad:</label>
            <div class="quantity-input-wrapper">
                <button class="qty-input-btn" onclick="adjustModalQuantity(-100)">-100</button>
                <button class="qty-input-btn" onclick="adjustModalQuantity(-10)">-10</button>
                <button class="qty-input-btn" onclick="adjustModalQuantity(-1)">-1</button>
                <input type="number" id="productQuantity" value="1" min="1" class="quantity-input" 
                       onchange="updateModalPrice()" step="1">
                <button class="qty-input-btn" onclick="adjustModalQuantity(1)">+1</button>
                <button class="qty-input-btn" onclick="adjustModalQuantity(10)">+10</button>
                <button class="qty-input-btn" onclick="adjustModalQuantity(100)">+100</button>
            </div>
            <span class="unit-price">Precio unitario: ${formatPrice(product.price)}</span>
           </div>`
        : '';

    // ✅ MOSTRAR PRECIO CALCULADO PARA TIPO 2
    const priceDisplayHtml = product.type === '2'
        ? `<div class="modal-price modal-price-total">
            Total: <span id="modalTotalPrice">${formatPrice(product.price)}</span>
           </div>`
        : `<div class="modal-price">${formatPrice(modalDisplayPrice)}</div>`;

    modalBody.innerHTML = `
        ${imagesHtml}
        <div class="modal-details">
            <h2 class="modal-title">${product.name}</h2>
            ${variableBadge}
            <span class="modal-category">${product.category}</span>
            <p class="modal-description">${product.description}</p>
            ${specsHtml}
            ${variantSelectorHtml}
            ${quantitySelectorHtml}
            ${priceDisplayHtml}
            <button class="add-to-cart-btn add-to-cart-modal" onclick="addToCartWithQuantity('${product.id}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                Agregar al Carrito
            </button>
            ${templateButtonHtml}
        </div>
    `;

    // Guardar referencia a las imágenes para el carrusel
    window.currentProductImages = product.type === '2' ? product.allVariants : (product.images || [product.mainImage]);

    document.getElementById('productModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

// ✅ NUEVO: SELECCIONAR VARIANTE POR IMAGEN (PARA TIPO 2)
function selectImageVariant(parentProductId, imageIndex) {
    // Buscar todas las variantes de este producto padre en allProducts
    const variants = allProducts.filter(p =>
        (p.parentProduct === parentProductId || p.id.startsWith(parentProductId)) && p.type === '2'
    );

    // Si hay variantes en allProducts, buscar la que corresponde a esta imagen
    if (variants.length > 0) {
        const targetImage = window.currentProductImages[imageIndex];
        const selectedVariant = variants.find(v => v.mainImage === targetImage);

        if (selectedVariant) {
            window.currentProduct = selectedVariant;
        }
    }

    // Actualizar imagen en el carrusel
    currentImageIndex = imageIndex;
    updateCarouselImage();

    // Actualizar miniaturas seleccionadas
    document.querySelectorAll('.variant-image-container').forEach((container, idx) => {
        container.classList.toggle('selected', idx === imageIndex);
    });

    // Actualizar precio si es tipo 2
    if (window.currentProduct && window.currentProduct.type === '2') {
        const quantityInput = document.getElementById('productQuantity');
        const quantity = parseInt(quantityInput?.value) || 1;
        const totalPriceEl = document.getElementById('modalTotalPrice');

        // Extraer nombre de la variante del nombre del archivo de imagen
        const targetImage = window.currentProductImages[imageIndex];
        const fileName = targetImage.substring(targetImage.lastIndexOf('/') + 1, targetImage.lastIndexOf('.'));
        let variantName = fileName.replace(/_/g, ' ').replace(/-/g, ' ').trim();
        if (!variantName || variantName === '' || variantName.toLowerCase() === 'image') {
            variantName = `Variante ${imageIndex + 1}`;
        }
        if (imageIndex === 0) variantName = "Standard";

        // Actualizar el nombre de la variante en el producto actual
        window.currentProduct.variableName = variantName;
        window.currentProduct.mainImage = targetImage;

        if (totalPriceEl) {
            totalPriceEl.textContent = formatPrice(window.currentProduct.price * quantity);
        }
    }
}

// ✅ NUEVO: AGREGAR AL CARRITO CON CANTIDAD (PARA TIPO 2)
function addToCartWithQuantity(productId) {
    const product = window.currentProduct || allProducts.find(p => p.id === productId);
    if (!product) return;

    if (product.type === '2') {
        const quantityInput = document.getElementById('productQuantity');
        const quantity = parseInt(quantityInput?.value) || 1;

        // Calcular precio total
        const totalPrice = product.price * quantity;

        // ✅ CORRECCIÓN: Obtener la imagen actual directamente del carrusel
        const currentImage = window.currentProductImages[currentImageIndex];

        // Extraer nombre de la variante de la imagen actual
        const fileName = currentImage ? currentImage.substring(currentImage.lastIndexOf('/') + 1, currentImage.lastIndexOf('.')) : '';
        let variantName = fileName.replace(/_/g, ' ').replace(/-/g, ' ').trim();
        if (!variantName || variantName === '' || variantName.toLowerCase() === 'image') {
            variantName = `Variante ${currentImageIndex + 1}`;
        }
        if (currentImageIndex === 0) {
            variantName = "Standard";
        }

        // ✅ CREAR UN ID ÚNICO BASADO EN:
        // - ID base del producto
        // - Imagen de la variante (NO la cantidad)
        const uniqueId = `${product.id}-${currentImage}`;

        // ✅ Verificar si ya existe esta variante en el carrito
        const existingItem = cart.find(item => item.uniqueId === uniqueId);

        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({
                uniqueId: uniqueId,
                id: product.id,
                name: product.name,
                price: totalPrice,
                image: currentImage,
                category: product.category,
                quantity: 1,
                unitMultiplier: quantity,
                basePrice: product.price,
                displayQuantity: quantity,
                variantName: variantName,
                variantImage: currentImage,
                type: '2'
            });
        }

        saveCart();
        updateCartUI();
        showCartNotification(`${product.name} (${variantName}) x${quantity}`);
        closeModal();
    } else {
        // Para otros tipos, comportamiento normal
        addToCart(product.id);
        closeModal();
    }
}

// ✅ NUEVO: AJUSTAR CANTIDAD EN MÚLTIPLOS DE 100, 10, 1 (PARA TIPO 2)
function adjustModalQuantity(change) {
    const product = window.currentProduct;
    if (!product || product.type !== '2') return;

    const quantityInput = document.getElementById('productQuantity');
    const totalPriceEl = document.getElementById('modalTotalPrice');

    if (!quantityInput) return;

    let currentValue = parseInt(quantityInput.value) || 1;
    currentValue = Math.max(1, currentValue + change);
    quantityInput.value = currentValue;

    // Actualizar precio total
    if (totalPriceEl) {
        const totalPrice = product.price * currentValue;
        totalPriceEl.textContent = formatPrice(totalPrice);
    }
}

// ✅ NUEVO: ACTUALIZAR PRECIO EN MODAL (PARA TIPO 2)
function updateModalPrice() {
    const product = window.currentProduct;
    if (!product || product.type !== '2') return;

    const quantityInput = document.getElementById('productQuantity');
    const totalPriceEl = document.getElementById('modalTotalPrice');

    if (!quantityInput) return;

    let currentValue = parseInt(quantityInput.value) || 1;
    currentValue = Math.max(1, currentValue);

    // Actualizar precio total
    if (totalPriceEl) {
        const totalPrice = product.price * currentValue;
        totalPriceEl.textContent = formatPrice(totalPrice);
    }
}

// ✅ FUNCIONES DEL CARRUSEL
function navigateCarousel(direction) {
    const totalImages = window.currentProductImages.length;
    currentImageIndex = (currentImageIndex + direction + totalImages) % totalImages;
    updateCarouselImage();
}

function jumpToImage(index) {
    currentImageIndex = index;
    updateCarouselImage();
}

function updateCarouselImage() {
    const mainImage = document.getElementById('carouselMainImage');
    const counter = document.getElementById('currentImageNum');
    const thumbnails = document.querySelectorAll('.carousel-thumbnail');
    
    if (mainImage && window.currentProductImages) {
        mainImage.src = window.currentProductImages[currentImageIndex];
        
        if (counter) {
            counter.textContent = currentImageIndex + 1;
        }
        
        // Actualizar miniaturas activas
        thumbnails.forEach((thumb, idx) => {
            thumb.classList.toggle('active', idx === currentImageIndex);
        });
        
        // Si es tipo 2, también actualizar el selector de variantes
        if (window.currentProduct && window.currentProduct.type === '2') {
            document.querySelectorAll('.variant-image-container').forEach((container, idx) => {
                container.classList.toggle('selected', idx === currentImageIndex);
            });
            
            // Actualizar el producto actual a la variante seleccionada
            const parentProductId = window.currentProduct.parentProduct || window.currentProduct.id;
            selectImageVariant(parentProductId, currentImageIndex);
        }
    }
}

function closeModal() {
    document.getElementById('productModal').classList.remove('show');
    document.body.style.overflow = 'auto';
    currentImageIndex = 0;
}

// Soporte para teclas de navegación
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('productModal');
    if (modal.classList.contains('show')) {
        if (e.key === 'ArrowLeft') {
            navigateCarousel(-1);
        } else if (e.key === 'ArrowRight') {
            navigateCarousel(1);
        } else if (e.key === 'Escape') {
            closeModal();
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    loadCart(); // ✅ CARGAR CARRITO AL INICIAR
    loadConfig(); // ✅ CARGAR CONFIGURACIÓN
    loadProducts();
    document.getElementById('searchInput').addEventListener('input', filterProducts);
    document.getElementById('categoryFilter').addEventListener('change', filterProducts);
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target.id === 'productModal') closeModal(); });
});

// ✅ CARGAR CONFIGURACIÓN DESDE EL SERVIDOR O ARCHIVO ESTÁTICO
async function loadConfig() {
    // ✅ MODO ESTÁTICO: usar config.json si window.STATIC_MODE está activo
    const endpoint = window.STATIC_MODE ? './config.json' : '/api/config';
    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Error al cargar configuración');
        config = await response.json();
        console.log('✅ Configuración cargada:', config);
    } catch (error) {
        console.warn('Warning: No se pudo cargar config.json, usando valores por defecto');
    }
}