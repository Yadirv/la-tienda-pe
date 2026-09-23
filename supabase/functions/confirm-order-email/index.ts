import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Interface del payload que envía el Database Webhook de Supabase (INSERT en petpro_pedidos)
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    nombre_b2c: string;
    email_b2c: string;
    ciudad: string;
    direccion_b2c: string;
    cantidad: number;
    detalles_json: any;
    [key: string]: any;
  };
  schema: string;
  old_record: null | any;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'pedidos@vitalpets.co';
const BUSINESS_EMAIL = Deno.env.get('BUSINESS_EMAIL') || 'admin@vitalpets.co';

serve(async (req) => {
  // Manejo de preflight request (CORS) - Opcional para Webhooks internos pero buena práctica
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const payload: WebhookPayload = await req.json();

    // Solo procesar nuevos pedidos
    if (payload.type !== 'INSERT' || payload.table !== 'petpro_pedidos') {
      return new Response(JSON.stringify({ message: "Ignorado - No es un nuevo pedido" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { record } = payload;
    const email = record.email_b2c;

    if (!email) {
      console.log(`El pedido ${record.id} no tiene email asociado. Ignorando.`);
      return new Response(JSON.stringify({ message: "Sin email" }), { status: 200 });
    }

    if (!RESEND_API_KEY) {
      console.error("Falta RESEND_API_KEY en los secretos de Supabase.");
      return new Response(JSON.stringify({ error: "Configuracion de email faltante" }), { status: 500 });
    }

    // Preparar el cuerpo del email
    const productos = record.detalles_json?.productos || [];
    const productosHtmlBusiness = productos.map((p: any) => 
      `<li>${p.qty}x [${p.ref}] ${p.producto || p.nombre || p.name || 'Producto'}</li>`
    ).join('');

    const productosHtmlCustomer = productos.map((p: any) => 
      `<li>${p.qty}x ${p.producto || p.nombre || p.name || 'Producto'}</li>`
    ).join('');

    // Dirección completa
    const dirVal = record.detalles_json?.validacion_igac?.direccion_validada?.detalles;
    const extraInfo = dirVal ? ` (Urb: ${dirVal.urbanizacion || ''}, Torre: ${dirVal.torre || ''}, Apto: ${dirVal.apto || ''})`.replace(/(, )+/g, ', ').replace(/\(Urb: , /g, '(Urb: ').replace(/, \)/g, ')').replace(/\(Urb: , Torre: , Apto: \)/g, '') : '';
    const fullAddress = `${record.direccion_b2c} ${extraInfo}`.trim();

    // --- PLANTILLAS HTML (Templates) ---
    // Plantilla para el Cliente (Confirmación)
    const customerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #004E4A;">¡Hola, ${record.nombre_b2c}!</h1>
        <p>Tu pedido ha sido recibido y confirmado exitosamente.</p>
        
        <h3 style="color: #004E4A;">Detalles de Envío:</h3>
        <p>
          <strong>Ciudad:</strong> ${record.ciudad}<br>
          <strong>Dirección:</strong> ${fullAddress}<br>
          <strong>Método de Pago:</strong> ${record.detalles_json?.metodo_pago || 'No especificado'}
        </p>

        <h3 style="color: #004E4A;">Productos:</h3>
        <ul>
          ${productosHtmlCustomer}
        </ul>

        <p>Total artículos: <strong>${record.cantidad}</strong></p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Gracias por confiar en VitalPets B2C.</p>
      </div>
    `;

    // Plantilla para el Negocio (Registro Interno)
    const businessHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #D97706;">🚨 Nuevo Pedido B2C Recibido</h1>
        <p>Se ha registrado un nuevo pedido en la plataforma.</p>
        
        <h3>Datos del Cliente:</h3>
        <ul>
          <li><strong>Nombre:</strong> ${record.nombre_b2c}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Teléfono/Celular:</strong> ${record.celular || 'No proporcionado'}</li>
          <li><strong>Ciudad:</strong> ${record.ciudad}</li>
          <li><strong>Dirección:</strong> ${fullAddress}</li>
          <li><strong>Método de Pago:</strong> <strong>${record.detalles_json?.metodo_pago || 'No especificado'}</strong></li>
          <li><strong>Facturación (IVA):</strong> <span style="color: #D97706; font-weight: bold;">${record.detalles_json?.con_iva ? 'Con IVA (Requiere Factura Electrónica)' : 'Sin IVA'}</span></li>
        </ul>

        <h3>Artículos Solicitados (${record.cantidad} en total):</h3>
        <ul>
          ${productosHtmlBusiness}
        </ul>
        
        <p style="font-size: 14px; font-weight: bold; color: #333; margin-top: 20px;">ID Pedido: ${record.id}</p>
      </div>
    `;

    // Helper para enviar email con Resend
    const sendEmail = async (to: string, subject: string, html: string) => {
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: `VitalPets <${FROM_EMAIL}>`,
          to: [to],
          subject: subject,
          html: html
        })
      });
    };

    // Enviar correos en paralelo
    const [resCustomer, resBusiness] = await Promise.all([
      sendEmail(email, `Confirmación de Pedido - VitalPets`, customerHtml),
      sendEmail(BUSINESS_EMAIL, `Nuevo Pedido - ${record.nombre_b2c}`, businessHtml)
    ]);

    if (resCustomer.ok && resBusiness.ok) {
      console.log('Ambos correos enviados exitosamente');
      return new Response(JSON.stringify({ message: "Emails enviados correctamente" }), { status: 200 });
    } else {
      console.error('Error en uno o ambos correos');
      return new Response(JSON.stringify({ error: "Fallo envío de emails parcial o total" }), { status: 500 });
    }

  } catch (error) {
    console.error('Error procesando webhook:', error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
