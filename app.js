// =====================================================================
// FRONTEND: LOGICA CLIENTE (CAPA 1: PRESENTACIÓN)
// =====================================================================

// Determinación inteligente del endpoint de la API
const API_BASE = window.location.port === '8080'
  ? '/api'
  : (window.location.origin.includes('http') && window.location.port === ''
      ? '/api' // Servido detrás de Nginx en puerto 80 (Producción / EC2 / Docker)
      : 'http://localhost:8080/api'); // Entorno directo de desarrollo local

// Estado de la aplicación
const state = {
  products: [],
  categories: [],
  cart: [],
  selectedCategory: '',
  searchQuery: '',
  health: null
};

// Elementos del DOM
const elements = {
  productsGrid: document.getElementById('productsGrid'),
  productsCount: document.getElementById('productsCount'),
  emptyState: document.getElementById('emptyState'),
  categoriesContainer: document.getElementById('categoriesContainer'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  cartBadge: document.getElementById('cartBadge'),
  btnOpenCart: document.getElementById('btnOpenCart'),
  btnCloseCart: document.getElementById('btnCloseCart'),
  cartModal: document.getElementById('cartModal'),
  cartItemsList: document.getElementById('cartItemsList'),
  cartSubtotal: document.getElementById('cartSubtotal'),
  cartTax: document.getElementById('cartTax'),
  cartTotal: document.getElementById('cartTotal'),
  checkoutForm: document.getElementById('checkoutForm'),
  tierAppStatus: document.getElementById('tierAppStatus'),
  tierAppLabel: document.getElementById('tierAppLabel'),
  tierDbStatus: document.getElementById('tierDbStatus'),
  tierDbLabel: document.getElementById('tierDbLabel'),
  btnOpenDiag: document.getElementById('btnOpenDiag'),
  btnCloseDiag: document.getElementById('btnCloseDiag'),
  diagModal: document.getElementById('diagModal'),
  diagApp: document.getElementById('diagApp'),
  diagDb: document.getElementById('diagDb'),
  diagLatency: document.getElementById('diagLatency'),
  diagJson: document.getElementById('diagJson'),
  btnOpenNewProduct: document.getElementById('btnOpenNewProduct'),
  btnCloseNewProduct: document.getElementById('btnCloseNewProduct'),
  newProductModal: document.getElementById('newProductModal'),
  newProductForm: document.getElementById('newProductForm')
};

// =====================================================================
// INICIALIZACIÓN
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadCartFromStorage();
  checkSystemHealth();
  loadCategories();
  loadProducts();

  // Polling de salud cada 15 segundos
  setInterval(checkSystemHealth, 15000);
});

// =====================================================================
// EVENT LISTENERS
// =====================================================================
function setupEventListeners() {
  // Búsqueda
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    loadProducts();
  });

  elements.searchBtn.addEventListener('click', () => {
    state.searchQuery = elements.searchInput.value.trim();
    loadProducts();
  });

  // Modales
  elements.btnOpenCart.addEventListener('click', () => openModal(elements.cartModal));
  elements.btnCloseCart.addEventListener('click', () => closeModal(elements.cartModal));
  elements.cartModal.addEventListener('click', (e) => {
    if (e.target === elements.cartModal) closeModal(elements.cartModal);
  });

  elements.btnOpenDiag.addEventListener('click', () => {
    checkSystemHealth();
    openModal(elements.diagModal);
  });
  elements.btnCloseDiag.addEventListener('click', () => closeModal(elements.diagModal));
  elements.diagModal.addEventListener('click', (e) => {
    if (e.target === elements.diagModal) closeModal(elements.diagModal);
  });

  elements.btnOpenNewProduct.addEventListener('click', () => openModal(elements.newProductModal));
  elements.btnCloseNewProduct.addEventListener('click', () => closeModal(elements.newProductModal));
  elements.newProductModal.addEventListener('click', (e) => {
    if (e.target === elements.newProductModal) closeModal(elements.newProductModal);
  });

  // Formularios
  elements.checkoutForm.addEventListener('submit', handleCheckout);
  elements.newProductForm.addEventListener('submit', handleCreateProduct);
}

function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
}

