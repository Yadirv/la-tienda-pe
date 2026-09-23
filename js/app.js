/**
 * La Tienda Pet - Orquestador Completo de Lógica de Negocio
 * Funcionalidades:
 * 1. Resolución de imágenes desde /imagenes/{filename} con fallback visual
 * 2. Árbol de Navegación Jerárquico (Nivel 1 Categoría -> Nivel 2 Marca) en Desktop y Menú Hamburguesa Móvil
 * 3. Máximo aprovechamiento de pantalla en Desktop (1920px Full-Width)
 * 4. Remoción total del campo "Proveedor"
 * 5. Modo Descuento (% OFF Sticker + Precios Tachados)
 * 6. Toggle Slide IVA (Sin IVA / Con IVA)
 */

// Configuración de Supabase
const SUPABASE_URL = "https://qkzhopjfrlyvqfievcfi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo";

// Resolver URL de Imágenes Locales (/imagenes/{filename}) o HTTP
function resolveImageUrl(rawUrl) {
    if (!rawUrl) return '';
    const str = String(rawUrl).trim();
    if (str.startsWith('http://') || str.startsWith('https://')) return str;

    // Extraer nombre del archivo si contiene ruta
    const filename = str.split('/').pop();
    if (filename) {
        return `imagenes/${filename}`;
    }
    return '';
}

// Mapeo del esquema real de la tabla 'petpro_productos'
function mapSupabaseProduct(p) {
    let especieKey = 'dogs';
    if (p.especie) {
        const esp = String(p.especie).toLowerCase();
        if (esp.includes('gato') || esp.includes('cat')) especieKey = 'cats';
        else if (esp.includes('perro') || esp.includes('dog')) especieKey = 'dogs';
    }

    const categoriaRaw = p.categoria ? String(p.categoria).trim() : 'VARIOS';
    const marcaRaw = p.marca ? String(p.marca).trim() : 'VITALPETS';

    // Descuento (% OFF)
    const dcto = parseFloat(p.dcto_b2b || p.dcto) || 0;
    const hasDiscount = dcto > 0;
    const dctoPercent = Math.round(dcto * 100);

    // Precios PVP
    const rawConIva = p.precio_pvp_con_iva || p.precio_b2b_con_iva || p.price;
    const rawSinIva = p.precio_pvp_sin_iva || p.precio_b2b_sin_iva;

    const originalConIva = typeof rawConIva === 'number' ? rawConIva : (parseFloat(rawConIva) || 0);
    const originalSinIva = typeof rawSinIva === 'number' ? rawSinIva : (parseFloat(rawSinIva) || Math.round(originalConIva / 1.05));

    const finalConIva = hasDiscount ? originalConIva * (1 - dcto) : originalConIva;
    const finalSinIva = hasDiscount ? originalSinIva * (1 - dcto) : originalSinIva;

    const inventario = parseInt(p.inventario_b2c) || 0;
    const agotado = inventario <= 0;
    const destacado = p.producto_destacado || 'Bajo';

    return {
        id: p.ref || p.id || Math.random().toString(36).substr(2, 9),
        ref: p.ref || 'N/A',
        name: p.producto || p.name || 'Producto sin nombre',
        brand: marcaRaw,
        especie: p.especie || 'Mascota',
        especieKey: especieKey,
        categoria: categoriaRaw,
        descripcion: p.descripcion || p.datos_nutricionales || 'Producto nutricional y de bienestar para mascotas.',
        dcto: dcto,
        hasDiscount: hasDiscount,
        dctoPercent: dctoPercent,
        originalConIva: originalConIva,
        originalSinIva: originalSinIva,
        finalConIva: finalConIva,
        finalSinIva: finalSinIva,
        imageUrl: resolveImageUrl(p.imagen_url),
        inventario: inventario,
        agotado: agotado,
        destacado: destacado,
        promo_b2c: p.promo_b2c
    };
}

// Fallback local en caso de error de red
const MOCK_PRODUCTS = [
    { ref: "USA627 IN", producto: "INABA CAT SNACK CHURU CAJA 20 PIEZAS - POLLO 280 GR", marca: "INABA", categoria: "SNACKS", especie: "Gato", dcto_b2b: 0.08, precio_pvp_con_iva: 74151, precio_pvp_sin_iva: 70620, imagen_url: "USA627IN.jpg" },
    { ref: "USA652 IN", producto: "INABA CAT SNACK CHURU 50 PIEZAS - CHICKEN VARIETIES 700 GR", marca: "INABA", categoria: "SNACKS", especie: "Gato", dcto_b2b: 0.08, precio_pvp_con_iva: 175444, precio_pvp_sin_iva: 167090, imagen_url: "USA652IN.jpg" },
    { ref: "PET001", producto: "Alimento Adulto Mediano 15kg", marca: "Chunky", categoria: "ALIMENTOS SECOS", especie: "Perro", dcto_b2b: 0.05, precio_pvp_con_iva: 145000, precio_pvp_sin_iva: 138095, imagen_url: "" },
    { ref: "PET002", producto: "Arena Sanitaria Aglomerante 10kg", marca: "Scoopable", categoria: "ARENAS Y ARENEROS", especie: "Gato", dcto_b2b: 0, precio_pvp_con_iva: 52000, precio_pvp_sin_iva: 49523, imagen_url: "" }
].map(mapSupabaseProduct);

