/**
 * Checkout Module
 * Maneja la lógica del modal de checkout, validación de formulario
 * y estado de confirmación de pedido.
 */

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-checkout');
    const form = document.getElementById('form-checkout');
    const btnClose = document.querySelectorAll('[data-close-modal], [data-action="close-modal"]');
    const btnCheckoutOpen = document.getElementById('btn-checkout');

    // Abrir modal y notificar al AddressValidator
    window.openCheckout = () => {
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            // Reiniciar el validador de direcciones
            if (window.AddressValidator) {
                window.AddressValidator.reset();
                window.AddressValidator.init();
            }
        }
    };

    if (btnCheckoutOpen) {
        btnCheckoutOpen.addEventListener('click', window.openCheckout);
    }

    // Función para cerrar el modal
    const closeCheckout = () => {
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            // Resetear formulario si existe
            if (form) {
                form.reset();
                form.style.display = 'block';
                const confirmationScreen = document.getElementById('confirmation-screen');
                if (confirmationScreen) confirmationScreen.classList.add('hidden');
            }
        }
    };

    // Event Listeners para cerrar
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCheckout();
        });
    }

    btnClose.forEach(btn => {
        btn.addEventListener('click', closeCheckout);
    });

    // Store the processed payload to use in final confirmation
    let pendingRpcPayload = null;

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = document.getElementById('btn-submit-checkout');

            // -- Validar que la direccion haya sido verificada con IGAC --
            // COMPORTAMIENTO SUAVE: Se permite continuar sin validacion estricta
            /*
            if (window.AddressValidator && !window.AddressValidator.isValidated()) {
                alert('⚠️ Por favor selecciona una dirección de la lista de sugerencias para validarla.');
                if (btnSubmit) { btnSubmit.disabled = false; }
                return;
            }
            */

            // Datos del formulario
            const formData = new FormData(form);
            const direccion = formData.get('direccion_b2c') || '';
            const urbanizacion = formData.get('urbanizacion') || '';
            const torre     = formData.get('torre') || '';
            const apto      = formData.get('apto') || '';
            const telefono  = formData.get('telefono') || '';
            const ciudad    = formData.get('ciudad') || '';       // ahora viene del <select>
            const nombre    = formData.get('nombre_b2c') || '';
            const ccNit     = formData.get('cc_nit') || '';
            const email     = formData.get('email_b2c') || '';
            const metodoPago = formData.get('metodo_pago') || 'Contraentrega';
            const barrioFallback = formData.get('barrio_fallback') || '';

            // Datos validados por AddressValidator
            let validatedAddr = window.AddressValidator?.getValidatedData() || null;
            const barrioDetectado = validatedAddr?.barrio_oficial || barrioFallback || '';
            
            // Adjuntar detalles adicionales a la direccion validada
            if (!validatedAddr) {
                validatedAddr = {};
            }
            validatedAddr.detalles = {
                urbanizacion: urbanizacion,
                torre: torre,
                apto: apto,
                barrio: barrioDetectado
            };

            // Preparar items del carrito
            const items = window.cart ? window.cart.items : (window.CartManager ? window.CartManager.items : []);
            if (!items || items.length === 0) {
                alert("El carrito está vacío");
                return;
            }

            // Calcular subtotales y costos exactos
            let subtotalCalculado = 0;
            items.forEach(item => {
                subtotalCalculado += ((item.price || 0) * (item.qty || 1));
            });
            const isFreeShipping = subtotalCalculado > 150000 || subtotalCalculado === 0 || (window.CartManager && window.CartManager.freeShippingActive);
            const costoEnvio = isFreeShipping ? 0 : 12000;
            const totalMonto = subtotalCalculado + costoEnvio;

            // Construir dirección completa estructurada
            let dirCompleta = direccion;
            const extras = [];
            if (urbanizacion) extras.push(`Urb/Edif: ${urbanizacion}`);
            if (torre) extras.push(`Torre: ${torre}`);
            if (apto) extras.push(`Apto: ${apto}`);
            if (barrioDetectado) extras.push(`Barrio: ${barrioDetectado}`);
            if (extras.length > 0) {
                dirCompleta += ` (${extras.join(', ')})`;
            }

            // Preparar Payload completo para fn_crear_pedido
            pendingRpcPayload = {
                municipio:      ciudad,
                direccion_b2c:  dirCompleta,
                nombre_b2c:     nombre,
                email_b2c:      email,
                celular:        telefono ? parseFloat(telefono.replace(/\D/g, '')) : null,
                cc_nit:         ccNit ? ccNit.replace(/\D/g, '') : null,
                monto:          totalMonto,
                items: items.map(item => ({
                    ref:    item.ref || item.id,
                    qty:    item.qty || 1,
                    nombre: item.name || item.nombre || item.ref
                })),
                detalles_json: {
                    nombre_completo: nombre,
                    documento_cc_nit: ccNit,
                    email: email,
                    telefono: telefono,
                    municipio: ciudad,
                    direccion_base: direccion,
                    direccion_completa: dirCompleta,
                    urbanizacion: urbanizacion,
                    torre: torre,
                    apto: apto,
                    barrio: barrioDetectado,
                    metodo_pago: metodoPago,
                    subtotal: subtotalCalculado,
                    costo_envio: costoEnvio,
                    envio_gratis: isFreeShipping,
                    total: totalMonto,
                    con_iva: window.CartManager?.cartIvaActive || false,
                    productos: items.map(item => ({
                        ...item,
                        ref: item.ref || item.id,
                        name: item.name || item.nombre || item.ref
                    })),
                    validacion_igac: {
                        direccion_validada: validatedAddr,
                        metodo_validacion:  validatedAddr?.method || 'manual'
                    }
                }
            };

            // Poblar Pantalla de confirmación
            const confirmationList = document.getElementById('confirmation-details-list');
            if (confirmationList) {
                const shippingCostLabel = isFreeShipping ? 'GRATIS' : '$ 12.000 COP';
                const fmtTotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalMonto);

                confirmationList.innerHTML = DOMPurify.sanitize(`
                    <li><strong>Nombre:</strong> ${nombre}</li>
                    <li><strong>Documento:</strong> ${ccNit}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Teléfono:</strong> ${telefono}</li>
                    <li><strong>Ciudad:</strong> ${ciudad} ${barrioDetectado ? '— Barrio: ' + barrioDetectado : ''}</li>
                    <li><strong>Dirección:</strong> ${dirCompleta}</li>
                    <li><strong>Método de Pago:</strong> ${metodoPago}</li>
                    <li><strong>Productos:</strong> ${items.length} (Iva: ${window.CartManager?.cartIvaActive ? 'Si' : 'No'})</li>
                    <li class="mt-2 pt-2 border-t border-slate-200"><strong>Costo de Envío:</strong> <span class="${isFreeShipping ? 'text-[#54B435] font-bold' : ''}">${shippingCostLabel}</span></li>
                    <li class="text-lg text-[#004E4A] mt-1 font-bold"><strong>Total a Pagar:</strong> ${fmtTotal}</li>
                `);
            }

            // Cambiar de vista
            form.style.display = 'none';
            const confirmationScreen = document.getElementById('confirmation-screen');
            if (confirmationScreen) confirmationScreen.classList.remove('hidden');
        });
    }

    // Volver a editar
    const btnBack = document.getElementById('btn-back-checkout');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            if (form) form.style.display = 'block';
            const confirmationScreen = document.getElementById('confirmation-screen');
            if (confirmationScreen) confirmationScreen.classList.add('hidden');
        });
    }

    // Confirmación final
    const btnConfirmFinal = document.getElementById('btn-confirm-final');
    if (btnConfirmFinal) {
        btnConfirmFinal.addEventListener('click', async () => {
            if (!pendingRpcPayload) return;
            
            // Validar conexión a Supabase
            if (!window.supabase || typeof window.supabase.createClient !== 'function' || typeof SUPABASE_URL === 'undefined') {
                alert("Error de conexión con la base de datos.");
                return;
            }

            btnConfirmFinal.innerHTML = `<span class="animate-spin text-xl">↻</span> Procesando...`;
            btnConfirmFinal.disabled = true;

            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

            try {
                // Una sola llamada RPC: valida stock + descuenta + inserta (transacción atómica)
                const { data: rpcResult, error: rpcError } = await client
                    .rpc('fn_crear_pedido', { p_payload: pendingRpcPayload });

                if (rpcError) throw rpcError;

                // Extraer el metodo_pago del payload original (antes de limpiarlo)
                const pagoOpcion = pendingRpcPayload.detalles_json.metodo_pago;
                const pedidoId = rpcResult?.pedido_id || 'N/A';

                // Mostrar éxito
                const modalBox = modal.querySelector('.modal-box');
                modalBox.innerHTML = DOMPurify.sanitize(`
                    <div class="flex flex-col items-center justify-center py-12 gap-4 text-center">
                        <div class="w-16 h-16 rounded-full bg-[#E6F4E0] flex items-center justify-center mx-auto">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#54B435" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <p class="text-[#004E4A] font-bold text-lg" style="font-family: 'Montserrat', sans-serif;">¡Pedido Confirmado!</p>
                        <p class="text-[#6C7A89] text-sm">Tu pedido ha sido procesado exitosamente y registrado en nuestro sistema.</p>
                        ${pagoOpcion === 'Transferencia' ? `<p class="text-amber-600 font-bold text-sm mt-2 px-4 animate-pulse">Redirigiendo a WhatsApp para adjuntar tu comprobante de pago...</p>` : ''}
                    </div>
                `);

                // Limpiar carrito y cerrar tras un retraso
                setTimeout(() => {
                    let totalItemsValue = 0;
                    if (window.CartManager) {
                        totalItemsValue = window.CartManager.items.reduce((sum, item) => sum + (item.qty * (item.price || 0)), 0);
                        window.CartManager.items = [];
                        window.CartManager.save();
                    }
                    
                    if (pagoOpcion === 'Transferencia') {
                        const numWhatsApp = "573053862555";
                        const total = pendingRpcPayload?.monto || (totalItemsValue > 150000 || totalItemsValue === 0 ? totalItemsValue : totalItemsValue + 12000);
                        const totalFormatted = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(total);
                        
                        const mensaje = `Hola, acabo de realizar el pedido *#${pedidoId}* por un valor de *${totalFormatted}* y seleccioné la opción de transferencia. Favor proporcionar datos para realizar la transferencia y adjuntar el comprobante de pago:`;
                        const url = `https://wa.me/${numWhatsApp}?text=${encodeURIComponent(mensaje)}`;
                        window.open(url, '_blank');
                    }

                    location.reload();
                }, pagoOpcion === 'Transferencia' ? 4000 : 3000);

            } catch (err) {
                console.error('Error al procesar el pedido:', err);

                // Extraer mensaje legible del error de Postgres
                const msg = err?.message || '';

                if (msg.includes('STOCK_INSUFICIENTE')) {
                    // El mensaje de Postgres ya contiene detalles del producto
                    const detalle = msg.replace('STOCK_INSUFICIENTE: ', '');
                    
                    const modalHtml = `
                        <div id="dynamic-stock-modal" class="fixed inset-0 z-[70] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.6); animation: fadeIn 0.3s ease;">
                            <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative text-center scale-95" style="animation: popIn 0.3s ease forwards;">
                                <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span class="text-3xl">⚠️</span>
                                </div>
                                <h3 class="text-xl font-bold text-[#004E4A] mb-2">Sin stock suficiente</h3>
                                <p class="text-slate-600 mb-6 text-sm leading-relaxed">${detalle}<br><br>Por favor ajusta las cantidades en tu carrito.</p>
                                <button id="btn-close-stock-modal" class="w-full bg-[#004E4A] text-white py-3 rounded-xl font-bold hover:bg-[#003d3a] transition-colors">Aceptar</button>
                            </div>
                        </div>
                    `;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                    document.getElementById('btn-close-stock-modal').addEventListener('click', () => {
                        const m = document.getElementById('dynamic-stock-modal');
                        if (m) m.remove();
                        if (window.closeCheckout) window.closeCheckout();
                        if (window.CartManager) window.CartManager.openDrawer();
                    });
                } else if (msg.includes('PRODUCTO_NO_ENCONTRADO')) {
                    alert('⚠️ Uno de los productos ya no está disponible. Recarga la página y vuelve a intentarlo.');
                } else {
                    alert('Hubo un problema al procesar tu pedido:\n' + JSON.stringify(err, null, 2));
                }

                if (btnSubmit) { btnSubmit.innerHTML = 'Confirmar Compra'; btnSubmit.disabled = false; }
            }
        });
    }
});