// =====================================================================
// VERIFICACIÓN DE ESTADO DE LAS 3 CAPAS (HEALTHCHECK)
// =====================================================================
async function checkSystemHealth() {
  const startTime = performance.now();
  try {
    const res = await fetch(`${API_BASE}/health`);
    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json();
      state.health = data;

      // Capa 2: Backend
      updateTierStatus(
        elements.tierAppStatus,
        'online',
        `Capa 2: App (${data.architecture.tier2_app.hostname || '8080'})`
      );
      elements.diagApp.textContent = `Online (${latency} ms)`;
      elements.diagApp.style.color = '#10b981';

      // Capa 3: Base de Datos
      const dbInfo = data.architecture.tier3_db;
      const isDbConnected = dbInfo.usingFallback === false;
      
      updateTierStatus(
        elements.tierDbStatus,
        isDbConnected ? 'online' : 'checking',
        isDbConnected ? 'Capa 3: RDS PostgreSQL' : 'Capa 3: Mock Local'
      );

      elements.diagDb.textContent = dbInfo.status;
      elements.diagDb.style.color = isDbConnected ? '#10b981' : '#f59e0b';
      elements.diagLatency.textContent = `${latency} ms`;
      elements.diagJson.textContent = JSON.stringify(data, null, 2);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    updateTierStatus(elements.tierAppStatus, 'offline', 'Capa 2: Desconectada');
    updateTierStatus(elements.tierDbStatus, 'offline', 'Capa 3: Inaccesible');

    elements.diagApp.textContent = 'Desconectado';
    elements.diagApp.style.color = '#ef4444';
    elements.diagDb.textContent = 'Inaccesible';
    elements.diagDb.style.color = '#ef4444';
    elements.diagLatency.textContent = 'Error';
    elements.diagJson.textContent = JSON.stringify({
      error: 'No se puede contactar a la Capa 2 (Backend)',
      details: err.message,
      target_endpoint: `${API_BASE}/health`,
      solution: 'Verifique que el backend esté corriendo en el puerto 8080 y la regla de seguridad app_sg.'
    }, null, 2);
  }
}

function updateTierStatus(container, stateClass, text) {
  const dot = container.querySelector('.dot');
  const label = container.querySelector('.tier-label');
  if (dot) {
    dot.className = `dot ${stateClass}`;
  }
  if (label && text) {
    label.textContent = text;
  }
}

// =====================================================================
// CARGAR CATEGORÍAS
// =====================================================================
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      state.categories = json.data;
      renderCategories();
    }
  } catch (err) {
    console.warn('No se pudieron cargar categorías desde la API:', err);
  }
}

function renderCategories() {
  elements.categoriesContainer.innerHTML = `
    <button class="cat-pill ${state.selectedCategory === '' ? 'active' : ''}" data-id="">
      Todas las categorías
    </button>
  `;

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-pill ${state.selectedCategory === String(cat.id) ? 'active' : ''}`;
    btn.dataset.id = cat.id;
    btn.textContent = cat.name;
    elements.categoriesContainer.appendChild(btn);
  });

  // Agregar evento a cada botón de categoría
  elements.categoriesContainer.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.categoriesContainer.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCategory = btn.dataset.id;
      loadProducts();
    });
  });
}

// =====================================================================
// CARGAR PRODUCTOS
// =====================================================================
async function loadProducts() {
  elements.productsCount.textContent = 'Consultando Capa 2 & 3...';
  
  let url = `${API_BASE}/products?`;
  if (state.selectedCategory) {
    url += `category_id=${encodeURIComponent(state.selectedCategory)}&`;
  }
  if (state.searchQuery) {
    url += `search=${encodeURIComponent(state.searchQuery)}&`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al obtener productos');
    const json = await res.json();

    state.products = json.data || [];
    renderProducts();
  } catch (err) {
    console.error('Error cargando catálogo:', err);
    elements.productsGrid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    elements.productsCount.textContent = 'Error de conexión con Backend';
  }
}

function renderProducts() {
  elements.productsGrid.innerHTML = '';

  if (state.products.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.productsCount.textContent = '0 productos encontrados';
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.productsCount.textContent = `${state.products.length} productos disponibles`;

  state.products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';

    const isLowStock = p.stock <= 5 && p.stock > 0;
    const isOutOfStock = p.stock === 0;

    card.innerHTML = `
      <div class="product-image-container">
        <span class="category-tag">${p.category_name || 'General'}</span>
        <span>${p.image_url || '📦'}</span>
      </div>
      <div class="product-info">
        <h4 class="product-title">${escapeHtml(p.name)}</h4>
        <p class="product-desc">${escapeHtml(p.description || '')}</p>
        <div class="product-meta">
          <span class="product-price">$${parseFloat(p.price).toFixed(2)}</span>
          <span class="product-stock ${isLowStock ? 'low' : ''}">
            ${isOutOfStock ? 'Agotado' : `Stock: ${p.stock} uds`}
          </span>
        </div>
        <button class="btn-add-cart" data-id="${p.id}" ${isOutOfStock ? 'disabled' : ''}>
          ${isOutOfStock ? '❌ Agotado' : '🛒 Agregar al Carrito'}
        </button>
      </div>
    `;

    const addBtn = card.querySelector('.btn-add-cart');
    if (addBtn && !isOutOfStock) {
      addBtn.addEventListener('click', () => addToCart(p));
    }

    elements.productsGrid.appendChild(card);
  });
}

function resetFilters() {
  state.selectedCategory = '';
  state.searchQuery = '';
  elements.searchInput.value = '';
  renderCategories();
  loadProducts();
}

// =====================================================================
// GESTIÓN DEL CARRITO
// =====================================================================
function addToCart(product) {
  const existingItem = state.cart.find(item => item.product_id === product.id);

  if (existingItem) {
    if (existingItem.quantity < product.stock) {
      existingItem.quantity += 1;
    } else {
      alert(`No hay más stock disponible de ${product.name}`);
      return;
    }
  } else {
    state.cart.push({
      product_id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      quantity: 1,
      max_stock: product.stock
    });
  }

  saveCartToStorage();
  updateCartUI();
  // Feedback visual
  const originalText = elements.btnOpenCart.innerHTML;
  elements.btnOpenCart.style.backgroundColor = '#10b981';
  setTimeout(() => {
    elements.btnOpenCart.style.backgroundColor = '';
  }, 400);
}

function updateCartQuantity(productId, delta) {
  const itemIndex = state.cart.findIndex(i => i.product_id === productId);
  if (itemIndex === -1) return;

  const item = state.cart[itemIndex];
  const newQty = item.quantity + delta;

  if (newQty <= 0) {
    state.cart.splice(itemIndex, 1);
  } else if (newQty > item.max_stock) {
    alert(`Límite de stock alcanzado (${item.max_stock} unidades)`);
    return;
  } else {
    item.quantity = newQty;
  }

  saveCartToStorage();
  updateCartUI();
}

function updateCartUI() {
  // Cantidad total
  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  elements.cartBadge.textContent = totalCount;

  // Renderizar items en modal
  elements.cartItemsList.innerHTML = '';
  if (state.cart.length === 0) {
    elements.cartItemsList.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px 0;">El carrito está vacío.</p>';
    elements.cartSubtotal.textContent = '$0.00';
    elements.cartTax.textContent = '$0.00';
    elements.cartTotal.textContent = '$0.00';
    return;
  }

  let subtotal = 0;
  state.cart.forEach(item => {
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <strong>${escapeHtml(item.name)}</strong>
        <small>$${item.price.toFixed(2)} c/u &times; ${item.quantity} = $${itemSubtotal.toFixed(2)}</small>
      </div>
      <div class="cart-item-ctrls">
        <button class="btn-qty-minus" data-id="${item.product_id}">-</button>
        <span>${item.quantity}</span>
        <button class="btn-qty-plus" data-id="${item.product_id}">+</button>
      </div>
    `;

    row.querySelector('.btn-qty-minus').addEventListener('click', () => updateCartQuantity(item.product_id, -1));
    row.querySelector('.btn-qty-plus').addEventListener('click', () => updateCartQuantity(item.product_id, 1));
    elements.cartItemsList.appendChild(row);
  });

  const tax = subtotal * 0.19;
  const total = subtotal + tax;

  elements.cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
  elements.cartTax.textContent = `$${tax.toFixed(2)}`;
  elements.cartTotal.textContent = `$${total.toFixed(2)}`;
}

