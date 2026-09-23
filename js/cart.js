/**
 * Cart Management System
 * Manejo de estado del carrito, resolución dinámica de imágenes, contador real en header y drawer, y señalización visual.
 */

const CartManager = {
    items: JSON.parse(localStorage.getItem('cart')) || [],
    cartIvaActive: false,
    freeShippingActive: false,
    shippingCosts: [],
    selectedCity: '',

    init() {
        this.fetchShippingCosts();
        this.render();
        this.setupEventListeners();
    },

    async fetchShippingCosts() {
        try {
            if (!window.supabase || typeof SUPABASE_URL === 'undefined') return;
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            const { data, error } = await client
                .from('costo_envios')
                .select('*')
                .eq('activo', true);
            if (!error && data) {
                this.shippingCosts = data;
                this.render();
            }
        } catch (e) {
            console.error("Error loading shipping costs:", e);
        }
    },

    async checkFreeShipping(municipio, barrio) {
        // Normalizar: MAYUSCULAS, sin tildes, sin guiones (ej: "La Estrella" -> "LA ESTRELLA")
        const normMun = (municipio || '')
            .trim().toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/-/g, ' ');
        const normBarrio = (barrio || '').trim().toUpperCase();

        if (!normMun || !normBarrio) {
            this.freeShippingActive = false;
            this.render();
            return false;
        }
        try {
            if (!window.supabase || typeof SUPABASE_URL === 'undefined') return false;
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await client
                .from('petpro_zonas_cobertura')
                .select('id')
                .ilike('municipio', normMun)
                .ilike('barrio', normBarrio)
                .eq('tipo_promocion', 'DOMICILIO_GRATIS')
                .eq('activa', true)
                .or(`fecha_caducidad.is.null,fecha_caducidad.gte.${today}`)
                .limit(1);
                
            if (!error && data && data.length > 0) {
                this.freeShippingActive = true;
            } else {
                this.freeShippingActive = false;
            }
            this.render();
            return this.freeShippingActive;
        } catch (e) {
            console.error("Error validando envío gratis:", e);
            this.freeShippingActive = false;
            this.render();
            return false;
        }
    },

    isInRange(weight, rangeStr) {
        if (!rangeStr) return false;
        // ej: "[0.0,5.0)"
        const match = rangeStr.match(/([\[\(])([0-9.]+),([0-9.]+)([\]\)])/);
        if (!match) return false;
        const includeStart = match[1] === '[';
        const start = parseFloat(match[2]);
        const end = parseFloat(match[3]);
        const includeEnd = match[4] === ']';
        
        const afterStart = includeStart ? weight >= start : weight > start;
        const beforeEnd = includeEnd ? weight <= end : weight < end;
        return afterStart && beforeEnd;
    },

    save() {
        localStorage.setItem('cart', JSON.stringify(this.items));
        this.render();
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: this.items }));
    },

    showStockWarning(name, available, requested) {
        const drawerList = document.getElementById('cart-items-list');
        if (drawerList) {
            // Remove previous warning if exists
            const existing = document.getElementById('cart-stock-warning');
            if (existing) existing.remove();

            const banner = document.createElement('div');
            banner.id = 'cart-stock-warning';
            banner.className = 'bg-red-50 text-red-600 text-[11px] p-2.5 rounded-lg border border-red-100 mb-3 shadow-sm font-medium';
            banner.innerHTML = `⚠️ No hay suficiente stock de "<strong>${name}</strong>". Disponible: <strong>${available}</strong>.`;
            drawerList.prepend(banner);
            
            // Auto remove after 4 seconds
            setTimeout(() => {
                if (banner.parentNode) banner.remove();
            }, 4000);
        } else {
            alert(`⚠️ Sin stock suficiente\n\n"${name}" no tiene suficiente stock. Disponible: ${available}, Solicitado: ${requested}.`);
        }
    },

    addItem(product) {
        const existing = this.items.find(i => String(i.id) === String(product.id));
        const newQty = existing ? existing.qty + 1 : 1;
        
        const fullProduct = window.currentProducts ? window.currentProducts.find(p => String(p.id) === String(product.id)) : product;
        if (fullProduct && fullProduct.inventario !== undefined && newQty > fullProduct.inventario) {
            this.openDrawer();
            setTimeout(() => {
                this.showStockWarning(fullProduct.producto || fullProduct.name || product.name, fullProduct.inventario, newQty);
            }, 150);
            return;
        }

        if (existing) {
            existing.qty += 1;
            if (product.imageUrl) existing.imageUrl = product.imageUrl;
            if (product.price) existing.price = product.price;
        } else {
            this.items.push({ ...product, qty: 1 });
        }
        this.save();
        this.openDrawer();
    },

    updateQty(id, delta) {
        const item = this.items.find(i => String(i.id) === String(id));
        if (item) {
            const newQty = item.qty + delta;
            if (delta > 0 && window.currentProducts) {
                const fullProduct = window.currentProducts.find(p => String(p.id) === String(id));
                if (fullProduct && fullProduct.inventario !== undefined && newQty > fullProduct.inventario) {
                    this.showStockWarning(fullProduct.producto || fullProduct.name || item.name, fullProduct.inventario, newQty);
                    return;
                }
            }

            item.qty += delta;
            if (item.qty <= 0) this.removeItem(id);
            else this.save();
        }
    },

    removeItem(id) {
        this.items = this.items.filter(i => String(i.id) !== String(id));
        this.save();
    },

    formatCurrency(val) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    },

    openDrawer() {
        const drawer = document.getElementById('cart-drawer');
        const backdrop = document.getElementById('cart-backdrop');
        const panel = drawer ? drawer.querySelector('.bg-white') || drawer.children[1] : null;
        
        if (!drawer) return;
        drawer.classList.remove('hidden');
        
        setTimeout(() => {
            if (backdrop) {
                backdrop.style.opacity = '1';
                backdrop.style.pointerEvents = 'auto';
            }
            if (panel) panel.style.transform = 'translateX(0)';
        }, 10);
    },

    closeDrawer() {
        const drawer = document.getElementById('cart-drawer');
        const backdrop = document.getElementById('cart-backdrop');
        const panel = drawer ? drawer.querySelector('.bg-white') || drawer.children[1] : null;
        
        if (!drawer) return;
        if (backdrop) {
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
        }
        if (panel) panel.style.transform = 'translateX(100%)';
        
        setTimeout(() => {
            drawer.classList.add('hidden');
        }, 300);
    },

    setupEventListeners() {
        const backdrop = document.getElementById('cart-backdrop');
        const closeCartBtn = document.getElementById('close-cart');
        const cartToggleBtn = document.getElementById('btn-cart-toggle');
        
        if (backdrop) backdrop.addEventListener('click', () => this.closeDrawer());
        if (closeCartBtn) closeCartBtn.addEventListener('click', () => this.closeDrawer());
        if (cartToggleBtn) cartToggleBtn.addEventListener('click', () => this.openDrawer());
        
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-checkout')) {
                if (typeof window.openCheckout === 'function') {
                    window.openCheckout();
                } else {
                    const modal = document.getElementById('modal-checkout');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.style.display = 'flex';
                    }
                }
                this.closeDrawer();
            }
            
            // Delegation para botones del carrito
            const btn = e.target.closest('.cart-action-btn');
            if (btn) {
                const id = btn.dataset.productId;
                const action = btn.dataset.action;
                if (action === 'minus') this.updateQty(id, -1);
                else if (action === 'plus') this.updateQty(id, 1);
                else if (action === 'remove') this.removeItem(id);
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.id === 'toggle-cart-iva') {
                this.cartIvaActive = e.target.checked;
                this.render();
            }
            if (e.target.id === 'cart-city-select') {
                this.selectedCity = e.target.value;
                this.render();
            }
        });
    },

    render() {
        const list = document.getElementById('cart-items-list');

        // Calcular número total de unidades en el carrito
        const totalItemsCount = this.items.reduce((sum, i) => sum + i.qty, 0);
        
        let subtotal = 0;
        let totalWeight = 0;
        this.items.forEach(item => {
            if (window.currentProducts) {
                const p = window.currentProducts.find(prod => String(prod.id) === String(item.id));
                if (p) {
                    item.price = this.cartIvaActive ? p.finalConIva : p.finalSinIva;
                    // Asegurar lectura de peso
                    const pWeight = (p.peso_kg != null && p.peso_kg > 0) ? parseFloat(p.peso_kg) : 2.0; // Default a 2kg si no tiene
                    totalWeight += (pWeight * item.qty);
                }
            } else {
                totalWeight += 2.0 * item.qty;
            }
            subtotal += (item.price * item.qty);
        });

        // Determinar Costo de Envío Dinámico
        let shipping = 0;
        let shippingLabel = '';

        if (this.freeShippingActive) {
            shipping = 0;
            shippingLabel = 'GRATIS';
        } else if (subtotal > 150000 || subtotal === 0) { // Regla legacy si existe
            shipping = 0;
            shippingLabel = 'GRATIS';
        } else if (totalWeight > 15) {
            shipping = 'INDETERMINADO';
            shippingLabel = 'A calcular por el comercio';
        } else {
            // Buscar en tabla
            const normCity = (this.selectedCity || 'MEDELLIN').toUpperCase(); // Por defecto MEDELLIN si no elige
            const rule = this.shippingCosts.find(r => 
                r.ciudad.toUpperCase() === normCity &&
                r.activo === true &&
                this.isInRange(totalWeight, r.rango_peso_kg)
            );
            if (rule) {
                shipping = parseFloat(rule.costo_flete);
                shippingLabel = this.formatCurrency(shipping);
            } else {
                shipping = 10000; // Fallback
                shippingLabel = this.formatCurrency(shipping);
            }
        }

        const total = subtotal + (shipping === 'INDETERMINADO' ? 0 : shipping);

        // 1. Actualizar TODOS los elementos contadores del Carrito (Header, Drawer, etc.)
        //    Para #cart-badge escribimos en el sub-span #cart-badge-num para preservar los anillos radar
        const cartCount = document.getElementById('cart-count');
        const cartDrawerCount = document.getElementById('cart-drawer-count');
        const cartBadgeNum = document.getElementById('cart-badge-num');
        if (cartCount) cartCount.textContent = totalItemsCount;
        if (cartDrawerCount) cartDrawerCount.textContent = totalItemsCount;
        if (cartBadgeNum) cartBadgeNum.textContent = totalItemsCount;

        // 2. Señalización en el botón de Carrito del Header
        const cartBadge = document.getElementById('cart-badge');
        const cartToggleBtn = document.getElementById('btn-cart-toggle');

        if (cartBadge) {
            if (totalItemsCount > 0) {
                cartBadge.classList.remove('hidden');
                cartBadge.style.display = 'flex';
                if (cartToggleBtn) {
                    cartToggleBtn.classList.add('ring-2', 'ring-[#54B435]', 'bg-white/20');
                }
            } else {
                cartBadge.classList.add('hidden');
                cartBadge.style.display = 'none';
                if (cartToggleBtn) {
                    cartToggleBtn.classList.remove('ring-2', 'ring-[#54B435]', 'bg-white/20');
                }
            }
        }

        // 3. Renderizar la lista de productos del Carrito con Imágenes
        if (!list) return;

        if (this.items.length === 0) {
            list.innerHTML = DOMPurify.sanitize(`
                <div class="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
                    <div class="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-800 text-3xl">
                        🛒
                    </div>
                    <p class="text-slate-600 font-bold text-sm">Tu carrito está vacío</p>
                    <p class="text-slate-400 text-xs">Agrega productos del catálogo</p>
                </div>`);
        } else {
            list.innerHTML = DOMPurify.sanitize(this.items.map(item => {
                // Resolución dinámica de imagen de producto
                let imgUrl = item.imageUrl;
                if (!imgUrl && window.currentProducts) {
                    const found = window.currentProducts.find(p => String(p.id) === String(item.id));
                    if (found && found.imageUrl) imgUrl = found.imageUrl;
                }

                return `
                    <div class="flex gap-3 bg-white rounded-2xl p-3 border border-[#E2E8F0] shadow-xs items-center">
                        <!-- Foto del producto con Fallback a Emoji -->
                        <div class="w-14 h-14 rounded-xl bg-[#F8F9FA] border border-[#E2E8F0] flex items-center justify-center shrink-0 overflow-hidden relative">
                            ${imgUrl ? 
                                `<img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-contain p-1" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-2xl\\'>${item.emoji || '🐾'}</span>';">` : 
                                `<span class="text-2xl">${item.emoji || '🐾'}</span>`
                            }
                        </div>

                        <div class="flex-1 min-w-0">
                            <p class="text-[#2C3E50] font-bold text-xs leading-tight truncate" title="${item.name}">${item.name}</p>
                            <p class="text-[#004E4A] font-bold text-sm mt-0.5">${this.formatCurrency(item.price)}</p>
                            <div class="flex items-center gap-2 mt-1.5">
                                <button data-product-id="${item.id}" data-action="minus" class="cart-action-btn w-6 h-6 rounded-full border border-[#E2E8F0] flex items-center justify-center hover:bg-[#004E4A] hover:text-white transition-all font-bold text-xs">
                                    -
                                </button>
                                <span class="text-[#2C3E50] font-bold text-xs w-4 text-center">${item.qty}</span>
                                <button data-product-id="${item.id}" data-action="plus" class="cart-action-btn w-6 h-6 rounded-full border border-[#E2E8F0] flex items-center justify-center hover:bg-[#004E4A] hover:text-white transition-all font-bold text-xs">
                                    +
                                </button>
                                <button data-product-id="${item.id}" data-action="remove" class="cart-action-btn ml-auto text-slate-400 hover:text-rose-600 transition-colors p-1" title="Eliminar del carrito">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join(''));
        }

        // 4. Actualizar Footer del Carrito
        const footer = document.getElementById('cart-footer');
        if (footer) {
            if (this.items.length > 0) {
                footer.innerHTML = DOMPurify.sanitize(`
                    <div class="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-bold text-[#6C7A89]">Mostrar precios con IVA</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="toggle-cart-iva" class="sr-only peer" ${this.cartIvaActive ? 'checked' : ''}>
                                <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#54B435]"></div>
                            </label>
                        </div>
                        ${this.cartIvaActive ? '<p class="text-[10px] text-amber-600 mb-3 leading-tight text-center font-medium">📝 Nota: Si activa el IVA, se generará Factura Electrónica.</p>' : ''}
                        
                        <div class="border-t border-slate-200 pt-3">
                            <label class="block text-xs font-bold text-[#6C7A89] mb-1">Ciudad de Envío</label>
                            <select id="cart-city-select" class="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#54B435]">
                                <option value="MEDELLIN" ${this.selectedCity==='MEDELLIN'?'selected':''}>Medellín</option>
                                <option value="BELLO" ${this.selectedCity==='BELLO'?'selected':''}>Bello</option>
                                <option value="ITAGUI" ${this.selectedCity==='ITAGUI'?'selected':''}>Itagüí</option>
                                <option value="SABANETA" ${this.selectedCity==='SABANETA'?'selected':''}>Sabaneta</option>
                                <option value="ENVIGADO" ${this.selectedCity==='ENVIGADO'?'selected':''}>Envigado</option>
                                <option value="LA ESTRELLA" ${this.selectedCity==='LA ESTRELLA'?'selected':''}>La Estrella</option>
                                <option value="CALDAS" ${this.selectedCity==='CALDAS'?'selected':''}>Caldas</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between text-slate-500">
                            <span>Subtotal (${totalItemsCount} unidades)</span>
                            <span class="font-bold text-slate-800">${this.formatCurrency(subtotal)}</span>
                        </div>
                        <div class="flex justify-between items-start text-slate-500 mt-2">
                            <div class="flex flex-col">
                                <span>Envío</span>
                                <span class="text-[9px] text-slate-400 leading-tight mt-0.5">Costo Sujeto a Promociones y<br>Zonas de Cobertura</span>
                            </div>
                            <span class="${shipping === 0 || shippingLabel === 'GRATIS' ? 'text-[#54B435] font-bold' : 'font-bold text-slate-800'} mt-0.5">
                                ${shippingLabel}
                            </span>
                        </div>
                        <div class="flex justify-between font-bold text-base pt-2 border-t border-[#E2E8F0]">
                            <span class="text-[#2C3E50]">Total</span>
                            <span class="text-[#004E4A]">${this.formatCurrency(total)}</span>
                        </div>
                    </div>
                    <button id="btn-checkout" class="w-full py-3 mt-3 rounded-xl font-bold text-white text-sm transition-all hover:bg-[#46962A] flex items-center justify-center gap-2 bg-[#54B435] shadow-md">
                        Finalizar Pedido
                    </button>
                `);
            } else {
                footer.innerHTML = '';
            }
        }
    }
};

window.CartManager = CartManager;
document.addEventListener('DOMContentLoaded', () => CartManager.init());