// Obtener productos de Supabase
async function fetchProducts() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            let allData = [];
            let isFetching = true;
            let offset = 0;
            const limit = 1000;

            while (isFetching) {
                const { data, error } = await client
                    .from('petpro_productos')
                    .select('*')
                    .eq('activo_b2c', true)
                    .gt('inventario_b2c', 0)
                    .range(offset, offset + limit - 1);

                if (error) {
                    console.error("⚠️ Supabase fetch error:", error);
                    break;
                }

                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    offset += limit;
                    // Si trae menos del límite, ya terminamos
                    if (data.length < limit) {
                        isFetching = false;
                    }
                } else {
                    isFetching = false;
                }
            }

            if (allData.length > 0) {
                console.log(`✅ Cargados ${allData.length} productos de Supabase con paginación.`);
                return allData.map(mapSupabaseProduct);
            }
        }
    } catch (err) {
        console.warn("⚠️ Supabase fallback warning:", err);
    }
    return MOCK_PRODUCTS;
}

// Estado Global
let currentProducts = [];
let selectedProductForModal = null;
let expandedCategories = new Set(); // Para controlar acordeones abiertos en el árbol

let state = {
    search: "",
    activeEspecie: "all",      // 'all', 'dogs', 'cats'
    selectedCategory: "all",   // Nivel 1 (Categoría)
    selectedMarca: "all",      // Nivel 2 (Marca dentro de la Categoría)
    sortBy: "price-asc",
    showIva: false,            // Con IVA (true) vs Sin IVA (false)
    currentPage: 1,
    itemsPerPage: 50
};