function saveCartToStorage() {
  localStorage.setItem('cloudstore_cart', JSON.stringify(state.cart));
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('cloudstore_cart');
    if (saved) {
      state.cart = JSON.parse(saved);
      updateCartUI();
    }
  } catch (e) {
    state.cart = [];
  }
}

// =====================================================================
// REGISTRO DE PEDIDO (CHECKOUT)
// =====================================================================
async function handleCheckout(e) {
  e.preventDefault();

  if (state.cart.length === 0) {
    alert('Agrega al menos un producto a tu carrito antes de continuar.');
    return;
  }

  const payload = {
    customer_name: document.getElementById('custName').value.trim(),
    customer_email: document.getElementById('custEmail').value.trim(),
    customer_address: document.getElementById('custAddress').value.trim(),
    items: state.cart.map(item => ({
      product_id: item.product_id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }))
  };

  const btnConfirm = document.getElementById('btnConfirmOrder');
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Enviando a Capa 2 y persistiendo en Capa 3...';

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (res.ok && result.success) {
      alert(`🎉 ¡Pedido Confirmado con Éxito!\n\nID del Pedido: #${result.order.id}\nTotal: $${result.order.total.toFixed(2)}\nCliente: ${result.order.customer_name}\n\nLos datos fueron procesados por la Capa de Lógica y guardados en PostgreSQL.`);
      state.cart = [];
      saveCartToStorage();
      updateCartUI();
      closeModal(elements.cartModal);
      elements.checkoutForm.reset();
      loadProducts(); // Actualizar stock
    } else {
      alert(`Error al registrar pedido: ${result.message || 'Error desconocido'}`);
    }
  } catch (err) {
    alert(`Error de red con la Capa 2: ${err.message}`);
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = '🚀 Confirmar Pedido en Capa 2 y 3';
  }
}

// =====================================================================
// REGISTRAR NUEVO PRODUCTO
// =====================================================================
async function handleCreateProduct(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('prodName').value.trim(),
    category_id: parseInt(document.getElementById('prodCategory').value, 10),
    image_url: document.getElementById('prodEmoji').value.trim() || '📦',
    price: parseFloat(document.getElementById('prodPrice').value),
    stock: parseInt(document.getElementById('prodStock').value, 10),
    description: document.getElementById('prodDesc').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ Producto "${data.data.name}" creado y persistido exitosamente en la Capa 3.`);
      closeModal(elements.newProductModal);
      elements.newProductForm.reset();
      loadProducts();
    } else {
      alert(`Error al guardar: ${data.message || 'Error de datos'}`);
    }
  } catch (err) {
    alert(`Error de comunicación con Backend: ${err.message}`);
  }
}

// Utilidad para prevenir inyección HTML en renderizado
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

