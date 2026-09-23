-- =============================================================================
-- sql/08_update_pedidos_email.sql
-- 1. Agrega el campo email_b2c a petpro_pedidos
-- 2. Actualiza la función RPC atómica para registrar el email
--
-- Deploy: ejecutar en Supabase SQL Editor
-- =============================================================================

-- 1. Añadir columna (seguro, usa IF NOT EXISTS)
ALTER TABLE public.petpro_pedidos ADD COLUMN IF NOT EXISTS email_b2c TEXT;

-- 2. Actualizar función
CREATE OR REPLACE FUNCTION public.fn_crear_pedido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item          jsonb;
  v_ref           text;
  v_qty           int;
  v_nombre        text;
  v_stock_actual  int;
  v_pedido_id     uuid;
  v_ciudad        text;
  v_direccion_b2c text;
  v_nombre_b2c    text;
  v_email_b2c     text;
  v_celular       numeric;
  v_cantidad_total int := 0;
  v_detalles      jsonb;
BEGIN

  -- 1. Extraer datos del cliente
  v_ciudad        := p_payload ->> 'municipio';
  v_direccion_b2c := p_payload ->> 'direccion_b2c';
  v_nombre_b2c    := p_payload ->> 'nombre_b2c';
  v_email_b2c     := p_payload ->> 'email_b2c';
  v_celular       := (p_payload ->> 'celular')::numeric;
  v_detalles      := p_payload -> 'detalles_json';

  -- 2. Validar y descontar inventario (con bloqueo de fila)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items')
  LOOP
    v_ref    := v_item ->> 'ref';
    v_qty    := (v_item ->> 'qty')::int;
    v_nombre := COALESCE(v_item ->> 'nombre', v_item ->> 'name', v_ref);

    -- Bloquear la fila durante esta transacción (anti race condition)
    SELECT inventario_b2c
    INTO   v_stock_actual
    FROM   public.petpro_productos
    WHERE  ref = v_ref
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_ENCONTRADO: El producto con ref "%" no existe.', v_ref
        USING ERRCODE = 'P0001';
    END IF;

    IF v_stock_actual < v_qty THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE: "%" no tiene suficiente stock. Disponible: %, Solicitado: %.',
        v_nombre, v_stock_actual, v_qty
        USING ERRCODE = 'P0001';
    END IF;

    -- Descontar inventario (resta atómica en Postgres)
    UPDATE public.petpro_productos
    SET    inventario_b2c = inventario_b2c - v_qty
    WHERE  ref = v_ref;

    v_cantidad_total := v_cantidad_total + v_qty;
  END LOOP;

  -- 3. Insertar el pedido (solo si todo el inventario fue exitoso)
  INSERT INTO public.petpro_pedidos (
    cc_nit,
    cantidad,
    estado,
    estado_pedido,
    ciudad,
    direccion_b2c,
    nombre_b2c,
    email_b2c,
    celular,
    detalles_json
  )
  VALUES (
    NULL,
    v_cantidad_total,
    'Confirmado',
    'Confirmado',
    v_ciudad,
    v_direccion_b2c,
    v_nombre_b2c,
    v_email_b2c,
    v_celular,
    COALESCE(v_detalles, p_payload)
  )
  RETURNING id INTO v_pedido_id;

  -- 4. Retornar respuesta al frontend
  RETURN jsonb_build_object(
    'ok',         true,
    'pedido_id',  v_pedido_id,
    'estado',     'Confirmado',
    'mensaje',    'Pedido creado exitosamente.'
  );

END;
$$;

-- Otorgar permiso de ejecución a clientes B2C (rol anon y authenticated)
GRANT EXECUTE ON FUNCTION public.fn_crear_pedido(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_crear_pedido(jsonb) TO authenticated;