// Selectores DOM
const elements = {
    searchInput: document.getElementById('input-search'),
    categoryTreeNav: document.getElementById('category-tree'),
    mobileCategoryTreeNav: document.getElementById('mobile-category-tree'),
    btnResetTree: document.querySelectorAll('[data-action="reset-tree"]'),
    breadcrumbText: document.getElementById('breadcrumb-text'),
    breadcrumbCount: document.getElementById('breadcrumb-count'),
    selectSort: document.getElementById('select-sort'),
    toggleIva: document.getElementById('toggle-iva'),
    productGrid: document.getElementById('product-grid'),
    emptyCatalog: document.getElementById('empty-catalog'),
    modalDetail: document.getElementById('modal-product-detail'),
    modalContent: document.getElementById('product-detail-content'),
    closeDetailBtn: document.getElementById('close-product-detail'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalAddToCartBtn: document.getElementById('modal-add-to-cart-btn'),
    // Mobile Drawer
    btnMobileMenu: document.getElementById('btn-mobile-menu'),
    btnMobileCategories: document.getElementById('btn-mobile-categories'),
    mobileDrawer: document.getElementById('mobile-category-drawer'),
    closeMobileDrawerBtn: document.getElementById('close-mobile-drawer'),
    btnApplyMobileDrawer: document.getElementById('btn-apply-mobile-drawer'),
    mobileDrawerBackdrop: document.getElementById('mobile-drawer-backdrop')
};

// -------------------------------------------------------------
// ÁRBOL JERÁRQUICO (DESKTOP Y MÓVIL)
// -------------------------------------------------------------
function generateTreeHTML() {
    const treeData = {};

    currentProducts.forEach(p => {
        const cat = p.categoria || 'VARIOS';
        const marca = p.brand || 'OTRAS';

        if (!treeData[cat]) {
            treeData[cat] = {
                totalCount: 0,
                marcas: {}
            };
        }

        treeData[cat].totalCount += 1;
        treeData[cat].marcas[marca] = (treeData[cat].marcas[marca] || 0) + 1;
    });

    const sortedCategories = Object.keys(treeData).sort();

    let treeHTML = `
        <div class="category-tree-item border-b border-slate-100 pb-1.5 mb-1.5">
            <button data-action="select-all-tree" class="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${state.selectedCategory === 'all' && state.selectedMarca === 'all' ? 'bg-[#004E4A] text-white' : 'text-[#2C3E50] hover:bg-slate-100'}">
                <span class="flex items-center gap-1.5">
                    <span>📦 Todos los Productos</span>
                </span>
                <span class="text-[10px] opacity-75 font-mono">(${currentProducts.length})</span>
            </button>
        </div>
    `;

    sortedCategories.forEach(cat => {
        const catObj = treeData[cat];
        const isCatActive = state.selectedCategory === cat;
        const isExpanded = expandedCategories.has(cat);
        const marcasList = Object.keys(catObj.marcas).sort();

        treeHTML += `
            <div class="tree-category-group mb-1">
                <!-- NIVEL 1: CATEGORÍA -->
                <div class="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${isCatActive && state.selectedMarca === 'all' ? 'bg-[#004E4A] text-white shadow-xs' : 'text-[#2C3E50] hover:bg-slate-100'}">
                    <div data-action="select-level-1" data-cat="${cat}" class="flex-1 flex items-center gap-1.5 truncate">
                        <span class="text-[11px]">${isExpanded ? '📂' : '📁'}</span>
                        <span class="truncate">${cat}</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isCatActive && state.selectedMarca === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'} font-mono">${catObj.totalCount}</span>
                        <button data-action="toggle-tree-expand" data-cat="${cat}" class="p-0.5 hover:bg-black/10 rounded transition-transform text-slate-400">
                            ${isExpanded ? '▼' : '▶'}
                        </button>
                    </div>
                </div>

                <!-- NIVEL 2: MARCAS -->
                ${isExpanded ? `
                    <div class="tree-level-2 pl-4 pr-1 py-1 space-y-0.5 border-l-2 border-[#004E4A]/15 ml-3.5 my-0.5">
                        ${marcasList.map(marca => {
                            const isMarcaActive = isCatActive && state.selectedMarca === marca;
                            const count = catObj.marcas[marca];

                            return `
                                <button data-action="select-level-2" data-cat="${cat}" data-marca="${marca}" 
                                    class="w-full text-left px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between truncate ${isMarcaActive ? 'bg-[#54B435] text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-[#004E4A]'}">
                                    <span class="truncate">🏷️ ${marca}</span>
                                    <span class="text-[9px] opacity-75 font-mono ml-1">(${count})</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    return treeHTML;
}

function buildAndRenderCategoryTree() {
    const html = DOMPurify.sanitize(generateTreeHTML());
    if (elements.categoryTreeNav) elements.categoryTreeNav.innerHTML = html;
    if (elements.mobileCategoryTreeNav) elements.mobileCategoryTreeNav.innerHTML = html;
}

// Lógica de Filtrado por Especie ('all', 'dogs', 'cats', 'promo_gratis')
window.setCategory = function(especieKey) {
    if (state.activeEspecie === especieKey && especieKey !== 'all') {
        state.activeEspecie = 'all';
    } else {
        state.activeEspecie = especieKey;
    }
    expandedCategories.clear();
    buildAndRenderCategoryTree();
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const isActive = btn.dataset.cat === state.activeEspecie;
        if (isActive) {
            btn.classList.add('bg-[#004E4A]', 'text-white', 'border-[#004E4A]');
            btn.classList.remove('bg-[#F8F9FA]', 'text-[#2C3E50]', 'border-[#E2E8F0]', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        } else {
            btn.classList.remove('bg-[#004E4A]', 'text-white', 'border-[#004E4A]');
            if (btn.dataset.cat === 'promo_gratis') {
                btn.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
            } else {
                btn.classList.add('bg-[#F8F9FA]', 'text-[#2C3E50]', 'border-[#E2E8F0]');
            }
        }
    });
    renderCatalog();
};

function updateBreadcrumbs(totalFiltered) {
    if (!elements.breadcrumbText || !elements.breadcrumbCount) return;

    elements.breadcrumbCount.textContent = `${totalFiltered} productos`;

    if (state.selectedCategory === 'all' && state.selectedMarca === 'all') {
        elements.breadcrumbText.textContent = "Mostrando todos los productos";
    } else if (state.selectedCategory !== 'all' && state.selectedMarca === 'all') {
        elements.breadcrumbText.innerHTML = `Categoría: <strong class="text-[#004E4A]">${state.selectedCategory}</strong>`;
    } else {
        elements.breadcrumbText.innerHTML = `Categoría: <strong class="text-[#004E4A]">${state.selectedCategory}</strong> &gt; Marca: <strong class="text-[#54B435]">${state.selectedMarca}</strong>`;
    }
}

// Funciones de Vistas (SPA)
window.showCatalogView = function() {
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('catalog-view').classList.remove('hidden');
    window.scrollTo(0, 0);
};

window.showLandingView = function() {
    document.getElementById('catalog-view').classList.add('hidden');
    document.getElementById('landing-view').classList.remove('hidden');
    window.scrollTo(0, 0);
};

function createProductCardHTML(p) {
    const activeOriginal = state.showIva ? p.originalConIva : p.originalSinIva;
    const activeFinal = state.showIva ? p.finalConIva : p.finalSinIva;
    const activeLabel = state.showIva ? "PVP CON IVA" : "PVP SIN IVA";
    const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    // Truncate description safely
    const descText = p.descripcion ? p.descripcion.replace(/<[^>]*>?/gm, '') : '';

    return `
        <div data-product-id="${p.id}" class="product-card cursor-pointer bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col group relative">
            <div class="h-52 bg-[#F8F9FA] flex items-center justify-center overflow-hidden relative">
                ${p.ref !== 'N/A' ? `<span class="absolute top-2 left-2 bg-[#004E4A]/10 text-[#004E4A] text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10 font-mono">${p.ref}</span>` : ''}
                ${p.hasDiscount && !p.agotado ? `<div class="absolute top-2 right-2 bg-rose-500 text-white text-[11px] font-black px-2.5 py-1 rounded-lg shadow-md transform rotate-2 z-10 animate-pulse">¡${p.dctoPercent}% OFF!</div>` : ''}
                ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-6xl group-hover:scale-105 transition-transform duration-300\\'>${p.especieKey === 'dogs' ? '🐕' : '🐈'}</span>';">` : `<span class="text-6xl group-hover:scale-105 transition-transform duration-300">${p.especieKey === 'dogs' ? '🐕' : '🐈'}</span>`}
            </div>
            <div class="p-5 flex-1 flex flex-col">
                <div class="flex items-center justify-between gap-1 mb-1.5">
                    <span class="text-[#6C7A89] text-[10px] font-bold uppercase tracking-wider">${p.brand}</span>
                    <span class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full truncate max-w-[120px]">${p.categoria}</span>
                </div>
                ${p.promo_b2c === 'DOMICILIO_GRATIS' ? `<div class="mb-1.5"><span class="bg-purple-100 text-purple-700 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center inline-flex gap-1 w-max"><span class="text-xs">🎁</span> Domicilio Gratis</span></div>` : ''}
                <h3 class="text-[#2C3E50] font-bold text-sm leading-tight mb-1 line-clamp-2 group-hover:text-[#004E4A] transition-colors" title="${p.name}">${p.name}</h3>
                <p class="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed" title="${descText}">${descText}</p>
                
                <div class="mt-auto pt-3 flex items-center justify-between border-t border-[#E2E8F0]/60">
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="block text-[9px] text-[#6C7A89] font-bold uppercase">${activeLabel}</span>
                            ${!p.agotado ? `<span data-stock-badge class="text-[9px] text-[#54B435] font-medium bg-[#54B435]/10 px-1.5 rounded">Stock: ${p.inventario}</span>` : `<span data-stock-badge class="hidden"></span>`}
                        </div>
                        ${p.hasDiscount ? `
                            <div class="flex items-center gap-1.5">
                                <span class="line-through text-slate-400 text-xs">${fmt(activeOriginal)}</span>
                                <span class="text-rose-600 font-bold text-lg leading-tight">${fmt(activeFinal)}</span>
                            </div>
                        ` : `<span class="text-[#004E4A] font-bold text-lg leading-tight">${fmt(activeOriginal)}</span>`}
                    </div>
                    ${p.agotado 
                        ? `<div class="flex flex-col items-end gap-1">
                                <span class="badge-under-order">🚚 Bajo Pedido</span>
                                <button data-action="order-request" data-product-id="${p.id}" 
                                    class="w-10 h-10 rounded-full bg-amber-400 hover:bg-amber-500 text-white flex items-center justify-center transition-all shadow-md shrink-0 z-10" 
                                    title="Comprar Bajo Pedido: 4 a 5 días hábiles con el importador">
                                    <i data-lucide="truck" style="width:18px;height:18px"></i>
                                </button>
                            </div>`
                        : `<button data-action="add-cart" data-product-id="${p.id}" class="add-to-cart-btn hover:bg-[#46962A] hover:scale-110 bg-[#54B435] w-10 h-10 rounded-full text-white flex items-center justify-center transition-all shadow-md shrink-0 z-10" title="Agregar al carrito">
                                <i data-lucide="plus" style="width:20px;height:20px"></i>
                            </button>`
                    }
                </div>
            </div>
        </div>
    `;
}

function renderLanding() {
    const featuredGrid = document.getElementById('featured-grid');
    if (!featuredGrid) return;
    
    // Filtrar destacados (Alto) y tomar los primeros 25
    const featuredProducts = (currentProducts || [])
        .filter(p => String(p.destacado).toLowerCase() === 'alto' && !p.agotado)
        .slice(0, 25);
        
    if (featuredProducts.length === 0) {
        featuredGrid.innerHTML = '<p class="text-slate-500 col-span-full text-center py-8">No hay productos destacados por el momento.</p>';
    } else {
        featuredGrid.innerHTML = DOMPurify.sanitize(featuredProducts.map(createProductCardHTML).join(''));
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function renderPagination(totalItems) {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const info = document.getElementById('pagination-info');
    
    if (!btnPrev || !btnNext || !info) return;

    const totalPages = Math.ceil(totalItems / state.itemsPerPage) || 1;
    
    // Asegurar que estamos en una página válida
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    info.innerText = `Página ${state.currentPage} de ${totalPages}`;

    btnPrev.disabled = state.currentPage <= 1;
    btnNext.disabled = state.currentPage >= totalPages;

    // Remover eventos anteriores clonando el elemento
    const newBtnPrev = btnPrev.cloneNode(true);
    const newBtnNext = btnNext.cloneNode(true);
    btnPrev.parentNode.replaceChild(newBtnPrev, btnPrev);
    btnNext.parentNode.replaceChild(newBtnNext, btnNext);

    newBtnPrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderCatalog();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    newBtnNext.addEventListener('click', () => {
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderCatalog();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

function renderCatalog() {
    let list = (currentProducts || []).filter(p => p.inventario > 0);
    
    // 1. Filtrar por Especie o Promoción
    if (state.activeEspecie !== "all") {
        if (state.activeEspecie === "promo_gratis") {
            list = list.filter(p => p.promo_b2c === 'DOMICILIO_GRATIS');
        } else {
            list = list.filter(p => p.especieKey === state.activeEspecie);
        }
    }

    // 2. Filtrar por Nivel 1 (Categoría)
    if (state.selectedCategory !== "all") {
        list = list.filter(p => p.categoria === state.selectedCategory);
    }

    // 3. Filtrar por Nivel 2 (Marca)
    if (state.selectedMarca !== "all") {
        list = list.filter(p => p.brand === state.selectedMarca);
    }
    
    // 4. Filtrar por Búsqueda
    if (state.search.trim()) {
        const term = state.search.toLowerCase();
        list = list.filter(p => 
            (p.name && p.name.toLowerCase().includes(term)) || 
            (p.brand && p.brand.toLowerCase().includes(term)) ||
            (p.ref && p.ref.toLowerCase().includes(term))
        );
    }

    // 5. Ordenar
    list.sort((a, b) => {
        if (a.agotado && !b.agotado) return 1;
        if (!a.agotado && b.agotado) return -1;
        
        const priceA = state.showIva ? a.finalConIva : a.finalSinIva;
        const priceB = state.showIva ? b.finalConIva : b.finalSinIva;
        return state.sortBy === "price-asc" ? priceA - priceB : priceB - priceA;
    });

    const totalItems = list.length;
    updateBreadcrumbs(totalItems);
    
    // Paginación
    renderPagination(totalItems);
    
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const paginatedList = list.slice(startIndex, startIndex + state.itemsPerPage);

    if (!elements.productGrid) return;

    if (paginatedList.length === 0) {
        elements.productGrid.innerHTML = "";
        if (elements.emptyCatalog) elements.emptyCatalog.style.display = "flex";
    } else {
        if (elements.emptyCatalog) elements.emptyCatalog.style.display = "none";
        elements.productGrid.innerHTML = DOMPurify.sanitize(paginatedList.map(createProductCardHTML).join(''));
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// -------------------------------------------------------------
// MODAL DE FICHA TÉCNICA
// -------------------------------------------------------------
function openProductDetail(p) {
    selectedProductForModal = p;
    if (!elements.modalDetail || !elements.modalContent) return;

    const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    elements.modalContent.innerHTML = DOMPurify.sanitize(`
        <!-- Imagen y Sticker -->
        <div class="w-full md:w-1/3 flex flex-col items-center justify-start">
            <div class="w-full h-56 bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center justify-center relative overflow-hidden">
                ${p.hasDiscount ? `
                    <div class="absolute top-3 right-3 bg-rose-500 text-white text-xs font-black px-3 py-1 rounded-lg shadow-md transform rotate-2 z-10">
                        ¡${p.dctoPercent}% OFF!
                    </div>
                ` : ''}
                ${p.imageUrl ? 
                    `<img src="${p.imageUrl}" alt="${p.name}" class="max-h-full max-w-full object-contain" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-7xl\\'>${p.especieKey === 'dogs' ? '🐕' : '🐈'}</span>';">` : 
                    `<span class="text-7xl">${p.especieKey === 'dogs' ? '🐕' : '🐈'}</span>`
                }
            </div>
            <div class="w-full mt-3 bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                <span class="text-xs font-bold text-emerald-800 block">Categoría: ${p.categoria}</span>
                <span class="text-[11px] text-emerald-600 block mt-0.5">Especie: ${p.especie}</span>
            </div>
        </div>

        <!-- Ficha Técnica y Detalles -->
        <div class="w-full md:w-2/3 flex flex-col">
            <span class="text-[#004E4A] text-xs font-bold tracking-widest uppercase mb-1">Ficha Técnica</span>
            <h2 class="text-xl font-bold text-[#2C3E50] mb-3 leading-tight">${p.name}</h2>
            
            <p class="text-xs text-slate-600 mb-4 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                ${p.descripcion}
            </p>

            <div class="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div class="bg-slate-50 p-2.5 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Referencia (SKU)</span>
                    <span class="font-bold text-slate-800 font-mono text-xs">${p.ref}</span>
                </div>
                <div class="bg-slate-50 p-2.5 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Marca</span>
                    <span class="font-bold text-slate-800">${p.brand}</span>
                </div>
                <div class="bg-slate-50 p-2.5 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Descuento</span>
                    <span class="font-bold text-rose-600">${p.hasDiscount ? `${p.dctoPercent}% OFF` : 'Sin Descuento'}</span>
                </div>
            </div>

            <!-- Comparativo de Precios PVP -->
            <div class="grid grid-cols-2 gap-3 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 mt-auto">
                <div>
                    <span class="text-[10px] font-bold text-slate-500 uppercase block">Precio PVP Sin IVA</span>
                    ${p.hasDiscount ? `<span class="line-through text-slate-400 text-xs block">${fmt(p.originalSinIva)}</span>` : ''}
                    <span class="text-sm font-bold text-slate-800">${fmt(p.finalSinIva)}</span>
                </div>
                <div>
                    <span class="text-[10px] font-bold text-[#004E4A] uppercase block">Precio PVP Con IVA</span>
                    ${p.hasDiscount ? `<span class="line-through text-slate-400 text-xs block">${fmt(p.originalConIva)}</span>` : ''}
                    <span class="text-lg font-black text-[#54B435]">${fmt(p.finalConIva)}</span>
                </div>
            </div>
        </div>
    `);

    elements.modalDetail.classList.remove('hidden');

    if (elements.modalAddToCartBtn) {
        const orderBtn = document.getElementById('modal-order-btn');
        if (p.agotado) {
            // Producto sin inventario → mostrar botón Bajo Pedido, ocultar carrito
            elements.modalAddToCartBtn.classList.add('hidden');
            if (orderBtn) {
                orderBtn.classList.remove('hidden');
                orderBtn.onclick = () => {
                    // Abrir WhatsApp o simplemente cerrar modal con mensaje
                    const msg = encodeURIComponent(`Hola, me interesa realizar un pedido del producto: ${p.name} (Ref: ${p.ref}). ¿Cuál es el tiempo de entrega estimado?`);
                    window.open(`https://wa.me/?text=${msg}`, '_blank');
                };
            }
        } else {
            // Producto con inventario → mostrar botón de carrito, ocultar bajo pedido
            elements.modalAddToCartBtn.classList.remove('hidden');
            elements.modalAddToCartBtn.className = "flex-1 bg-[#54B435] hover:bg-[#46962A] text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2";
            elements.modalAddToCartBtn.innerHTML = "<span>Agregar al Carrito</span>";
            elements.modalAddToCartBtn.disabled = false;
            if (orderBtn) orderBtn.classList.add('hidden');
        }
    }
}

function closeProductDetail() {
    if (elements.modalDetail) elements.modalDetail.classList.add('hidden');
}

// -------------------------------------------------------------
// CONTROL DEL DRAWER / MENÚ HAMBURGUESA MÓVIL
// -------------------------------------------------------------
function openMobileDrawer() {
    if (!elements.mobileDrawer) return;
    elements.mobileDrawer.classList.remove('hidden');
    setTimeout(() => {
        if (elements.mobileDrawerBackdrop) elements.mobileDrawerBackdrop.classList.add('opacity-100');
        const box = elements.mobileDrawer.querySelector('.bg-white');
        if (box) box.classList.remove('-translate-x-full');
    }, 10);
}

function closeMobileDrawer() {
    if (!elements.mobileDrawer) return;
    if (elements.mobileDrawerBackdrop) elements.mobileDrawerBackdrop.classList.remove('opacity-100');
    const box = elements.mobileDrawer.querySelector('.bg-white');
    if (box) box.classList.add('-translate-x-full');
    setTimeout(() => {
        elements.mobileDrawer.classList.add('hidden');
    }, 300);
}

// -------------------------------------------------------------
// EVENT LISTENERS & INICIALIZACIÓN
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    currentProducts = await fetchProducts();
    window.currentProducts = currentProducts;
    state.allProducts = currentProducts;
    
    // Re-renderizar carrito ahora que los productos originales están disponibles
    if (window.CartManager) window.CartManager.render();
    
    renderLanding();
    buildAndRenderCategoryTree();

    // Delegate Clicks para el Árbol (Desktop y Móvil)
    const handleTreeClick = (e) => {
        const allBtn = e.target.closest('[data-action="select-all-tree"]');
        const level1 = e.target.closest('[data-action="select-level-1"]');
        const level2 = e.target.closest('[data-action="select-level-2"]');
        const expandBtn = e.target.closest('[data-action="toggle-tree-expand"]');
        if (allBtn) {
            state.selectedCategory = 'all';
            state.selectedMarca = 'all';
            expandedCategories.clear();
            buildAndRenderCategoryTree();
            renderCatalog();
        } else if (expandBtn) {
            e.stopPropagation();
            const cat = expandBtn.dataset.cat;
            if (expandedCategories.has(cat)) expandedCategories.delete(cat);
            else expandedCategories.add(cat);
            buildAndRenderCategoryTree();
        } else if (level1) {
            const cat = level1.dataset.cat;
            const alreadyActive = state.selectedCategory === cat;
            
            if (alreadyActive) {
                if (expandedCategories.has(cat)) {
                    expandedCategories.delete(cat);
                } else {
                    expandedCategories.add(cat);
                }
                state.selectedMarca = 'all';
            } else {
                state.selectedCategory = cat;
                state.selectedMarca = 'all';
                expandedCategories.add(cat);
            }
            buildAndRenderCategoryTree();
            renderCatalog();
        } else if (level2) {
            const cat = level2.dataset.cat;
            const marca = level2.dataset.marca;
            state.selectedCategory = cat;
            state.selectedMarca = marca;
            buildAndRenderCategoryTree();
            renderCatalog();
        }
    };

    if (elements.categoryTreeNav) elements.categoryTreeNav.addEventListener('click', handleTreeClick);
    if (elements.mobileCategoryTreeNav) elements.mobileCategoryTreeNav.addEventListener('click', handleTreeClick);

    // Botón Reset Árbol
    document.querySelectorAll('[data-action="reset-tree"]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedCategory = 'all';
            state.selectedMarca = 'all';
            expandedCategories.clear();
            buildAndRenderCategoryTree();
            renderCatalog();
        });
    });

    // Menú Hamburguesa Móvil
    if (elements.btnMobileMenu) elements.btnMobileMenu.addEventListener('click', openMobileDrawer);
    if (elements.btnMobileCategories) elements.btnMobileCategories.addEventListener('click', openMobileDrawer);
    if (elements.closeMobileDrawerBtn) elements.closeMobileDrawerBtn.addEventListener('click', closeMobileDrawer);
    if (elements.mobileDrawerBackdrop) elements.mobileDrawerBackdrop.addEventListener('click', closeMobileDrawer);
    if (elements.btnApplyMobileDrawer) elements.btnApplyMobileDrawer.addEventListener('click', closeMobileDrawer);

    // Búsqueda
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            state.search = e.target.value;
            state.currentPage = 1;
            window.showCatalogView();
            renderCatalog();
        });
    }

    // Ordenamiento
    if (elements.selectSort) {
        elements.selectSort.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderCatalog();
        });
    }

    // Control de IVA (Sin IVA vs Con IVA)
    window.setIvaMode = function(isConIva) {
        state.showIva = isConIva;
        const chk = document.getElementById('toggle-iva');
        if (chk) chk.checked = isConIva;

        const btnSin = document.getElementById('btn-iva-sin');
        const btnCon = document.getElementById('btn-iva-con');

        if (btnSin && btnCon) {
            if (isConIva) {
                btnSin.className = 'px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-800 cursor-pointer';
                btnCon.className = 'px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-black rounded-lg transition-all bg-[#54B435] text-white shadow-xs cursor-pointer';
            } else {
                btnSin.className = 'px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-black rounded-lg transition-all bg-white text-[#004E4A] shadow-xs cursor-pointer';
                btnCon.className = 'px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all text-slate-500 hover:text-slate-800 cursor-pointer';
            }
        }

        renderCatalog();
    };

    if (elements.toggleIva) {
        elements.toggleIva.addEventListener('change', (e) => {
            window.setIvaMode(e.target.checked);
        });
    }

    // Delegation Event Grillas
    const handleGridClick = (e) => {
        const addBtn = e.target.closest('[data-action="add-cart"]');
        const orderBtn = e.target.closest('[data-action="order-request"]');
        const card = e.target.closest('.product-card');

        if (addBtn) {
            e.stopPropagation();
            const id = addBtn.dataset.productId;
            const p = currentProducts.find(prod => String(prod.id) === String(id));
            if (p && window.CartManager) {
                const finalPrice = state.showIva ? p.finalConIva : p.finalSinIva;
                window.CartManager.addItem({
                    id: p.id,
                    name: p.name,
                    price: finalPrice,
                    imageUrl: p.imageUrl,
                    emoji: p.especieKey === 'dogs' ? '🐕' : '🐈'
                });
            }
        } else if (orderBtn) {
            // Clic en "Bajo Pedido" de la tarjeta → abre el modal del producto
            e.stopPropagation();
            const id = orderBtn.dataset.productId;
            const p = currentProducts.find(prod => String(prod.id) === String(id));
            if (p) openProductDetail(p);
        } else if (card) {
            const id = card.dataset.productId;
            const p = currentProducts.find(prod => String(prod.id) === String(id));
            if (p) openProductDetail(p);
        }
    };


    if (elements.productGrid) elements.productGrid.addEventListener('click', handleGridClick);
    
    const featuredGrid = document.getElementById('featured-grid');
    if (featuredGrid) featuredGrid.addEventListener('click', handleGridClick);

    // Modal
    if (elements.closeDetailBtn) elements.closeDetailBtn.addEventListener('click', closeProductDetail);
    if (elements.modalCloseBtn) elements.modalCloseBtn.addEventListener('click', closeProductDetail);
    if (elements.modalAddToCartBtn) {
        elements.modalAddToCartBtn.addEventListener('click', () => {
            if (selectedProductForModal && window.CartManager) {
                const finalPrice = state.showIva ? selectedProductForModal.finalConIva : selectedProductForModal.finalSinIva;
                window.CartManager.addItem({
                    id: selectedProductForModal.id,
                    name: selectedProductForModal.name,
                    price: finalPrice,
                    imageUrl: selectedProductForModal.imageUrl,
                    emoji: selectedProductForModal.especieKey === 'dogs' ? '🐕' : '🐈'
                });
                closeProductDetail();
            }
        });
    }

    renderCatalog();

    // ─────────────────────────────────────────────────────────────────
    // REALTIME: Actualizar badge de stock en vivo cuando cambia inventario
    // ─────────────────────────────────────────────────────────────────
    function updateStockBadgeDOM(ref, nuevoStock) {
        const agotado = nuevoStock <= 0;

        // Actualizar el objeto en memoria
        const prod = currentProducts.find(p => String(p.ref) === String(ref));
        if (prod) {
            prod.inventario = nuevoStock;
            prod.agotado    = agotado;
        }

        // Si el producto queda sin stock, retirarlo del catálogo en tiempo real
        if (agotado) {
            currentProducts = currentProducts.filter(p => String(p.ref) !== String(ref));
            buildAndRenderCategoryTree();
            renderCatalog();
            renderLanding();
            console.log(`🚫 Realtime: Producto ref "${ref}" retirado del catálogo (sin stock).`);
            return;
        }

        // Buscar la tarjeta en el catálogo principal y en el grid de destacados
        const cards = document.querySelectorAll(`[data-product-id="${ref}"]`);
        if (!cards.length) return;

        cards.forEach(card => {
            // 1. Actualizar badge de stock
            const stockBadge = card.querySelector('[data-stock-badge]');
            if (stockBadge) {
                stockBadge.textContent = `Stock: ${nuevoStock}`;
                stockBadge.classList.remove('hidden');
            }

            // 2. Quitar overlay si existiera
            let overlay = card.querySelector('[data-agotado-overlay]');
            if (overlay) overlay.remove();
            card.classList.remove('opacity-60', 'grayscale-[50%]');

            // 3. Habilitar botón "Agregar al carrito"
            const addBtn = card.querySelector('[data-action="add-to-cart"]');
            if (addBtn) {
                addBtn.disabled = false;
                addBtn.classList.remove('opacity-40', 'cursor-not-allowed');
            }
        });

        console.log(`📦 Realtime: Stock de ref "${ref}" actualizado a ${nuevoStock}`);
    }

    // Conectar al canal Realtime de Supabase
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        const realtimeClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        realtimeClient
            .channel('stock-realtime')
            .on('postgres_changes', {
                event:  'UPDATE',
                schema: 'public',
                table:  'petpro_productos'
            }, (payload) => {
                const ref        = payload.new?.ref;
                const nuevoStock = parseInt(payload.new?.inventario_b2c) || 0;
                if (ref !== undefined) {
                    updateStockBadgeDOM(String(ref), nuevoStock);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Realtime stock: canal activo.');
                } else if (status === 'CHANNEL_ERROR') {
                    console.warn('⚠️ Realtime: no se pudo conectar. Verifica que Realtime esté activo para petpro_productos en Supabase Dashboard.');
                }
            });
    }
});
